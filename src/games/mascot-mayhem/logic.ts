import { MoveError, type Game } from '../types'
import {
  MASCOTS,
  MASCOT_TICKETS,
  RACE_DECK_SIZE,
  SIDE_BETS,
  allCards,
  sideTicketValues,
  type MascotTicketValues,
  type SideTicketValues,
} from './data'
import {
  BURN,
  FINISH,
  playNext,
  shuffle,
  startRace,
  type Mascot,
  type RaceCard,
  type RaceEvent,
  type RaceState,
} from './race'

export const RACES = 3
export const STARTING_MONEY = 10
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 15
/** From this many players, everyone bets at once and winners split pots. */
export const POTS_FROM = 9
export const POTS = { first: 18, second: 12, third: 6, side: 18 }
/** Piles 0–3 are the mascots. These two are the side bet. */
export const YES_PILE = 4
export const NO_PILE = 5
const PILE_COUNT = 6
const TICKETS_PER_PILE = 3

/** Milliseconds between cards, by speed setting. */
export const CARD_DELAYS = [2600, 1700, 1000]
const COUNTDOWN_DELAY = 900
const FOLD_DELAY_BONUS = 1400

export type Side = 'safe' | 'risky'
export type Phase = 'draft' | 'double' | 'bets' | 'stack' | 'race' | 'results' | 'over'

export interface HeldTicket {
  pile: number
  /** 0 is the best ticket in its pile. */
  rank: number
  side: Side
  doubled: boolean
}

/** A bet in pots mode: just a pile. */
export interface PotBet {
  pile: number
  doubled: boolean
}

export interface PayoutLine {
  pile: number
  side: Side | null
  doubled: boolean
  amount: number
}

export interface PlayerState {
  id: string
  money: number
  hand: RaceCard[]
  tickets: HeldTicket[]
  bets: PotBet[] | null
  /** Cards put into the race deck this race, while choosing. */
  stacked: boolean
  /** Picked a ticket to double, in race 3. */
  doubled: boolean
  lines: PayoutLine[]
  /** Winnings per race. */
  history: number[]
}

export interface RevealedCard {
  seq: number
  card: RaceCard | null
  events: RaceEvent[]
}

export interface MayhemState {
  mode: 'draft' | 'pots'
  race: number
  phase: Phase
  players: PlayerState[]
  /** Tickets left in each pile. The top ticket's rank is TICKETS_PER_PILE minus this. */
  piles: number[]
  draftOrder: string[]
  draftIndex: number
  firstDrafter: string
  sideBets: number[]
  sideBet: number
  /** Cards that are in no deck or hand. */
  pool: RaceCard[]
  /** The race deck, between races. */
  deck: RaceCard[]
  run: RaceState | null
  countdown: number
  paused: boolean
  speed: number
  seq: number
  revealed: RevealedCard[]
  /** Final places of the last race, by mascot. */
  places: number[] | null
  sideResult: boolean | null
}

export interface TicketOffer {
  pile: number
  left: number
  rank: number | null
  mascot: MascotTicketValues | null
  side: SideTicketValues | null
}

export interface PlayerView {
  id: string
  money: number
  handCount: number
  tickets: HeldTicket[]
  /** Pots-mode bets are hidden until the race starts. */
  bets: PotBet[] | null
  betPlaced: boolean
  stacked: boolean
  doubled: boolean
  lines: PayoutLine[]
  history: number[]
}

export interface MayhemView {
  mode: MayhemState['mode']
  race: number
  phase: Phase
  players: PlayerView[]
  offers: TicketOffer[]
  draftOrder: string[]
  draftIndex: number
  sideBet: { id: number; question: string; chance: number }
  /** Shown face up in pots mode while betting. */
  openDeck: RaceCard[] | null
  hand: RaceCard[]
  stackCount: number
  mascots: Mascot[]
  back: number
  folds: number
  deckLeft: number
  countdown: number
  paused: boolean
  speed: number
  revealed: RevealedCard[]
  places: number[] | null
  sideResult: boolean | null
}

export type MayhemMove =
  | { type: 'take'; pile: number; side: Side }
  | { type: 'double'; index: number }
  | { type: 'bets'; piles: number[]; double?: number }
  | { type: 'stack'; cards: number[] }
  | { type: 'pause'; paused: boolean }
  | { type: 'speed'; speed: number }
  | { type: 'nextRace'; race: number }

