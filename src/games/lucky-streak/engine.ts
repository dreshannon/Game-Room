import { MoveError, type Game } from '../types'

/**
 * A push-your-luck card game in two versions. "classic" has helpful bonuses and
 * Freeze / Flip Three / Second Chance. "revenge" has penalties played on others,
 * special numbers, and Just One More / Flip Four / Swap / Steal / Discard.
 */
export type Variant = 'classic' | 'revenge'

export type ActionName =
  | 'freeze'
  | 'flipThree'
  | 'secondChance'
  | 'justOneMore'
  | 'flipFour'
  | 'swap'
  | 'steal'
  | 'discard'

export interface NumberCard {
  id: number
  kind: 'number'
  value: number
  special?: 'zero' | 'unlucky7' | 'lucky13'
}

export interface ModifierCard {
  id: number
  kind: 'modifier'
  effect: 'plus' | 'times2' | 'minus' | 'half'
  value: number
}

export interface ActionCard {
  id: number
  kind: 'action'
  action: ActionName
}

export type Card = NumberCard | ModifierCard | ActionCard
/** A card that sits in front of a player and can be stolen, swapped, or discarded. */
export type TableCard = NumberCard | ModifierCard

export type Status = 'active' | 'stayed' | 'busted'

export interface Hand {
  numbers: NumberCard[]
  modifiers: ModifierCard[]
  secondChance: ActionCard | null
  status: Status
}

/** Work still to do before the current turn can finish, kept as a stack. */
export type Task =
  | { type: 'draw'; playerId: string }
  | { type: 'stay'; playerId: string }
  | { type: 'flip'; playerId: string; remaining: number; queued: Card[] }
  | { type: 'resolve'; playerId: string; cards: Card[] }

/** A decision someone has to make before play can continue. */
export type Choice =
  | { kind: 'target'; playerId: string; card: ActionCard | ModifierCard; options: string[] }
  | { kind: 'steal' | 'swap' | 'discard'; playerId: string; card: ActionCard }

export type LogEntry =
  | { id: number; type: 'draw' | 'deal'; playerId: string; card: Card }
  | { id: number; type: 'bust' | 'saved' | 'stay' | 'flip7' | 'unlucky' | 'forcedStay'; playerId: string }
  | { id: number; type: 'played'; playerId: string; card: Card; targetId: string }
  | { id: number; type: 'fizzled'; playerId: string; card: Card }
  | { id: number; type: 'stole'; playerId: string; card: TableCard; fromId: string }
  | {
      id: number
      type: 'swapped'
      playerId: string
      first: TableCard
      firstOwnerId: string
      second: TableCard
      secondOwnerId: string
    }
  | { id: number; type: 'discarded'; playerId: string; card: TableCard; ownerId: string }
  | { id: number; type: 'reshuffled' }

export interface StreakState {
  variant: Variant
  order: string[]
  dealerIndex: number
  round: number
  targetScore: number
  phase: 'playing' | 'roundOver'
  deck: Card[]
  discardPile: Card[]
  hands: Record<string, Hand>
  dealQueue: string[]
  stack: Task[]
  choice: Choice | null
  turnIndex: number | null
  /** Set once the turn player has hit or stayed, so the turn moves on when everything resolves. */
  turnDone: boolean
  flip7PlayerId: string | null
  scores: Record<string, number>
  roundScores: Record<string, number> | null
  log: LogEntry[]
  nextId: number
}

export interface StreakView {
  variant: Variant
  order: string[]
  dealerId: string
  round: number
  targetScore: number
  phase: StreakState['phase']
  deckCount: number
  discardCount: number
  hands: Record<string, Hand>
  choice: Choice | null
  turnPlayerId: string | null
  flip7PlayerId: string | null
  scores: Record<string, number>
  roundScores: Record<string, number> | null
  log: LogEntry[]
}

export type StreakMove =
  | { type: 'hit' }
  | { type: 'stay' }
  | { type: 'target'; playerId: string }
  | { type: 'steal'; ownerId: string; cardId: number }
  | { type: 'discard'; ownerId: string; cardId: number }
  | {
      type: 'swap'
      first: { ownerId: string; cardId: number }
      second: { ownerId: string; cardId: number }
    }
  | { type: 'nextRound'; round: number }

