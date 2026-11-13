import { MoveError, type Game, type PlayerColor } from '../types'
import { PATTERNS, drift, pointKey, turn, wallSpots, type Board, type Segment, type Spot } from './paths'

export const MAX_PLAYERS = 12
export const HAND_SIZE = 3

export const LANTERN_COLORS: PlayerColor[] = [
  { name: 'Red', fill: '#e63946', text: '#ffffff' },
  { name: 'Blue', fill: '#3a86ff', text: '#ffffff' },
  { name: 'Gold', fill: '#f4b400', text: '#111111' },
  { name: 'Green', fill: '#2a9d4b', text: '#ffffff' },
  { name: 'Purple', fill: '#8f4fd6', text: '#ffffff' },
  { name: 'Orange', fill: '#f77f00', text: '#111111' },
  { name: 'Pink', fill: '#ff5fa2', text: '#111111' },
  { name: 'Teal', fill: '#14b8a6', text: '#111111' },
  { name: 'Brown', fill: '#9c6644', text: '#ffffff' },
  { name: 'Lime', fill: '#9bd12a', text: '#111111' },
  { name: 'Navy', fill: '#3d4fa8', text: '#ffffff' },
  { name: 'Grey', fill: '#8d939b', text: '#111111' },
]

/** Squares along each side of the board, for this many players. */
export const boardSize = (players: number) => (players <= 4 ? 6 : players <= 8 ? 8 : 10)

export interface Piece {
  id: number
  /** An index into PATTERNS. */
  pattern: number
}

export interface Placed {
  pattern: number
  turns: number
  by: string
}

export type OutReason = 'wall' | 'crash' | 'left'

export interface Drifter {
  id: string
  color: number
  spot: Spot | null
  trail: Segment[]
  hand: Piece[]
  /** Set once the lantern goes out, with the move it went out on. */
  out: { move: number; why: OutReason } | null
  gone: boolean
}

export interface LastMove {
  by: string
  sq: number
  /** Who went out, and why. */
  outs: { id: string; why: OutReason }[]
}

export interface DriftState {
  size: number
  /** Seconds per turn, or 0 for no limit. */
  timer: number
  phase: 'start' | 'play' | 'over'
  /** Player ids in turn order. */
  order: string[]
  /** Index into `order` of whoever is choosing. */
  current: number
  /** Pieces placed so far. */
  moves: number
  turnEndsAt: number | null
  board: (Placed | null)[]
  drifters: Drifter[]
  last: LastMove | null
  nextId: number
}

export interface DrifterView {
  id: string
  color: number
  spot: Spot | null
  trail: Segment[]
  lit: boolean
  out: Drifter['out']
  pieces: number
  gone: boolean
}

export interface DriftView {
  size: number
  timer: number
  phase: DriftState['phase']
  turn: string | null
  moves: number
  turnEndsAt: number | null
  board: (Placed | null)[]
  drifters: DrifterView[]
  last: LastMove | null
  /** Your pieces, if you're playing and still lit. */
  hand: Piece[] | null
}

export type DriftMove =
  | { type: 'start'; spot: number }
  | { type: 'place'; piece: number; turns: number }
  /** Host only: plays for whoever is taking too long. */
  | { type: 'skip' }

export type Random = () => number

const isLit = (d: Drifter) => !d.out && !d.gone
const lit = (state: DriftState) => state.drifters.filter(isLit)
const drifterOf = (state: DriftState, id: string | undefined) => state.drifters.find((d) => d.id === id)
const currentId = (state: DriftState) => (state.phase === 'over' ? null : (state.order[state.current] ?? null))

export const boardPairs = (board: (Placed | null)[]): Board =>
  board.map((cell) => (cell ? turn(PATTERNS[cell.pattern]!, cell.turns) : null))

/** Every opening on the wall that no lantern has picked. */
export function freeStarts(state: Pick<DriftState, 'size' | 'drifters'>) {
  const taken = new Set(state.drifters.filter((d) => d.spot).map((d) => pointKey(state.size, d.spot!)))
  return wallSpots(state.size)
    .map((spot, index) => ({ spot, index }))
    .filter(({ spot }) => !taken.has(pointKey(state.size, spot)))
}

export interface Preview {
  board: Board
  sq: number
  outcomes: ReturnType<typeof drift>
}

/** What would happen if this player put this piece down, turned this many times. */
export function preview(
  state: Pick<DriftState, 'size' | 'board' | 'drifters'>,
  playerId: string,
  pattern: number,
  turns: number,
): Preview | null {
  const me = state.drifters.find((d) => d.id === playerId)
  if (!me || !me.spot || me.out || me.gone) return null
  const sq = me.spot.r * state.size + me.spot.c
  const board = boardPairs(state.board)
  board[sq] = turn(PATTERNS[pattern]!, turns)
  const lanterns = state.drifters.filter((d) => !d.out && !d.gone && d.spot).map((d) => ({ id: d.id, spot: d.spot! }))
  return { board, sq, outcomes: drift(board, state.size, lanterns, sq) }
}

