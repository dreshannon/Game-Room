import { MoveError, type Game } from '../types'

/** 0 starts at the bottom of the board (row 4), 1 at the top (row 0). */
export type Seat = 0 | 1

export interface Ship {
  seat: Seat
  captain: boolean
}

/**
 * A wind's moves, as [right, forward] steps from the holder's side of the table.
 * Forward is toward the other fleet.
 */
export interface Wind {
  id: string
  name: string
  steps: [number, number][]
}

export const WINDS: Wind[] = [
  { id: 'breeze', name: 'Breeze', steps: [[0, 1], [-1, 0], [1, 0]] },
  { id: 'squall', name: 'Squall', steps: [[0, 2], [0, -1]] },
  { id: 'gale', name: 'Gale', steps: [[-1, 1], [1, 1], [0, -1]] },
  { id: 'lull', name: 'Lull', steps: [[-1, -1], [1, -1], [0, 1]] },
  { id: 'crosswind', name: 'Crosswind', steps: [[-2, 0], [2, 0], [0, 1]] },
  { id: 'whirl', name: 'Whirl', steps: [[-1, 1], [1, 1], [-1, -1], [1, -1]] },
  { id: 'updraft', name: 'Updraft', steps: [[-2, 1], [2, 1], [0, -1]] },
  { id: 'compass', name: 'Compass', steps: [[0, 1], [0, -1], [-1, 0], [1, 0]] },
  { id: 'eddy', name: 'Eddy', steps: [[-1, 1], [1, -1], [-1, 0]] },
  { id: 'swirl', name: 'Swirl', steps: [[1, 1], [-1, -1], [1, 0]] },
  { id: 'gust', name: 'Gust', steps: [[-2, 1], [1, 0]] },
  { id: 'flurry', name: 'Flurry', steps: [[2, 1], [-1, 0]] },
  { id: 'swell', name: 'Swell', steps: [[-1, 2], [0, -1]] },
  { id: 'surge', name: 'Surge', steps: [[1, 2], [0, -1]] },
  { id: 'tack', name: 'Tack', steps: [[-1, 0], [1, 1], [1, -1]] },
  { id: 'jibe', name: 'Jibe', steps: [[1, 0], [-1, 1], [-1, -1]] },
]

export const windById = (id: string) => WINDS.find((wind) => wind.id === id)

export const SIZE = 5
/** Each fleet's home port: the middle of its back row. */
export const HOME_PORT: Record<Seat, number> = { 0: 22, 1: 2 }
export const REPEAT_LIMIT = 3

export type Outcome =
  | { winner: Seat; how: 'sunk' | 'port' | 'left' }
  | { winner: null; how: 'turns' | 'repeat' }

export interface LastMove {
  seat: Seat
  wind: string
  /** Unset when the player had no move and only swapped. */
  from?: number
  to?: number
  sank?: boolean
}

export interface WindSwapState {
  /** The two players. seats[0] sails up from the bottom, seats[1] down from the top. */
  seats: [string, string]
  wins: [number, number]
  draws: number
  bestOf: number
  /** Turns before the game is a draw; 0 for no limit. */
  drawAfter: number
  /** Which game of the series this is, from 1. */
  game: number
  board: (Ship | null)[]
  hands: [[string, string], [string, string]]
  /** The wind waiting in the middle. The next player to move picks it up. */
  drifting: string
  turn: Seat
  /** Turns taken this game. */
  turns: number
  lastMove: LastMove | null
  /** How often each position has come up this game, for the repeat draw. */
  seen: Record<string, number>
  outcome: Outcome | null
  /** Set when a player left, ending the series. */
  forfeitWinner: Seat | null
}

export interface WindSwapView extends Omit<WindSwapState, 'seen'> {
  winsNeeded: number
  seriesOver: boolean
}

export type WindSwapMove =
  | { type: 'sail'; wind: string; from: number; to: number }
  | { type: 'pass'; wind: string }
  | { type: 'nextGame'; game: number }

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0)

