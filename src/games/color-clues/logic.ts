import { MoveError, type Game } from '../types'

export const COLUMNS = 30
export const ROWS = 16
export const CELL_COUNT = COLUMNS * ROWS
export const COLORS_PER_CARD = 4
export const DEFAULT_TARGET_SCORE = 50
const MAX_WORD_LENGTH = 24

export type Phase = 'firstClue' | 'firstGuess' | 'secondClue' | 'secondGuess' | 'reveal'

export interface Token {
  playerId: string
  cell: number
}

export interface ColorCluesState {
  /** Seating order. Clue-giving and guessing both follow it. */
  order: string[]
  /** Each player's token color. Stays fixed if someone leaves. */
  seats: Record<string, number>
  giverId: string
  /** Who the next clue-giver follows. Differs from giverId only if the giver left during reveal. */
  nextGiverAfterIndex: number
  round: number
  phase: Phase
  /** Players still to guess this phase, in turn order. */
  queue: string[]
  /** Secret until reveal. */
  deck: number[]
  card: number[]
  target: number | null
  firstClue: string | null
  secondClue: string | null
  tokens: Token[]
  scores: Record<string, number>
  roundScores: Record<string, number> | null
  targetScore: number
}

export interface ColorCluesView {
  order: string[]
  seats: Record<string, number>
  giverId: string
  round: number
  phase: Phase
  turnPlayerId: string | null
  /** The clue-giver's card. Null for everyone else. */
  card: number[] | null
  /** Known to the clue-giver, and to everyone at reveal. */
  target: number | null
  firstClue: string | null
  secondClue: string | null
  tokens: Token[]
  scores: Record<string, number>
  roundScores: Record<string, number> | null
  targetScore: number
}

export type ColorCluesMove =
  | { type: 'firstClue'; cell: number; word: string }
  | { type: 'secondClue'; words: string }
  | { type: 'place'; cell: number }
  | { type: 'nextRound'; round: number }

export function cellLabel(cell: number) {
  const row = String.fromCharCode(65 + Math.floor(cell / COLUMNS))
  return `${row}${(cell % COLUMNS) + 1}`
}

/** Grid steps between two cells, where a diagonal step counts as one. */
export function distance(a: number, b: number) {
  const rows = Math.abs(Math.floor(a / COLUMNS) - Math.floor(b / COLUMNS))
  const columns = Math.abs((a % COLUMNS) - (b % COLUMNS))
  return Math.max(rows, columns)
}

/** Exact is 3, inside the 3x3 box is 2, and touching the box (diagonals included) is 1. */
export function guesserPoints(cell: number, target: number) {
  return Math.max(0, 3 - distance(cell, target))
}

function shuffledCells() {
  const cells = Array.from({ length: CELL_COUNT }, (_, cell) => cell)
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cells[i], cells[j]] = [cells[j]!, cells[i]!]
  }
  return cells
}

/** Players after the clue-giver, in seating order. */
function guessersAfter(order: string[], giverId: string) {
  const giverIndex = order.indexOf(giverId)
  return [...order.slice(giverIndex + 1), ...order.slice(0, giverIndex)]
}

function startRound(state: ColorCluesState, giverId: string, round: number): ColorCluesState {
  const deck = state.deck.length >= COLORS_PER_CARD ? state.deck : shuffledCells()
  return {
    ...state,
    giverId,
    nextGiverAfterIndex: state.order.indexOf(giverId),
    round,
    phase: 'firstClue',
    queue: [],
    deck: deck.slice(COLORS_PER_CARD),
    card: deck.slice(0, COLORS_PER_CARD),
    target: null,
    firstClue: null,
    secondClue: null,
    tokens: [],
    roundScores: null,
  }
}

function scoreRound(state: ColorCluesState): ColorCluesState {
  const target = state.target!
  const roundScores: Record<string, number> = Object.fromEntries(state.order.map((id) => [id, 0]))
  for (const token of state.tokens) {
    const points = guesserPoints(token.cell, target)
    roundScores[token.playerId] = (roundScores[token.playerId] ?? 0) + points
    if (distance(token.cell, target) <= 1) roundScores[state.giverId]! += 1
  }
  const scores = { ...state.scores }
  for (const id of state.order) scores[id] = (scores[id] ?? 0) + roundScores[id]!
  return { ...state, phase: 'reveal', queue: [], scores, roundScores }
}

/** Moves on once nobody is left to guess in the current phase. */
function advanceIfDone(state: ColorCluesState): ColorCluesState {
  if (state.queue.length > 0) return state
  if (state.phase === 'firstGuess') return { ...state, phase: 'secondClue' }
  if (state.phase === 'secondGuess') return scoreRound(state)
  return state
}

function requireGiver(state: ColorCluesState, playerId: string, phase: Phase) {
  if (state.phase !== phase) throw new MoveError('It’s not time for that clue.')
  if (state.giverId !== playerId) throw new MoveError('Only the clue-giver can do that.')
}

const splitWords = (text: unknown) =>
  typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean) : []

function validateWords(words: string[], maxWords: number) {
  if (words.length === 0 || words.length > maxWords) {
    const allowed = maxWords === 1 ? 'exactly one word' : `1 to ${maxWords} words`
    throw new MoveError(`The clue must be ${allowed}.`)
  }
  if (words.some((word) => word.length > MAX_WORD_LENGTH)) {
    throw new MoveError(`Each word can be up to ${MAX_WORD_LENGTH} letters.`)
  }
}