const keepsMeLit = (state: DriftState, playerId: string, pattern: number, turns: number) =>
  !preview(state, playerId, pattern, turns)?.outcomes.get(playerId)?.out

/** Whether this player has any move that keeps their own lantern lit. */
export function hasSafeMove(state: DriftState, playerId: string) {
  const me = drifterOf(state, playerId)
  return !!me && me.hand.some((piece) => [0, 1, 2, 3].some((t) => keepsMeLit(state, playerId, piece.pattern, t)))
}

function drawPiece(state: DriftState, random: Random): Piece {
  return { id: state.nextId++, pattern: Math.min(PATTERNS.length - 1, Math.floor(random() * PATTERNS.length)) }
}

function startTurn(state: DriftState) {
  state.turnEndsAt = state.timer > 0 ? Date.now() + state.timer * 1000 : null
}

/** Moves on to the next lit lantern after the current one, or ends the game. */
function nextTurn(state: DriftState) {
  if (state.phase === 'start') {
    const waiting = state.order.findIndex((id) => {
      const d = drifterOf(state, id)!
      return !d.spot && !d.gone
    })
    if (waiting !== -1) {
      state.current = waiting
      return startTurn(state)
    }
    state.phase = 'play'
    state.current = -1
  }
  if (lit(state).length <= 1) {
    state.phase = 'over'
    state.turnEndsAt = null
    return
  }
  for (let step = 1; step <= state.order.length; step++) {
    const index = (state.current + step + state.order.length) % state.order.length
    if (isLit(drifterOf(state, state.order[index])!)) {
      state.current = index
      return startTurn(state)
    }
  }
}

function pickStart(state: DriftState, playerId: string, index: number) {
  const free = freeStarts(state).find((s) => s.index === index)
  if (!free) throw new MoveError('Pick an open spot on the wall.')
  drifterOf(state, playerId)!.spot = free.spot
  nextTurn(state)
}

function place(state: DriftState, playerId: string, pieceId: number, turns: number, random: Random) {
  const me = drifterOf(state, playerId)!
  const piece = me.hand.find((p) => p.id === pieceId)
  if (!piece) throw new MoveError('You don’t have that piece.')
  if (!keepsMeLit(state, playerId, piece.pattern, turns) && hasSafeMove(state, playerId)) {
    throw new MoveError('That would put your lantern out. Try another piece or turn it.')
  }
  const result = preview(state, playerId, piece.pattern, turns)!
  state.moves++
  state.board[result.sq] = { pattern: piece.pattern, turns, by: playerId }
  me.hand = me.hand.filter((p) => p !== piece)
  const outs: LastMove['outs'] = []
  for (const [id, outcome] of result.outcomes) {
    const d = drifterOf(state, id)!
    d.trail.push(...outcome.trail)
    d.spot = outcome.spot ?? d.spot
    if (outcome.out) {
      d.out = { move: state.moves, why: outcome.out }
      d.hand = []
      outs.push({ id, why: outcome.out })
    }
  }
  state.last = { by: playerId, sq: result.sq, outs }
  if (isLit(me)) while (me.hand.length < HAND_SIZE) me.hand.push(drawPiece(state, random))
  nextTurn(state)
}

/** For a turn that ran out of time: a random move that keeps the lantern lit, if there is one. */
function playFor(state: DriftState, playerId: string, random: Random) {
  if (state.phase === 'start') {
    const free = freeStarts(state)
    return pickStart(state, playerId, free[Math.floor(random() * free.length)]!.index)
  }
  const me = drifterOf(state, playerId)!
  const options = me.hand.flatMap((piece) => [0, 1, 2, 3].map((turns) => ({ piece, turns })))
  const safe = options.filter((o) => keepsMeLit(state, playerId, o.piece.pattern, o.turns))
  const pool = safe.length > 0 ? safe : options
  const pick = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!
  place(state, playerId, pick.piece.id, pick.turns, random)
}

/** Spreads lanterns evenly around the wall, starting from a random spot. */
function spreadStarts(state: DriftState, random: Random) {
  const spots = wallSpots(state.size)
  const gap = spots.length / state.drifters.length
  const offset = Math.floor(random() * spots.length)
  const seats = state.drifters.map((_, i) => spots[(offset + Math.round(i * gap)) % spots.length]!)
  // Shuffle who gets which spot.
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[seats[i], seats[j]] = [seats[j]!, seats[i]!]
  }
  state.drifters.forEach((d, i) => (d.spot = seats[i]!))
}