const isPots = (state: MayhemState) => state.mode === 'pots'
const isMascotPile = (pile: number) => pile >= 0 && pile < MASCOTS.length
const isPile = (pile: unknown): pile is number => Number.isInteger(pile) && (pile as number) >= 0 && (pile as number) < PILE_COUNT
/** Two players each put in, and are dealt, two cards a race. Everyone else, one. */
export const stackCount = (players: number) => (players === 2 ? 2 : 1)
const handSize = (players: number) => (players === 2 ? 4 : 3)
const picksEach = (players: number) => (players === 2 ? 3 : 2)

function findPlayer(state: MayhemState, playerId: string) {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new MoveError('You are not in this game.')
  return player
}

const sideBetOf = (state: MayhemState) => SIDE_BETS.find((bet) => bet.id === state.sideBet)!

function chanceRight(state: MayhemState, pile: number) {
  const chance = sideBetOf(state).chance
  return pile === YES_PILE ? chance : 1 - chance
}

/** Snake order: forward, back, forward… starting from the first drafter. */
function snakeOrder(state: MayhemState) {
  const ids = state.players.map((p) => p.id)
  const start = Math.max(0, ids.indexOf(state.firstDrafter))
  const forward = [...ids.slice(start), ...ids.slice(0, start)]
  const order: string[] = []
  for (let round = 0; round < picksEach(ids.length); round++) {
    order.push(...(round % 2 === 0 ? forward : [...forward].reverse()))
  }
  return order
}

/** The poorest player drafts first. Ties go to whoever comes next after the last first drafter. */
function pickFirstDrafter(state: MayhemState) {
  const ids = state.players.map((p) => p.id)
  const start = (ids.indexOf(state.firstDrafter) + 1) % ids.length
  const rotated = [...ids.slice(start), ...ids.slice(0, start)]
  const poorest = Math.min(...state.players.map((p) => p.money))
  return rotated.find((id) => findPlayer(state, id).money === poorest)!
}

function deal(state: MayhemState, count: number) {
  for (const player of state.players) player.hand.push(...state.deck.splice(0, count))
}

/** Gets everything ready for the betting part of a race. */
function beginRace(state: MayhemState) {
  state.piles = Array(PILE_COUNT).fill(TICKETS_PER_PILE)
  state.run = null
  state.revealed = []
  state.places = null
  state.sideResult = null
  state.countdown = 0
  for (const player of state.players) {
    player.tickets = []
    player.bets = null
    player.stacked = false
    player.doubled = false
    player.lines = []
  }
  if (isPots(state)) {
    state.phase = 'bets'
    return
  }
  state.draftOrder = snakeOrder(state)
  state.draftIndex = 0
  state.phase = 'draft'
}

function finishDraft(state: MayhemState) {
  state.phase = state.race === RACES ? 'double' : 'stack'
}

function maybeStartRunning(state: MayhemState) {
  if (state.phase === 'stack' && state.players.every((p) => p.stacked)) startRunning(state)
  if (state.phase === 'bets' && state.players.every((p) => p.bets)) startRunning(state)
}

function startRunning(state: MayhemState) {
  state.run = startRace(state.deck)
  state.deck = []
  state.phase = 'race'
  state.countdown = 3
  state.revealed = []
}

