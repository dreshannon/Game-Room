import { MoveError, type Game, type PlayerColor } from '../types'
import { PATTERNS, drift, pointKey, turn, wallSpots, type Board, type Segment, type Spot } from './paths'

export const MAX_PLAYERS = 12
export const HAND_SIZE = 3
/** Only the latest move is kept, to outline the newest piece. */
export const LOG_LENGTH = 1

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
  /** While everyone picks a start: the wall spot this player wants, kept secret. */
  pick: number | null
  trail: Segment[]
  hand: Piece[]
  /** Set once the lantern goes out, with the move it went out on. */
  out: { move: number; why: OutReason } | null
  gone: boolean
}

/** One thing that happened: a piece placed, or everyone's starting spots handed out. */
export interface LogEntry {
  /** Pieces placed so far, counting this one. 0 for the start. */
  move: number
  /** Who placed a piece, or null for the start. */
  by: string | null
  sq: number | null
  /** Who went out, and why. */
  outs: { id: string; why: OutReason }[]
  /** At the start: players whose spot someone earlier in turn order also picked, so they start nearby. */
  bumped: string[]
}

export interface DriftState {
  size: number
  /** Seconds per turn, or 0 for no limit. */
  timer: number
  phase: 'start' | 'play' | 'over'
  /** Player ids in turn order. */
  order: string[]
  /** Index into `order` of whoever is playing. */
  current: number
  /** Pieces placed so far. */
  moves: number
  turnEndsAt: number | null
  board: (Placed | null)[]
  drifters: Drifter[]
  log: LogEntry[]
  nextId: number
}

export interface DrifterView {
  id: string
  /** Place in turn order, from 1. Shown on the lantern. */
  seat: number
  color: number
  spot: Spot | null
  trail: Segment[]
  lit: boolean
  out: Drifter['out']
  pieces: number
  /** While picking starts: whether they've picked. */
  picked: boolean
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
  log: LogEntry[]
  /** Your pieces, if you're playing and still lit. */
  hand: Piece[] | null
  /** Your secret starting pick, while everyone picks. */
  pick: number | null
}

export type DriftMove =
  | { type: 'start'; spot: number }
  | { type: 'place'; piece: number; turns: number }
  /** Host only: plays for whoever is taking too long, or hands out starts to anyone still picking. */
  | { type: 'skip' }

export type Random = () => number

const isLit = (d: Drifter) => !d.out && !d.gone
const lit = (state: DriftState) => state.drifters.filter(isLit)
const drifterOf = (state: DriftState, id: string | undefined) => state.drifters.find((d) => d.id === id)
const currentId = (state: DriftState) => (state.phase === 'play' ? (state.order[state.current] ?? null) : null)

export const boardPairs = (board: (Placed | null)[]): Board =>
  board.map((cell) => (cell ? turn(PATTERNS[cell.pattern]!, cell.turns) : null))

/** Every opening on the wall that no lantern is on yet. */
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

function startClock(state: DriftState) {
  state.turnEndsAt = state.timer > 0 ? Date.now() + state.timer * 1000 : null
}

function addLog(state: DriftState, entry: LogEntry) {
  state.log = [...state.log, entry].slice(-LOG_LENGTH)
}

function endGame(state: DriftState) {
  state.phase = 'over'
  state.turnEndsAt = null
}

/** Moves on to the next lit lantern after the current one, or ends the game. */
function nextTurn(state: DriftState) {
  if (lit(state).length <= 1) return endGame(state)
  for (let step = 1; step <= state.order.length; step++) {
    const index = (state.current + step) % state.order.length
    if (isLit(drifterOf(state, state.order[index])!)) {
      state.current = index
      return startClock(state)
    }
  }
}

/** The free wall spot closest to this one, going either way round. Ties go clockwise. */
function nearestFree(state: DriftState, index: number) {
  const count = wallSpots(state.size).length
  const free = new Set(freeStarts(state).map((s) => s.index))
  for (let distance = 0; distance < count; distance++) {
    for (const candidate of [index + distance, index - distance]) {
      const wrapped = ((candidate % count) + count) % count
      if (free.has(wrapped)) return wrapped
    }
  }
  return null
}

/**
 * Everyone has picked, or time is up: hand out starting spots in turn order.
 * A spot someone earlier already has goes to the nearest free one instead.
 */