export function makeDriftLines(random: Random = Math.random): Game<DriftState, DriftView> {
  return {
    id: 'drift-lines',
    name: 'Drift Lines',
    minPlayers: 2,
    maxPlayers: MAX_PLAYERS,
    playerColors: LANTERN_COLORS,
    options: [
      {
        key: 'timer',
        label: 'Time per turn',
        min: 0,
        max: 60,
        default: 30,
        choices: [
          { value: 20, label: '20 seconds' },
          { value: 30, label: '30 seconds' },
          { value: 60, label: '60 seconds' },
          { value: 0, label: 'No limit' },
        ],
      },
      {
        key: 'starts',
        label: 'Starting spots',
        min: 0,
        max: 1,
        default: 0,
        choices: [
          { value: 0, label: 'Spread out at random' },
          { value: 1, label: 'Players pick' },
        ],
      },
    ],

    setup(playerIds, options, context) {
      const state: DriftState = {
        size: boardSize(playerIds.length),
        timer: options.timer ?? 30,
        phase: options.starts === 1 ? 'start' : 'play',
        order: [...playerIds],
        current: 0,
        moves: 0,
        turnEndsAt: null,
        board: [],
        drifters: playerIds.map((id, i) => ({
          id,
          color: context?.colors?.[id] ?? i % LANTERN_COLORS.length,
          spot: null,
          trail: [],
          hand: [],
          out: null,
          gone: false,
        })),
        last: null,
        nextId: 1,
      }
      state.board = Array(state.size * state.size).fill(null)
      for (const d of state.drifters) for (let i = 0; i < HAND_SIZE; i++) d.hand.push(drawPiece(state, random))
      if (state.phase === 'play') spreadStarts(state, random)
      startTurn(state)
      return state
    },

    applyMove(original, playerId, rawMove, context) {
      const move = (rawMove ?? {}) as Record<string, unknown>
      if (original.phase === 'over') throw new MoveError('The game is over.')
      const me = drifterOf(original, playerId)
      if (move.type === 'skip') {
        if (!context?.isHost) throw new MoveError('Only the host can skip a turn.')
        const state = structuredClone(original)
        playFor(state, currentId(state)!, random)
        return state
      }
      if (!me || me.gone) throw new MoveError('You’re watching this game.')
      if (me.out) throw new MoveError('Your lantern is out.')
      if (currentId(original) !== playerId) throw new MoveError('It’s not your turn.')
      const state = structuredClone(original)
      switch (move.type) {
        case 'start': {
          if (state.phase !== 'start') throw new MoveError('Everyone has a starting spot already.')
          if (typeof move.spot !== 'number' || !Number.isInteger(move.spot)) throw new MoveError('Pick a spot on the wall.')
          pickStart(state, playerId, move.spot)
          return state
        }
        case 'place': {
          if (state.phase !== 'play') throw new MoveError('Wait until everyone has picked a spot.')
          const turns = move.turns
          if (typeof turns !== 'number' || !Number.isInteger(turns) || turns < 0 || turns > 3) {
            throw new MoveError('Turn the piece and try again.')
          }
          if (typeof move.piece !== 'number') throw new MoveError('Pick one of your pieces.')
          place(state, playerId, move.piece, turns, random)
          return state
        }
        default:
          throw new MoveError('Unknown move.')
      }
    },

    viewFor(state, viewerId) {
      const viewer = drifterOf(state, viewerId ?? undefined)
      return {
        size: state.size,
        timer: state.timer,
        phase: state.phase,
        turn: currentId(state),
        moves: state.moves,
        turnEndsAt: state.turnEndsAt,
        board: state.board,
        last: state.last,
        drifters: state.drifters.map((d) => ({
          id: d.id,
          color: d.color,
          spot: d.spot,
          trail: d.trail,
          lit: isLit(d),
          out: d.out,
          pieces: d.hand.length,
          gone: d.gone,
        })),
        hand: viewer && isLit(viewer) ? viewer.hand : null,
      }
    },

    result(state) {
      if (state.phase !== 'over') return null
      const left = lit(state)
      if (left.length > 0) return { winnerIds: left.map((d) => d.id) }
      // Everyone left went out on the same move, so they share it.
      const present = state.drifters.filter((d) => !d.gone && d.out)
      const lastMove = Math.max(0, ...present.map((d) => d.out!.move))
      return { winnerIds: present.filter((d) => d.out!.move === lastMove).map((d) => d.id) }
    },

    waitingOn(state) {
      const id = currentId(state)
      return id ? [id] : []
    },

    tickDelay(state) {
      return state.turnEndsAt === null ? null : Math.max(0, state.turnEndsAt - Date.now())
    },

    tick(original) {
      const id = currentId(original)
      if (!id) return original
      const state = structuredClone(original)
      playFor(state, id, random)
      return state
    },

    recolor(original, playerId, color) {
      return {
        ...original,
        drifters: original.drifters.map((d) => (d.id === playerId ? { ...d, color } : d)),
      }
    },

    onPlayerLeave(original, playerId) {
      const state = structuredClone(original)
      const me = drifterOf(state, playerId)
      if (!me) return state
      const wasTurn = currentId(state) === playerId
      me.gone = true
      me.hand = []
      if (!me.out) me.out = { move: state.moves, why: 'left' }
      if (state.drifters.every((d) => d.gone)) return null
      if (state.phase === 'over') return state
      if (lit(state).length <= 1) {
        state.phase = 'over'
        state.turnEndsAt = null
        return state
      }
      if (wasTurn) nextTurn(state)
      return state
    },
  }
}

export const driftLines = makeDriftLines()