export const colorClues: Game<ColorCluesState, ColorCluesView> = {
  id: 'color-clues',
  name: 'Shade Hunt',
  minPlayers: 2,
  maxPlayers: 8,
  options: [
    { key: 'targetScore', label: 'Play to', min: 10, max: 200, default: DEFAULT_TARGET_SCORE },
  ],

  setup(playerIds, options) {
    const initial: ColorCluesState = {
      order: playerIds,
      seats: Object.fromEntries(playerIds.map((id, seat) => [id, seat])),
      giverId: playerIds[0]!,
      nextGiverAfterIndex: 0,
      round: 0,
      phase: 'firstClue',
      queue: [],
      deck: shuffledCells(),
      card: [],
      target: null,
      firstClue: null,
      secondClue: null,
      tokens: [],
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      roundScores: null,
      targetScore: options.targetScore ?? DEFAULT_TARGET_SCORE,
    }
    return startRound(initial, playerIds[0]!, 1)
  },

  applyMove(state, playerId, rawMove) {
    if (!state.order.includes(playerId)) throw new MoveError('You are not playing in this game.')
    const move = (rawMove ?? {}) as Partial<Record<string, unknown>>

    switch (move.type) {
      case 'firstClue': {
        requireGiver(state, playerId, 'firstClue')
        const cell = move.cell as number
        if (!state.card.includes(cell)) throw new MoveError('Choose a color from your card.')
        const words = splitWords(move.word)
        validateWords(words, 1)
        return {
          ...state,
          target: cell,
          firstClue: words[0]!,
          phase: 'firstGuess',
          queue: guessersAfter(state.order, state.giverId),
        }
      }

      case 'secondClue': {
        requireGiver(state, playerId, 'secondClue')
        const words = splitWords(move.words)
        validateWords(words, 2)
        return {
          ...state,
          secondClue: words.join(' '),
          phase: 'secondGuess',
          queue: guessersAfter(state.order, state.giverId).reverse(),
        }
      }

      case 'place': {
        if (state.phase !== 'firstGuess' && state.phase !== 'secondGuess') {
          throw new MoveError('It’s not time to place a token.')
        }
        if (state.queue[0] !== playerId) throw new MoveError('It’s not your turn.')
        const cell = move.cell
        if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) {
          throw new MoveError('That is not a space on the board.')
        }
        if (state.tokens.some((token) => token.cell === cell)) {
          throw new MoveError('That space already has a token.')
        }
        return advanceIfDone({
          ...state,
          tokens: [...state.tokens, { playerId, cell }],
          queue: state.queue.slice(1),
        })
      }

      case 'nextRound': {
        // A second player clicking at the same moment shouldn't skip a whole round.
        if (move.round !== state.round) return state
        if (state.phase !== 'reveal') throw new MoveError('The round isn’t over yet.')
        if (colorClues.result(state)) throw new MoveError('The game is over.')
        const next = state.order[(state.nextGiverAfterIndex + 1) % state.order.length]!
        return startRound(state, next, state.round + 1)
      }

      default:
        throw new MoveError('That move isn’t recognized.')
    }
  },

  viewFor(state, viewerId) {
    const isGiver = viewerId === state.giverId
    return {
      order: state.order,
      seats: state.seats,
      giverId: state.giverId,
      round: state.round,
      phase: state.phase,
      turnPlayerId: state.queue[0] ?? null,
      card: isGiver ? state.card : null,
      target: isGiver || state.phase === 'reveal' ? state.target : null,
      firstClue: state.firstClue,
      secondClue: state.secondClue,
      tokens: state.tokens,
      scores: state.scores,
      roundScores: state.roundScores,
      targetScore: state.targetScore,
    }
  },

  result(state) {
    if (state.phase !== 'reveal') return null
    const totals = state.order.map((id) => state.scores[id] ?? 0)
    const top = Math.max(...totals)
    if (top < state.targetScore) return null
    return { winnerIds: state.order.filter((id) => state.scores[id] === top) }
  },

  waitingOn(state) {
    if (state.phase === 'firstClue' || state.phase === 'secondClue') return [state.giverId]
    return state.queue.slice(0, 1)
  },

  onPlayerLeave(state, playerId) {
    const leavingIndex = state.order.indexOf(playerId)
    if (leavingIndex === -1) return state
    const order = state.order.filter((id) => id !== playerId)
    if (order.length < 2) return null

    const { [playerId]: _removed, ...scores } = state.scores
    const remaining: ColorCluesState = {
      ...state,
      order,
      scores,
      tokens: state.tokens.filter((token) => token.playerId !== playerId),
      queue: state.queue.filter((id) => id !== playerId),
    }

    if (state.giverId !== playerId) {
      const giverIndex = order.indexOf(state.giverId)
      // The giver may have already left during reveal, leaving only their old position.
      const previous = state.nextGiverAfterIndex
      const shifted = leavingIndex <= previous ? (previous - 1 + order.length) % order.length : previous
      return advanceIfDone({
        ...remaining,
        nextGiverAfterIndex: giverIndex === -1 ? shifted : giverIndex,
      })
    }

    // Everyone after the leaver shifts down one, so this is who would have been next.
    const nextGiver = order[leavingIndex % order.length]!
    if (state.phase === 'reveal') {
      const before = (order.indexOf(nextGiver) - 1 + order.length) % order.length
      return { ...remaining, nextGiverAfterIndex: before }
    }
    // Without a clue-giver the round can't finish, so it's replayed with the next one.
    return startRound(remaining, nextGiver, state.round + 1)
  },
}