function settleStarts(state: DriftState, random: Random) {
  const spots = wallSpots(state.size)
  const bumped: string[] = []
  for (const id of state.order) {
    const d = drifterOf(state, id)!
    if (d.gone) continue
    const wanted = d.pick ?? Math.floor(random() * spots.length)
    const given = nearestFree(state, wanted)!
    if (d.pick !== null && given !== d.pick) bumped.push(id)
    d.spot = spots[given]!
    d.pick = null
  }
  addLog(state, { move: 0, by: null, sq: null, outs: [], bumped })
  state.phase = 'play'
  state.current = -1
  nextTurn(state)
}

function maybeSettleStarts(state: DriftState, random: Random) {
  if (state.phase === 'start' && state.drifters.every((d) => d.gone || d.pick !== null)) settleStarts(state, random)
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
  const outs: LogEntry['outs'] = []
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
  addLog(state, { move: state.moves, by: playerId, sq: result.sq, outs, bumped: [] })
  if (isLit(me)) while (me.hand.length < HAND_SIZE) me.hand.push(drawPiece(state, random))
  nextTurn(state)
}

/** For a turn that ran out of time: a random move that keeps the lantern lit, if there is one. */
function playFor(state: DriftState, playerId: string, random: Random) {
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
          pick: null,
          trail: [],
          hand: [],
          out: null,
          gone: false,
        })),
        log: [],
        nextId: 1,
      }
      state.board = Array(state.size * state.size).fill(null)
      for (const d of state.drifters) for (let i = 0; i < HAND_SIZE; i++) d.hand.push(drawPiece(state, random))
      if (state.phase === 'play') spreadStarts(state, random)
      startClock(state)
      return state
    },

    applyMove(original, playerId, rawMove, context) {
      const move = (rawMove ?? {}) as Record<string, unknown>
      if (original.phase === 'over') throw new MoveError('The game is over.')
      const me = drifterOf(original, playerId)
      if (move.type === 'skip') {
        if (!context?.isHost) throw new MoveError('Only the host can skip ahead.')
        const state = structuredClone(original)
        if (state.phase === 'start') settleStarts(state, random)
        else playFor(state, currentId(state)!, random)
        return state
      }
      if (!me || me.gone) throw new MoveError('You’re watching this game.')
      if (me.out) throw new MoveError('Your lantern is out.')
      switch (move.type) {
        case 'start': {
          if (original.phase !== 'start') throw new MoveError('Everyone has a starting spot already.')
          const spot = move.spot
          const count = wallSpots(original.size).length
          if (typeof spot !== 'number' || !Number.isInteger(spot) || spot < 0 || spot >= count) {
            throw new MoveError('Pick a spot on the wall.')
          }
          const state = structuredClone(original)
          drifterOf(state, playerId)!.pick = spot
          maybeSettleStarts(state, random)
          return state
        }
        case 'place': {
          if (original.phase !== 'play') throw new MoveError('Wait until everyone has picked a spot.')
          if (currentId(original) !== playerId) throw new MoveError('It’s not your turn.')
          const turns = move.turns
          if (typeof turns !== 'number' || !Number.isInteger(turns) || turns < 0 || turns > 3) {
            throw new MoveError('Turn the piece and try again.')
          }
          if (typeof move.piece !== 'number') throw new MoveError('Pick one of your pieces.')
          const state = structuredClone(original)
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
        log: state.log,
        drifters: state.drifters.map((d) => ({
          id: d.id,
          seat: state.order.indexOf(d.id) + 1,
          color: d.color,
          spot: d.spot,
          trail: d.trail,
          lit: isLit(d),
          out: d.out,
          pieces: d.hand.length,
          picked: d.pick !== null,
          gone: d.gone,
        })),
        hand: viewer && isLit(viewer) ? viewer.hand : null,
        pick: viewer?.pick ?? null,
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
      if (state.phase === 'start') return state.drifters.filter((d) => !d.gone && d.pick === null).map((d) => d.id)
      const id = currentId(state)
      return id ? [id] : []
    },

    tickDelay(state) {
      return state.turnEndsAt === null ? null : Math.max(0, state.turnEndsAt - Date.now())
    },

    tick(original) {
      if (original.phase === 'over') return original
      const state = structuredClone(original)
      if (state.phase === 'start') settleStarts(state, random)
      else playFor(state, currentId(state)!, random)
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
      me.pick = null
      if (!me.out) me.out = { move: state.moves, why: 'left' }
      if (state.drifters.every((d) => d.gone)) return null
      if (state.phase === 'over') return state
      if (lit(state).length <= 1) {
        endGame(state)
        return state
      }
      if (state.phase === 'start') maybeSettleStarts(state, random)
      else if (wasTurn) nextTurn(state)
      return state
    },
  }
}

export const driftLines = makeDriftLines()