/** Squares a ship at `from` can reach with `windId`, for the fleet in `seat`. */
export function targetsFor(board: (Ship | null)[], seat: Seat, from: number, windId: string): number[] {
  const wind = windById(windId)
  const ship = board[from]
  if (!wind || !ship || ship.seat !== seat) return []
  // Seat 0 looks up the board; seat 1 sits opposite, so its directions are turned around.
  const flip = seat === 0 ? 1 : -1
  const row = Math.floor(from / SIZE)
  const col = from % SIZE
  const targets: number[] = []
  for (const [right, forward] of wind.steps) {
    const r = row - forward * flip
    const c = col + right * flip
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue
    const square = r * SIZE + c
    if (board[square]?.seat === seat) continue
    targets.push(square)
  }
  return targets
}

/** Whether `seat` can move any ship with either of its winds. */
export function hasAnyMove(state: Pick<WindSwapState, 'board' | 'hands'>, seat: Seat) {
  return state.hands[seat].some((wind) =>
    state.board.some((ship, from) => ship?.seat === seat && targetsFor(state.board, seat, from, wind).length > 0),
  )
}

function positionKey(state: WindSwapState) {
  const board = state.board.map((ship) => (ship ? `${ship.seat}${ship.captain ? 'c' : 'd'}` : '.')).join('')
  const hands = state.hands.map((hand) => [...hand].sort().join('+')).join('|')
  return `${board}/${hands}/${state.drifting}/${state.turn}`
}

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

function startingBoard() {
  const board: (Ship | null)[] = Array(SIZE * SIZE).fill(null)
  for (let col = 0; col < SIZE; col++) {
    board[col] = { seat: 1, captain: col === 2 }
    board[(SIZE - 1) * SIZE + col] = { seat: 0, captain: col === 2 }
  }
  return board
}

export const winsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1

function seriesWinner(state: WindSwapState): Seat | null {
  if (state.forfeitWinner !== null) return state.forfeitWinner
  const needed = winsNeeded(state.bestOf)
  if (state.wins[0] >= needed) return 0
  if (state.wins[1] >= needed) return 1
  return null
}

/** Deals a fresh game. The seats take turns going first. */
function startGame(state: WindSwapState, game: number, deal = shuffle(WINDS.map((wind) => wind.id))): WindSwapState {
  const next: WindSwapState = {
    ...state,
    game,
    board: startingBoard(),
    hands: [
      [deal[0]!, deal[1]!],
      [deal[2]!, deal[3]!],
    ],
    drifting: deal[4]!,
    turn: ((game - 1) % 2) as Seat,
    turns: 0,
    lastMove: null,
    seen: {},
    outcome: null,
  }
  return { ...next, seen: { [positionKey(next)]: 1 } }
}

/** Ends the game if it's over, and records the result in the series. */
function settle(state: WindSwapState, outcome: Outcome | null): WindSwapState {
  if (!outcome) return state
  if (outcome.winner === null) return { ...state, outcome, draws: state.draws + 1 }
  const wins = [...state.wins] as [number, number]
  wins[outcome.winner] += 1
  return { ...state, outcome, wins }
}