/** Pays out every ticket once the race is over. */
function payOut(state: MayhemState) {
  const run = state.run!
  const places = run.mascots.map((m) => m.place!)
  const sideResult = sideBetOf(state).test(run)
  state.places = places
  state.sideResult = sideResult

  if (isPots(state)) {
    const pots: { pot: number; wins: (pile: number) => boolean }[] = [
      { pot: POTS.first, wins: (pile) => isMascotPile(pile) && places[pile] === 1 },
      { pot: POTS.second, wins: (pile) => isMascotPile(pile) && places[pile] === 2 },
      { pot: POTS.third, wins: (pile) => isMascotPile(pile) && places[pile] === 3 },
      { pot: POTS.side, wins: (pile) => (pile === YES_PILE ? sideResult : pile === NO_PILE ? !sideResult : false) },
    ]
    for (const { pot, wins } of pots) {
      const shares = state.players.flatMap((p) => (p.bets ?? []).filter((b) => wins(b.pile)).map((b) => (b.doubled ? 2 : 1)))
      const total = shares.reduce((a, b) => a + b, 0)
      if (!total) continue
      const each = Math.floor(pot / total)
      for (const player of state.players) {
        for (const bet of player.bets ?? []) {
          if (!wins(bet.pile)) continue
          player.lines.push({ pile: bet.pile, side: null, doubled: bet.doubled, amount: each * (bet.doubled ? 2 : 1) })
        }
      }
    }
    for (const player of state.players) {
      for (const bet of player.bets ?? []) {
        if (!player.lines.some((line) => line.pile === bet.pile)) {
          player.lines.push({ pile: bet.pile, side: null, doubled: bet.doubled, amount: 0 })
        }
      }
    }
  } else {
    for (const player of state.players) {
      player.lines = player.tickets.map((ticket) => {
        let amount: number
        if (isMascotPile(ticket.pile)) {
          const values = MASCOT_TICKETS[ticket.rank]!
          const place = places[ticket.pile]!
          amount = ticket.side === 'risky' ? (place === 1 ? values.risky : 0) : place <= 3 ? values.safe[place - 1]! : 0
        } else {
          const right = ticket.pile === YES_PILE ? sideResult : !sideResult
          const values = sideTicketValues(chanceRight(state, ticket.pile), ticket.rank)
          amount = ticket.side === 'risky' ? (right ? values.risky : -values.riskyLoss) : right ? values.safe : 0
        }
        return { pile: ticket.pile, side: ticket.side, doubled: ticket.doubled, amount: amount * (ticket.doubled ? 2 : 1) }
      })
    }
  }

  for (const player of state.players) {
    const total = player.lines.reduce((sum, line) => sum + line.amount, 0)
    // You can't owe more than you have.
    const change = Math.max(-player.money, total)
    player.money += change
    player.history.push(change)
  }
  state.phase = state.race === RACES ? 'over' : 'results'
}

/** Puts the race deck back together after a race, and deals everyone their next card. */
function setUpNextRace(state: MayhemState) {
  const run = state.run!
  state.deck = shuffle([...run.deck, ...run.burned, ...run.played])
  state.run = null
  state.race++
  state.sideBets.push(state.sideBets.shift()!)
  state.sideBet = state.sideBets[0]!
  if (isPots(state)) {
    // Swap three random cards for new ones, and show the deck to everyone.
    const swap = state.deck.filter((card) => !card.starter)
    const out = shuffle(swap).slice(0, 3)
    state.deck = state.deck.filter((card) => !out.includes(card))
    state.pool = shuffle([...state.pool, ...out])
    state.deck.push(...state.pool.splice(0, 3))
  } else {
    deal(state, stackCount(state.players.length))
    state.firstDrafter = pickFirstDrafter(state)
  }
  beginRace(state)
}

function cardsIn(player: PlayerState, ids: unknown, count: number) {
  if (!Array.isArray(ids) || ids.length !== count || new Set(ids).size !== count) {
    throw new MoveError(`Pick ${count} card${count === 1 ? '' : 's'} from your hand.`)
  }
  const cards = ids.map((id) => player.hand.find((card) => card.id === id))
  if (cards.some((card) => !card)) throw new MoveError('Those cards are not in your hand.')
  return cards as RaceCard[]
}