export const DEFAULT_TARGET_SCORE = 200
export const FLIP_7_BONUS = 15
const LOG_LENGTH = 10

// ---------------------------------------------------------------------------
// Deck

export function buildDeck(variant: Variant): Card[] {
  const deck: Card[] = []
  const add = (card: DistributiveOmit<Card, 'id'>) => deck.push({ ...card, id: deck.length } as Card)

  if (variant === 'classic') {
    add({ kind: 'number', value: 0 })
    for (let value = 1; value <= 12; value++) {
      for (let copy = 0; copy < value; copy++) add({ kind: 'number', value })
    }
    for (const value of [2, 4, 6, 8, 10]) add({ kind: 'modifier', effect: 'plus', value })
    add({ kind: 'modifier', effect: 'times2', value: 2 })
    for (const action of ['freeze', 'flipThree', 'secondChance'] as const) {
      for (let copy = 0; copy < 3; copy++) add({ kind: 'action', action })
    }
  } else {
    add({ kind: 'number', value: 0, special: 'zero' })
    for (let value = 1; value <= 13; value++) {
      for (let copy = 0; copy < value; copy++) {
        const special = copy === 0 && value === 7 ? 'unlucky7' : copy === 0 && value === 13 ? 'lucky13' : undefined
        add(special ? { kind: 'number', value, special } : { kind: 'number', value })
      }
    }
    for (const value of [2, 4, 6, 8, 10]) add({ kind: 'modifier', effect: 'minus', value })
    add({ kind: 'modifier', effect: 'half', value: 2 })
    for (const action of ['justOneMore', 'flipFour', 'swap', 'steal', 'discard'] as const) {
      for (let copy = 0; copy < 2; copy++) add({ kind: 'action', action })
    }
  }
  return deck
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

// ---------------------------------------------------------------------------
// Scoring

export function scoreHand(variant: Variant, hand: Hand, flippedSeven: boolean) {
  if (hand.status === 'busted') return 0
  const bonus = flippedSeven ? FLIP_7_BONUS : 0
  let total = hand.numbers.reduce((sum, card) => sum + card.value, 0)

  if (variant === 'classic') {
    if (hand.modifiers.some((card) => card.effect === 'times2')) total *= 2
    for (const card of hand.modifiers) if (card.effect === 'plus') total += card.value
    return total + bonus
  }

  if (hand.numbers.some((card) => card.special === 'zero') && !flippedSeven) return 0
  if (hand.modifiers.some((card) => card.effect === 'half')) total = Math.floor(total / 2)
  for (const card of hand.modifiers) if (card.effect === 'minus') total -= card.value
  return Math.max(0, total) + bonus
}

// ---------------------------------------------------------------------------
// Helpers that change a working copy of the state

const mod = (value: number, size: number) => ((value % size) + size) % size

function log(state: StreakState, entry: DistributiveOmit<LogEntry, 'id'>) {
  state.log = [...state.log, { ...entry, id: state.nextId++ } as LogEntry].slice(-LOG_LENGTH)
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

const isPlaying = (state: StreakState) => state.phase === 'playing'
const statusOf = (state: StreakState, playerId: string) => state.hands[playerId]?.status
const notBusted = (state: StreakState) =>
  state.order.filter((id) => statusOf(state, id) !== 'busted')
const active = (state: StreakState) => state.order.filter((id) => statusOf(state, id) === 'active')
const tableCards = (hand: Hand): TableCard[] => [...hand.numbers, ...hand.modifiers]

function drawCard(state: StreakState): Card | null {
  if (state.deck.length === 0) {
    if (state.discardPile.length === 0) return null
    state.deck = shuffle(state.discardPile)
    state.discardPile = []
    log(state, { type: 'reshuffled' })
  }
  return state.deck.pop() ?? null
}

function bust(state: StreakState, playerId: string) {
  const hand = state.hands[playerId]!
  hand.status = 'busted'
  if (hand.secondChance) {
    state.discardPile.push(hand.secondChance)
    hand.secondChance = null
  }
  log(state, { type: 'bust', playerId })
}

/** Adds a number card to a player's line, by drawing, stealing, or swapping. */
function addNumber(state: StreakState, playerId: string, card: NumberCard) {
  const hand = state.hands[playerId]!

  if (state.variant === 'revenge' && card.special === 'unlucky7') {
    state.discardPile.push(...hand.numbers, ...hand.modifiers)
    hand.numbers = [card]
    hand.modifiers = []
    log(state, { type: 'unlucky', playerId })
    return
  }

  const matching = hand.numbers.filter((held) => held.value === card.value).length
  const hasLucky13 =
    state.variant === 'revenge' &&
    card.value === 13 &&
    (card.special === 'lucky13' || hand.numbers.some((held) => held.special === 'lucky13'))
  const allowed = hasLucky13 ? 2 : 1

  if (matching >= allowed) {
    if (hand.secondChance) {
      state.discardPile.push(card, hand.secondChance)
      hand.secondChance = null
      log(state, { type: 'saved', playerId })
      return
    }
    hand.numbers.push(card)
    bust(state, playerId)
    return
  }

  hand.numbers.push(card)
  if (hand.numbers.length >= 7) {
    state.flip7PlayerId = playerId
    log(state, { type: 'flip7', playerId })
    endRound(state)
  }
}

function giveTableCard(state: StreakState, playerId: string, card: TableCard) {
  if (card.kind === 'number') addNumber(state, playerId, card)
  else state.hands[playerId]!.modifiers.push(card)
}

function removeTableCard(hand: Hand, cardId: number): TableCard | null {
  const numberIndex = hand.numbers.findIndex((card) => card.id === cardId)
  if (numberIndex !== -1) return hand.numbers.splice(numberIndex, 1)[0]!
  const modifierIndex = hand.modifiers.findIndex((card) => card.id === cardId)
  if (modifierIndex !== -1) return hand.modifiers.splice(modifierIndex, 1)[0]!
  return null
}

/** Who an action could be used on right now. Empty means it has no valid target. */
function actionOptions(state: StreakState, actorId: string, action: ActionName): string[] {
  switch (action) {
    case 'freeze':
    case 'flipThree':
      return active(state)
    case 'secondChance':
      return active(state).filter((id) => id !== actorId && !state.hands[id]!.secondChance)
    case 'justOneMore':
    case 'flipFour':
      return notBusted(state)
    case 'steal':
      if (statusOf(state, actorId) === 'busted') return []
      return notBusted(state).filter((id) => id !== actorId && tableCards(state.hands[id]!).length)
    case 'discard':
      return notBusted(state).filter((id) => tableCards(state.hands[id]!).length)
    case 'swap': {
      const holders = notBusted(state).filter((id) => tableCards(state.hands[id]!).length)
      return holders.length >= 2 ? holders : []
    }
  }
}

/** Resolves a card a player has just drawn, or is now resolving after a Flip. */
function resolveCard(state: StreakState, playerId: string, card: Card) {
  if (card.kind === 'number') return addNumber(state, playerId, card)

  if (card.kind === 'modifier') {
    if (state.variant === 'classic') return void state.hands[playerId]!.modifiers.push(card)
    // Penalties go on any player still in, including yourself if nobody else is.
    const options = notBusted(state)
    if (options.length === 0) return void state.discardPile.push(card)
    if (options.length === 1) return applyToTarget(state, playerId, card, options[0]!)
    state.choice = { kind: 'target', playerId, card, options }
    return
  }

  const hand = state.hands[playerId]!
  if (card.action === 'secondChance' && !hand.secondChance && hand.status !== 'busted') {
    hand.secondChance = card
    return
  }

  const options = actionOptions(state, playerId, card.action)
  if (options.length === 0) {
    state.discardPile.push(card)
    log(state, { type: 'fizzled', playerId, card })
    return
  }
  if (card.action === 'steal' || card.action === 'swap' || card.action === 'discard') {
    state.choice = { kind: card.action, playerId, card }
    return
  }
  if (options.length === 1) return applyToTarget(state, playerId, card, options[0]!)
  state.choice = { kind: 'target', playerId, card, options }
}

function applyToTarget(
  state: StreakState,
  actorId: string,
  card: ActionCard | ModifierCard,
  targetId: string,
) {
  log(state, { type: 'played', playerId: actorId, card, targetId })
  const target = state.hands[targetId]!

  if (card.kind === 'modifier') return void target.modifiers.push(card)

  switch (card.action) {
    case 'secondChance':
      target.secondChance = card
      return
    case 'freeze':
      target.status = 'stayed'
      break
    case 'flipThree':
      state.stack.push({ type: 'flip', playerId: targetId, remaining: 3, queued: [] })
      break
    case 'flipFour':
      state.stack.push({ type: 'flip', playerId: targetId, remaining: 4, queued: [] })
      break
    case 'justOneMore':
      // The draw happens first, and the player is made to stay once it's resolved.
      state.stack.push({ type: 'stay', playerId: targetId }, { type: 'draw', playerId: targetId })
      break
  }
  state.discardPile.push(card)
}

/** Whether a card drawn during a Flip waits until the Flip is over. */
function waitsDuringFlip(state: StreakState, playerId: string, card: Card) {
  if (card.kind === 'number') return false
  if (state.variant === 'revenge') return true
  if (card.kind === 'modifier') return false
  // A first Second Chance is useful straight away, against the rest of the Flip.
  return !(card.action === 'secondChance' && !state.hands[playerId]!.secondChance)
}

function processTask(state: StreakState, task: Task) {
  switch (task.type) {
    case 'draw': {
      state.stack.pop()
      if (statusOf(state, task.playerId) === 'busted') return
      const card = drawCard(state)
      if (!card) return endRound(state)
      log(state, { type: 'draw', playerId: task.playerId, card })
      return resolveCard(state, task.playerId, card)
    }

    case 'stay': {
      state.stack.pop()
      if (statusOf(state, task.playerId) === 'active') {
        state.hands[task.playerId]!.status = 'stayed'
        log(state, { type: 'forcedStay', playerId: task.playerId })
      }
      return
    }

    case 'flip': {
      const busted = statusOf(state, task.playerId) === 'busted'
      if (busted || task.remaining === 0) {
        state.stack.pop()
        if (busted) state.discardPile.push(...task.queued)
        else if (task.queued.length) state.stack.push({ type: 'resolve', playerId: task.playerId, cards: task.queued })
        return
      }
      task.remaining -= 1
      const card = drawCard(state)
      if (!card) return endRound(state)
      log(state, { type: 'draw', playerId: task.playerId, card })
      if (waitsDuringFlip(state, task.playerId, card)) task.queued.push(card)
      else resolveCard(state, task.playerId, card)
      return
    }

    case 'resolve': {
      const card = task.cards.shift()
      if (task.cards.length === 0) state.stack.pop()
      if (card) resolveCard(state, task.playerId, card)
      return
    }
  }
}

function endRound(state: StreakState) {
  for (const task of state.stack) {
    if (task.type === 'flip') state.discardPile.push(...task.queued)
    if (task.type === 'resolve') state.discardPile.push(...task.cards)
  }
  if (state.choice) state.discardPile.push(state.choice.card)
  state.stack = []
  state.choice = null
  state.turnIndex = null
  state.phase = 'roundOver'

  const roundScores: Record<string, number> = {}
  for (const id of state.order) {
    roundScores[id] = scoreHand(state.variant, state.hands[id]!, state.flip7PlayerId === id)
    state.scores[id] = (state.scores[id] ?? 0) + roundScores[id]
  }
  state.roundScores = roundScores
}

function advanceTurn(state: StreakState) {
  const base = state.turnIndex ?? state.dealerIndex
  for (let step = 1; step <= state.order.length; step++) {
    const index = mod(base + step, state.order.length)
    if (statusOf(state, state.order[index]!) === 'active') {
      state.turnIndex = index
      state.turnDone = false
      return
    }
  }
}

/** Keeps the game moving until someone has to decide something or the round ends. */
function run(state: StreakState) {
  for (let guard = 0; guard < 10_000 && isPlaying(state) && !state.choice; guard++) {
    const task = state.stack.at(-1)
    if (task) {
      processTask(state, task)
      continue
    }

    const dealTo = state.dealQueue.shift()
    if (dealTo !== undefined) {
      if (statusOf(state, dealTo) !== 'active') continue
      const card = drawCard(state)
      if (!card) return endRound(state)
      log(state, { type: 'deal', playerId: dealTo, card })
      resolveCard(state, dealTo, card)
      continue
    }

    if (active(state).length === 0) return endRound(state)

    const turnPlayer = state.turnIndex === null ? undefined : state.order[state.turnIndex]
    if (state.turnDone || !turnPlayer || statusOf(state, turnPlayer) !== 'active') {
      advanceTurn(state)
      continue
    }
    return
  }
}

function startRound(state: StreakState) {
  for (const hand of Object.values(state.hands)) {
    state.discardPile.push(...hand.numbers, ...hand.modifiers)
    if (hand.secondChance) state.discardPile.push(hand.secondChance)
  }
  state.hands = Object.fromEntries(
    state.order.map((id) => [id, { numbers: [], modifiers: [], secondChance: null, status: 'active' }]),
  )
  state.dealerIndex = mod(state.dealerIndex + 1, state.order.length)
  state.round += 1
  state.phase = 'playing'
  state.dealQueue = state.order.map((_, step) => state.order[mod(state.dealerIndex + 1 + step, state.order.length)]!)
  state.stack = []
  state.choice = null
  state.turnIndex = null
  state.turnDone = false
  state.flip7PlayerId = null
  state.roundScores = null
  state.log = []
  run(state)
}

/** Builds a game. Tests pass `deck` (drawn from the end) to control which cards come up. */
export function createGame(
  variant: Variant,
  playerIds: string[],
  targetScore: number,
  deck?: Card[],
): StreakState {
  const state: StreakState = {
    variant,
    order: [...playerIds],
    // Moves forward to the first player when the first round starts.
    dealerIndex: playerIds.length - 1,
    round: 0,
    targetScore,
    phase: 'playing',
    deck: deck ?? shuffle(buildDeck(variant)),
    discardPile: [],
    hands: {},
    dealQueue: [],
    stack: [],
    choice: null,
    turnIndex: null,
    turnDone: false,
    flip7PlayerId: null,
    scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
    roundScores: null,
    log: [],
    nextId: 0,
  }
  startRound(state)
  return state
}

// ---------------------------------------------------------------------------
// Moves

function requireIdle(state: StreakState) {
  if (!isPlaying(state)) throw new MoveError('The round is over.')
  if (state.choice) throw new MoveError('Waiting for a choice to be made.')
}

function requireTurn(state: StreakState, playerId: string) {
  requireIdle(state)
  if (state.turnIndex === null || state.order[state.turnIndex] !== playerId) {
    throw new MoveError('It’s not your turn.')
  }
}

function findTableCard(state: StreakState, ownerId: unknown, cardId: unknown) {
  if (typeof ownerId !== 'string' || statusOf(state, ownerId) === undefined) {
    throw new MoveError('Choose a player in the game.')
  }
  if (statusOf(state, ownerId) === 'busted') throw new MoveError('That player has busted.')
  const card = tableCards(state.hands[ownerId]!).find((held) => held.id === cardId)
  if (!card) throw new MoveError('Choose one of that player’s cards.')
  return card
}

function applyChoice(state: StreakState, playerId: string, move: Record<string, unknown>) {
  const choice = state.choice
  if (!choice) throw new MoveError('There’s nothing to choose right now.')
  if (choice.playerId !== playerId) throw new MoveError('Someone else is choosing.')
  if (move.type !== choice.kind) throw new MoveError('That isn’t the choice being made.')

  if (choice.kind === 'target') {
    if (typeof move.playerId !== 'string' || !choice.options.includes(move.playerId)) {
      throw new MoveError('You can’t choose that player.')
    }
    state.choice = null
    return applyToTarget(state, playerId, choice.card, move.playerId)
  }

  if (choice.kind === 'steal') {
    if (move.ownerId === playerId) throw new MoveError('Steal from another player.')
    const card = findTableCard(state, move.ownerId, move.cardId)
    state.choice = null
    state.discardPile.push(choice.card)
    removeTableCard(state.hands[move.ownerId as string]!, card.id)
    log(state, { type: 'stole', playerId, card, fromId: move.ownerId as string })
    return giveTableCard(state, playerId, card)
  }

  if (choice.kind === 'discard') {
    const card = findTableCard(state, move.ownerId, move.cardId)
    state.choice = null
    state.discardPile.push(choice.card)
    removeTableCard(state.hands[move.ownerId as string]!, card.id)
    state.discardPile.push(card)
    log(state, { type: 'discarded', playerId, card, ownerId: move.ownerId as string })
    return
  }

  const first = (move.first ?? {}) as Record<string, unknown>
  const second = (move.second ?? {}) as Record<string, unknown>
  if (first.ownerId === second.ownerId) throw new MoveError('Swap cards between two different players.')
  const firstCard = findTableCard(state, first.ownerId, first.cardId)
  const secondCard = findTableCard(state, second.ownerId, second.cardId)
  const firstOwner = first.ownerId as string
  const secondOwner = second.ownerId as string
  state.choice = null
  state.discardPile.push(choice.card)
  removeTableCard(state.hands[firstOwner]!, firstCard.id)
  removeTableCard(state.hands[secondOwner]!, secondCard.id)
  log(state, {
    type: 'swapped',
    playerId,
    first: firstCard,
    firstOwnerId: firstOwner,
    second: secondCard,
    secondOwnerId: secondOwner,
  })
  // Either player can bust from what they receive, so both are checked.
  giveTableCard(state, firstOwner, secondCard)
  if (isPlaying(state)) giveTableCard(state, secondOwner, firstCard)
  else state.discardPile.push(firstCard)
}

export function applyStreakMove(state: StreakState, playerId: string, rawMove: unknown): StreakState {
  if (!state.order.includes(playerId)) throw new MoveError('You are not playing in this game.')
  const move = (rawMove ?? {}) as Record<string, unknown>
  const next = structuredClone(state)

  switch (move.type) {
    case 'hit': {
      requireTurn(next, playerId)
      next.turnDone = true
      const card = drawCard(next)
      if (!card) {
        endRound(next)
        return next
      }
      log(next, { type: 'draw', playerId, card })
      resolveCard(next, playerId, card)
      break
    }

    case 'stay': {
      requireTurn(next, playerId)
      const hand = next.hands[playerId]!
      if (hand.numbers.some((card) => card.special === 'zero')) {
        throw new MoveError('While you hold the Zero, you have to keep flipping.')
      }
      hand.status = 'stayed'
      next.turnDone = true
      log(next, { type: 'stay', playerId })
      break
    }

    case 'target':
    case 'steal':
    case 'discard':
    case 'swap':
      applyChoice(next, playerId, move)
      break

    case 'nextRound': {
      // Two players clicking at once shouldn't skip a whole round.
      if (move.round !== next.round) return state
      if (next.phase !== 'roundOver') throw new MoveError('The round isn’t over yet.')
      if (streakResult(next)) throw new MoveError('The game is over.')
      startRound(next)
      return next
    }

    default:
      throw new MoveError('That move isn’t recognized.')
  }

  run(next)
  return next
}

export function streakResult(state: StreakState) {
  if (state.phase !== 'roundOver') return null
  const top = Math.max(...state.order.map((id) => state.scores[id] ?? 0))
  if (top < state.targetScore) return null
  return { winnerIds: state.order.filter((id) => state.scores[id] === top) }
}

export function streakWaitingOn(state: StreakState) {
  if (state.choice) return [state.choice.playerId]
  if (!isPlaying(state) || state.turnIndex === null) return []
  return [state.order[state.turnIndex]!]
}

export function viewStreak(state: StreakState): StreakView {
  return {
    variant: state.variant,
    order: state.order,
    dealerId: state.order[state.dealerIndex]!,
    round: state.round,
    targetScore: state.targetScore,
    phase: state.phase,
    deckCount: state.deck.length,
    discardCount: state.discardPile.length,
    hands: state.hands,
    choice: state.choice,
    turnPlayerId: state.turnIndex === null ? null : state.order[state.turnIndex]!,
    flip7PlayerId: state.flip7PlayerId,
    scores: state.scores,
    roundScores: state.roundScores,
    log: state.log,
  }
}

export function streakPlayerLeft(state: StreakState, playerId: string): StreakState | null {
  const index = state.order.indexOf(playerId)
  if (index === -1) return state
  if (state.order.length <= 2) return null
  const next = structuredClone(state)
  const hand = next.hands[playerId]!
  next.discardPile.push(...hand.numbers, ...hand.modifiers)
  if (hand.secondChance) next.discardPile.push(hand.secondChance)
  delete next.hands[playerId]
  delete next.scores[playerId]
  if (next.roundScores) delete next.roundScores[playerId]

  next.order.splice(index, 1)
  next.dealQueue = next.dealQueue.filter((id) => id !== playerId)
  next.stack = next.stack.filter((task) => {
    if (task.playerId !== playerId) return true
    if (task.type === 'flip') next.discardPile.push(...task.queued)
    if (task.type === 'resolve') next.discardPile.push(...task.cards)
    return false
  })

  const choice = next.choice
  if (choice?.playerId === playerId) {
    next.discardPile.push(choice.card)
    next.choice = null
  } else if (choice?.kind === 'target') {
    choice.options = choice.options.filter((id) => id !== playerId)
    if (choice.options.length === 0) {
      next.discardPile.push(choice.card)
      next.choice = null
    }
  } else if (choice && actionOptions(next, choice.playerId, choice.card.action).length === 0) {
    next.discardPile.push(choice.card)
    next.choice = null
  }

  // Positions after the leaver shift down by one.
  if (index <= next.dealerIndex) next.dealerIndex -= 1
  if (next.turnIndex !== null) {
    if (index === next.turnIndex) next.turnDone = true
    if (index <= next.turnIndex) next.turnIndex -= 1
  }
  // Wrapping round keeps "the position before the first player" pointing at the last one.
  next.dealerIndex = mod(next.dealerIndex, next.order.length)
  if (next.turnIndex !== null) next.turnIndex = mod(next.turnIndex, next.order.length)

  if (isPlaying(next)) run(next)
  return next
}

// ---------------------------------------------------------------------------
// The two games

function defineVariant(variant: Variant, id: string, name: string): Game<StreakState, StreakView> {
  return {
    id,
    name,
    minPlayers: 2,
    maxPlayers: 8,
    options: [
      { key: 'targetScore', label: 'Play to', min: 50, max: 500, default: DEFAULT_TARGET_SCORE },
    ],
    setup: (playerIds, options) =>
      createGame(variant, playerIds, options.targetScore ?? DEFAULT_TARGET_SCORE),
    applyMove: applyStreakMove,
    viewFor: viewStreak,
    result: streakResult,
    waitingOn: streakWaitingOn,
    onPlayerLeave: streakPlayerLeft,
  }
}

export const luckyStreak = defineVariant('classic', 'lucky-streak', 'Lucky Streak')
export const luckyStreakRevenge = defineVariant('revenge', 'lucky-streak-revenge', 'Lucky Streak: Revenge')

export function cardName(card: Card): string {
  if (card.kind === 'number') {
    if (card.special === 'zero') return 'the Zero'
    if (card.special === 'unlucky7') return 'Unlucky 7'
    if (card.special === 'lucky13') return 'Lucky 13'
    return String(card.value)
  }
  if (card.kind === 'modifier') {
    return { plus: `+${card.value}`, times2: '×2', minus: `−${card.value}`, half: '÷2' }[card.effect]
  }
  return ACTION_NAMES[card.action]
}

export const ACTION_NAMES: Record<ActionName, string> = {
  freeze: 'Freeze',
  flipThree: 'Flip Three',
  secondChance: 'Second Chance',
  justOneMore: 'Just One More',
  flipFour: 'Flip Four',
  swap: 'Swap',
  steal: 'Steal',
  discard: 'Discard',
}