export const windSwap: Game<WindSwapState, WindSwapView> = {
  id: 'wind-swap',
  name: 'Wind Swap',
  minPlayers: 2,
  maxPlayers: 2,
  seats: 2,
  options: [
    {
      key: 'bestOf',
      label: 'Series',
      min: 1,
      max: 5,
      default: 1,
      choices: [
        { value: 1, label: 'One game' },
        { value: 3, label: 'Best of 3' },
        { value: 5, label: 'Best of 5' },
      ],
    },
    {
      key: 'drawAfter',
      label: 'Draw after',
      min: 0,
      max: 100,
      default: 100,
      choices: [
        { value: 0, label: 'No limit' },
        { value: 60, label: '60 turns' },
        { value: 100, label: '100 turns' },
      ],
    },
  ],

  setup(playerIds, options) {
    const seats = shuffle(playerIds).slice(0, 2) as [string, string]
    const initial = {
      seats,
      wins: [0, 0],
      draws: 0,
      bestOf: options.bestOf ?? 1,
      drawAfter: options.drawAfter ?? 100,
      forfeitWinner: null,
    } as unknown as WindSwapState
    return startGame(initial, 1)
  },

  applyMove(state, playerId, rawMove) {
    const seat = state.seats.indexOf(playerId)
    if (seat === -1) throw new MoveError('You are not playing in this game.')
    const move = (rawMove ?? {}) as Record<string, unknown>

    if (move.type === 'nextGame') {
      // Both players may click at once; only the first click counts.
      if (move.game !== state.game) return state
      if (!state.outcome) throw new MoveError('Finish this game first.')
      if (seriesWinner(state) !== null) throw new MoveError('The series is over.')
      return startGame(state, state.game + 1)
    }

    if (move.type !== 'sail' && move.type !== 'pass') throw new MoveError('That is not a move in this game.')
    if (state.outcome || state.forfeitWinner !== null) throw new MoveError('This game is over.')
    if (seat !== state.turn) throw new MoveError('It is not your turn.')

    const wind = move.wind
    if (typeof wind !== 'string' || !state.hands[seat].includes(wind)) {
      throw new MoveError('Pick one of your two winds.')
    }

    const me = seat as Seat
    let board = state.board
    let lastMove: LastMove
    let outcome: Outcome | null = null

    if (move.type === 'pass') {
      if (hasAnyMove(state, me)) throw new MoveError('You have a move, so you have to make one.')
      lastMove = { seat: me, wind }
    } else {
      const { from, to } = move
      const isSquare = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < SIZE * SIZE
      if (!isSquare(from) || !isSquare(to)) throw new MoveError('That is not a square on the board.')
      if (state.board[from]?.seat !== me) throw new MoveError('Pick one of your own ships.')
      if (!targetsFor(state.board, me, from, wind).includes(to)) {
        throw new MoveError('That wind can’t take this ship there.')
      }
      const ship = state.board[from]!
      const target = state.board[to]
      board = [...state.board]
      board[from] = null
      board[to] = ship
      lastMove = { seat: me, wind, from, to, sank: !!target }
      if (target?.captain) outcome = { winner: me, how: 'sunk' }
      else if (ship.captain && to === HOME_PORT[other(me)]) outcome = { winner: me, how: 'port' }
    }

    // The used wind drifts to the middle, and the old drifting wind joins this hand.
    const hands = state.hands.map((hand) => [...hand]) as WindSwapState['hands']
    hands[me] = [hands[me][0] === wind ? state.drifting : hands[me][0], hands[me][1] === wind ? state.drifting : hands[me][1]]

    let next: WindSwapState = {
      ...state,
      board,
      hands,
      drifting: wind,
      turn: other(me),
      turns: state.turns + 1,
      lastMove,
    }

    if (!outcome) {
      const key = positionKey(next)
      const count = (state.seen[key] ?? 0) + 1
      next = { ...next, seen: { ...state.seen, [key]: count } }
      if (count >= REPEAT_LIMIT) outcome = { winner: null, how: 'repeat' }
      else if (next.drawAfter > 0 && next.turns >= next.drawAfter) outcome = { winner: null, how: 'turns' }
    }
    return settle(next, outcome)
  },

  viewFor(state) {
    // Everything on the table is open, so everyone sees the same view.
    const { seen: _seen, ...rest } = state
    return { ...rest, winsNeeded: winsNeeded(state.bestOf), seriesOver: seriesWinner(state) !== null }
  },

  result(state) {
    const winner = seriesWinner(state)
    return winner === null ? null : { winnerIds: [state.seats[winner]] }
  },

  waitingOn(state) {
    if (state.outcome || state.forfeitWinner !== null) return []
    return [state.seats[state.turn]]
  },

  onPlayerLeave(state, playerId) {
    const seat = state.seats.indexOf(playerId)
    if (seat === -1) return state
    if (seriesWinner(state) !== null) return state
    const winner = other(seat as Seat)
    return { ...state, forfeitWinner: winner, outcome: state.outcome ?? { winner, how: 'left' } }
  },
}

/** For tests: starts a game with a fixed deal. */
export const startWithDeal = (state: WindSwapState, game: number, deal: string[]) => startGame(state, game, deal)