export const mascotMayhem: Game<MayhemState, MayhemView> = {
  id: 'mascot-mayhem',
  name: 'Mascot Mayhem',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  setup(playerIds) {
    const cards = allCards()
    const starters = cards.filter((card) => card.starter)
    const pool = shuffle(cards.filter((card) => !card.starter))
    const pots = playerIds.length >= POTS_FROM
    const players: PlayerState[] = playerIds.map((id) => ({
      id,
      money: STARTING_MONEY,
      hand: [],
      tickets: [],
      bets: null,
      stacked: false,
      doubled: false,
      lines: [],
      history: [],
    }))
    const sideBets = shuffle(SIDE_BETS.map((bet) => bet.id))
    const state: MayhemState = {
      mode: pots ? 'pots' : 'draft',
      race: 1,
      phase: 'draft',
      players,
      piles: [],
      draftOrder: [],
      draftIndex: 0,
      firstDrafter: playerIds[Math.floor(Math.random() * playerIds.length)]!,
      sideBets,
      sideBet: sideBets[0]!,
      pool,
      deck: [],
      run: null,
      countdown: 0,
      paused: false,
      speed: 1,
      seq: 0,
      revealed: [],
      places: null,
      sideResult: null,
    }
    if (pots) {
      state.deck = [...starters, ...pool.splice(0, RACE_DECK_SIZE - starters.length)]
    } else {
      for (const player of players) player.hand = pool.splice(0, handSize(players.length))
      const random = RACE_DECK_SIZE - starters.length - stackCount(players.length) * players.length
      state.deck = [...starters, ...pool.splice(0, random)]
    }
    beginRace(state)
    return state
  },

  applyMove(original, playerId, rawMove, context) {
    const move = (rawMove ?? {}) as Record<string, unknown>
    const isHost = context?.isHost ?? true
    const state = structuredClone(original)
    const player = findPlayer(state, playerId)

    switch (move.type) {
      case 'take': {
        if (state.phase !== 'draft') throw new MoveError('It is not time to take tickets.')
        if (state.draftOrder[state.draftIndex] !== playerId) throw new MoveError('It is not your pick.')
        if (!isPile(move.pile)) throw new MoveError('Pick a ticket pile.')
        if (move.side !== 'safe' && move.side !== 'risky') throw new MoveError('Pick the safe or risky side.')
        const left = state.piles[move.pile]!
        if (left === 0) throw new MoveError('That pile is empty.')
        player.tickets.push({ pile: move.pile, rank: TICKETS_PER_PILE - left, side: move.side, doubled: false })
        state.piles[move.pile] = left - 1
        state.draftIndex++
        if (state.draftIndex >= state.draftOrder.length) finishDraft(state)
        return state
      }

      case 'double': {
        if (state.phase !== 'double') throw new MoveError('It is not time to double a ticket.')
        if (player.doubled) return original
        const index = move.index
        if (!Number.isInteger(index) || !player.tickets[index as number]) throw new MoveError('Pick one of your tickets.')
        player.tickets[index as number]!.doubled = true
        player.doubled = true
        if (state.players.every((p) => p.doubled)) state.phase = 'stack'
        return state
      }

      case 'bets': {
        if (state.phase !== 'bets') throw new MoveError('It is not time to bet.')
        if (player.bets) return original
        const piles = move.piles
        if (!Array.isArray(piles) || piles.length !== 2 || !piles.every(isPile)) {
          throw new MoveError('Pick two bets.')
        }
        const double = state.race === RACES ? move.double : undefined
        if (state.race === RACES && double !== 0 && double !== 1) throw new MoveError('Pick a bet to double.')
        player.bets = (piles as number[]).map((pile, i) => ({ pile, doubled: double === i }))
        maybeStartRunning(state)
        return state
      }

      case 'stack': {
        if (state.phase !== 'stack') throw new MoveError('It is not time to add cards.')
        if (player.stacked) return original
        const cards = cardsIn(player, move.cards, stackCount(state.players.length))
        player.hand = player.hand.filter((card) => !cards.includes(card))
        state.deck.push(...cards)
        player.stacked = true
        maybeStartRunning(state)
        return state
      }

      case 'pause': {
        if (!isHost) throw new MoveError('Only the host can pause the race.')
        if (state.phase !== 'race') return original
        state.paused = move.paused === true
        return state
      }

      case 'speed': {
        if (!isHost) throw new MoveError('Only the host can change the speed.')
        const speed = move.speed
        if (!Number.isInteger(speed) || (speed as number) < 0 || (speed as number) >= CARD_DELAYS.length) {
          throw new MoveError('Pick a speed.')
        }
        state.speed = speed as number
        return state
      }

      case 'nextRace': {
        if (state.phase !== 'results' || move.race !== state.race) return original
        if (!isHost) throw new MoveError('Only the host can start the next race.')
        setUpNextRace(state)
        return state
      }

      default:
        throw new MoveError('Unknown move.')
    }
  },

  tickDelay(state) {
    if (state.phase !== 'race' || state.paused) return null
    if (state.countdown > 0) return COUNTDOWN_DELAY
    const last = state.revealed.at(-1)
    const folded = last?.events.some((event) => event.kind === 'fold')
    return CARD_DELAYS[state.speed]! + (folded ? FOLD_DELAY_BONUS : 0)
  },

  tick(original) {
    if (original.phase !== 'race' || original.paused) return original
    const state = structuredClone(original)
    if (state.countdown > 0) {
      state.countdown--
      if (state.countdown > 0) return state
    }
    const run = state.run!
    const { card, events } = playNext(run)
    state.revealed.push({ seq: ++state.seq, card, events })
    if (state.revealed.length > 30) state.revealed.splice(0, state.revealed.length - 30)
    if (run.over) payOut(state)
    return state
  },

  viewFor(state, viewerId) {
    const viewer = viewerId ? state.players.find((p) => p.id === viewerId) : undefined
    const run = state.run
    const betsOpen = state.phase === 'bets'
    return {
      mode: state.mode,
      race: state.race,
      phase: state.phase,
      players: state.players.map((p) => ({
        id: p.id,
        money: p.money,
        handCount: p.hand.length,
        tickets: p.tickets,
        // Hide pots-mode bets until everyone has bet, so nobody copies.
        bets: betsOpen && p.id !== viewerId ? null : p.bets,
        betPlaced: p.bets !== null,
        stacked: p.stacked,
        doubled: p.doubled,
        lines: p.lines,
        history: p.history,
      })),
      offers: state.piles.map((left, pile) => {
        const rank = left > 0 ? TICKETS_PER_PILE - left : null
        return {
          pile,
          left,
          rank,
          mascot: rank !== null && isMascotPile(pile) ? MASCOT_TICKETS[rank]! : null,
          side: rank !== null && !isMascotPile(pile) ? sideTicketValues(chanceRight(state, pile), rank) : null,
        }
      }),
      draftOrder: state.draftOrder,
      draftIndex: state.draftIndex,
      sideBet: { id: state.sideBet, question: sideBetOf(state).question, chance: sideBetOf(state).chance },
      openDeck: isPots(state) && betsOpen ? state.deck : null,
      hand: viewer?.hand ?? [],
      stackCount: stackCount(state.players.length),
      mascots: run?.mascots ?? startMascots(),
      back: run?.back ?? 0,
      folds: run?.folds ?? 0,
      deckLeft: run ? run.deck.length : state.deck.length,
      countdown: state.countdown,
      paused: state.paused,
      speed: state.speed,
      revealed: state.revealed,
      places: state.places,
      sideResult: state.sideResult,
    }
  },

  result(state) {
    if (state.phase !== 'over') return null
    const richest = Math.max(...state.players.map((p) => p.money))
    return { winnerIds: state.players.filter((p) => p.money === richest).map((p) => p.id) }
  },

  waitingOn(state) {
    switch (state.phase) {
      case 'draft':
        return [state.draftOrder[state.draftIndex]!]
      case 'double':
        return state.players.filter((p) => !p.doubled).map((p) => p.id)
      case 'bets':
        return state.players.filter((p) => !p.bets).map((p) => p.id)
      case 'stack':
        return state.players.filter((p) => !p.stacked).map((p) => p.id)
      default:
        return []
    }
  },

  onPlayerLeave(original, playerId) {
    const state = structuredClone(original)
    const leaver = findPlayer(state, playerId)
    state.players = state.players.filter((p) => p.id !== playerId)
    if (state.players.length < MIN_PLAYERS) return null
    // Their cards go back in the pool, so the deck stays the right size next race.
    state.pool.push(...leaver.hand)
    if (state.firstDrafter === playerId) state.firstDrafter = state.players[0]!.id

    if (state.phase === 'draft') {
      const before = state.draftOrder.slice(0, state.draftIndex).filter((id) => id === playerId).length
      state.draftOrder = state.draftOrder.filter((id) => id !== playerId)
      state.draftIndex -= before
      if (state.draftIndex >= state.draftOrder.length) finishDraft(state)
    }
    if (state.phase === 'double' && state.players.every((p) => p.doubled)) state.phase = 'stack'
    maybeStartRunning(state)
    return state
  },
}

function startMascots() {
  return startRace([]).mascots
}

/** Fun end-of-game fates by final money, for the results screen. */
export const LIFE_OUTCOMES: { atLeast: number; outcome: string }[] = [
  { atLeast: 55, outcome: 'Buys the stadium and renames it after themself.' },
  { atLeast: 45, outcome: 'Retires to a beach with a mascot-shaped pool.' },
  { atLeast: 38, outcome: 'Opens a fancy mascot costume boutique.' },
  { atLeast: 33, outcome: 'Hires Biscuit as a personal hype dog.' },
  { atLeast: 29, outcome: 'Gets season tickets, front row.' },
  { atLeast: 25, outcome: 'Upgrades to the good nachos, with extra cheese.' },
  { atLeast: 21, outcome: 'Buys a foam finger for every finger.' },
  { atLeast: 17, outcome: 'Treats everyone to nachos. Mostly.' },
  { atLeast: 13, outcome: 'Wins a little, and talks about it for years.' },
  { atLeast: 10, outcome: 'Breaks even, and tells everyone they won big.' },
  { atLeast: 6, outcome: 'Has to sell the foam finger.' },
  { atLeast: 1, outcome: 'Takes a job inside the duck costume.' },
  { atLeast: 0, outcome: 'Walks home. It’s a long way.' },
]

export const lifeOutcome = (money: number) => LIFE_OUTCOMES.find((o) => money >= o.atLeast)!.outcome

export { BURN, FINISH }
