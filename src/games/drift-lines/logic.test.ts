import { describe, expect, it } from 'vitest'
import { MoveError } from '../types'
import { HAND_SIZE, boardSize, freeStarts, hasSafeMove, makeDriftLines, preview, type DriftState } from './logic'
import { FACING, PATTERNS, drift, pointKey, turn, wallSpots, type Spot } from './paths'

/** Finds the pattern and turns that give exactly these pairs. */
function pieceFor(pairs: number[]) {
  for (let pattern = 0; pattern < PATTERNS.length; pattern++) {
    for (let turns = 0; turns < 4; turns++) {
      if (turn(PATTERNS[pattern]!, turns).join() === pairs.join()) return { pattern, turns }
    }
  }
  throw new Error(`No piece for ${pairs.join()}`)
}
/** Straight across: top to bottom, left to right. */
const STRAIGHT = pieceFor([5, 4, 7, 6, 1, 0, 3, 2])
/** Each opening turns back to its neighbour on the same side. */
const HAIRPIN = pieceFor([1, 0, 3, 2, 5, 4, 7, 6])

let nextPiece = 500
const hand = (...pieces: { pattern: number }[]) => pieces.map((p) => ({ id: nextPiece++, pattern: p.pattern }))

function newGame(ids = ['a', 'b'], options: Record<string, number> = {}) {
  const game = makeDriftLines(() => 0)
  const state = game.setup(ids, { timer: 0, starts: 0, ...options })
  return { game, state }
}

/** Puts lanterns where a test wants them. */
function place(state: DriftState, spots: Record<string, Spot>) {
  for (const d of state.drifters) if (spots[d.id]) d.spot = spots[d.id]!
  return state
}

const put = (state: DriftState, r: number, c: number, piece: { pattern: number; turns: number }) =>
  (state.board[r * state.size + c] = { ...piece, by: 'x' })

const d = (state: DriftState, id: string) => state.drifters.find((x) => x.id === id)!
const expectMoveError = (fn: () => unknown, message?: RegExp) => {
  expect(fn).toThrow(MoveError)
  if (message) expect(fn).toThrow(message)
}

describe('pieces and paths', () => {
  it('has 35 different pieces, each joining all 8 openings in pairs', () => {
    expect(PATTERNS).toHaveLength(35)
    const seen = new Set<string>()
    for (const pairs of PATTERNS) {
      pairs.forEach((partner, p) => {
        expect(partner).not.toBe(p)
        expect(pairs[partner]).toBe(p)
      })
      for (let t = 0; t < 4; t++) {
        const key = turn(pairs, t).join()
        expect(seen.has(key)).toBe(false)
      }
      for (let t = 0; t < 4; t++) seen.add(turn(pairs, t).join())
    }
  })

  it('turns pieces a quarter at a time', () => {
    expect(turn(PATTERNS[5]!, 4)).toEqual(PATTERNS[5])
    // A channel from top left to top right becomes right top to right bottom.
    const pairs = turn([1, 0, 3, 2, 5, 4, 7, 6], 1)
    expect(pairs[2]).toBe(3)
  })

  it('lists 8 openings per row of squares around the wall', () => {
    const spots = wallSpots(6)
    expect(spots).toHaveLength(48)
    expect(new Set(spots.map((s) => pointKey(6, s))).size).toBe(48)
  })

  it('sees a point between two squares as the same from either side', () => {
    expect(pointKey(6, { r: 1, c: 1, p: 2 })).toBe(pointKey(6, { r: 1, c: 2, p: FACING[2] }))
    expect(pointKey(6, { r: 1, c: 1, p: 0 })).toBe(pointKey(6, { r: 0, c: 1, p: 5 }))
  })
})

describe('setup', () => {
  it('sizes the board for the number of players', () => {
    expect(boardSize(2)).toBe(6)
    expect(boardSize(4)).toBe(6)
    expect(boardSize(5)).toBe(8)
    expect(boardSize(8)).toBe(8)
    expect(boardSize(9)).toBe(10)
    expect(boardSize(12)).toBe(10)
  })

  it('deals 3 pieces each and spreads lanterns around the wall', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`)
    const { state } = newGame(ids)
    expect(state.size).toBe(10)
    expect(state.board).toHaveLength(100)
    expect(state.phase).toBe('play')
    expect(state.order[state.current]).toBe('p0')
    const keys = new Set<string>()
    const wall = new Set(wallSpots(10).map((s) => pointKey(10, s)))
    for (const x of state.drifters) {
      expect(x.hand).toHaveLength(HAND_SIZE)
      expect(wall.has(pointKey(10, x.spot!))).toBe(true)
      keys.add(pointKey(10, x.spot!))
    }
    expect(keys.size).toBe(12)
  })

  it('uses lobby colors and a turn timer', () => {
    const game = makeDriftLines(() => 0)
    const state = game.setup(['a', 'b'], { timer: 30, starts: 0 }, { teams: {}, colors: { a: 4, b: 9 } })
    expect(d(state, 'a').color).toBe(4)
    expect(d(state, 'b').color).toBe(9)
    expect(state.turnEndsAt).toBeGreaterThan(Date.now())
    expect(game.tickDelay!(state)).toBeGreaterThan(25000)
  })
})

describe('placing pieces', () => {
  it('drifts your lantern across the new piece and draws you back to 3', () => {
    const { game, state } = newGame()
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 5, c: 5, p: 3 } })
    d(state, 'a').hand = hand(STRAIGHT, HAIRPIN, HAIRPIN)
    const piece = d(state, 'a').hand[0]!.id
    const next = game.applyMove(state, 'a', { type: 'place', piece, turns: STRAIGHT.turns })
    expect(d(next, 'a').spot).toEqual({ r: 1, c: 0, p: 0 })
    expect(d(next, 'a').trail).toEqual([{ sq: 0, a: 0, b: 5 }])
    expect(d(next, 'a').hand).toHaveLength(3)
    expect(d(next, 'a').hand.some((p) => p.id === piece)).toBe(false)
    expect(next.board[0]).toMatchObject({ pattern: STRAIGHT.pattern, turns: STRAIGHT.turns, by: 'a' })
    expect(next.order[next.current]).toBe('b')
    expect(next.moves).toBe(1)
    // The original state is left alone.
    expect(state.board[0]).toBeNull()
  })

  it('drifts along every piece already joined up', () => {
    const { game, state } = newGame()
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 5, c: 5, p: 3 } })
    put(state, 1, 0, STRAIGHT)
    put(state, 2, 0, STRAIGHT)
    d(state, 'a').hand = hand(STRAIGHT)
    const next = game.applyMove(state, 'a', { type: 'place', piece: d(state, 'a').hand[0]!.id, turns: STRAIGHT.turns })
    expect(d(next, 'a').spot).toEqual({ r: 3, c: 0, p: 0 })
    expect(d(next, 'a').trail).toHaveLength(3)
  })

  it('also drifts other lanterns waiting at the same square', () => {
    const { game, state } = newGame()
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 0, c: 0, p: 7 } })
    d(state, 'a').hand = hand(STRAIGHT)
    const next = game.applyMove(state, 'a', { type: 'place', piece: d(state, 'a').hand[0]!.id, turns: STRAIGHT.turns })
    expect(d(next, 'a').spot).toEqual({ r: 1, c: 0, p: 0 })
    expect(d(next, 'b').spot).toEqual({ r: 0, c: 1, p: 7 })
    expect(d(next, 'b').trail).toEqual([{ sq: 0, a: 7, b: 2 }])
  })

  it('puts out a lantern that reaches the wall', () => {
    const { game, state } = newGame(['a', 'b', 'c'])
    // b waits beside a, and the hairpin sends b back to the wall.
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 0, c: 0, p: 6 }, c: { r: 5, c: 5, p: 3 } })
    d(state, 'a').hand = hand(HAIRPIN)
    // a's own hairpin goes 0 to 1, out the top. Everything a holds does that, so it's allowed.
    const next = game.applyMove(state, 'a', { type: 'place', piece: d(state, 'a').hand[0]!.id, turns: 0 })
    expect(d(next, 'a').out).toEqual({ move: 1, why: 'wall' })
    expect(d(next, 'b').out).toEqual({ move: 1, why: 'wall' })
    expect(d(next, 'a').hand).toEqual([])
    expect(next.last!.outs.map((o) => o.id).sort()).toEqual(['a', 'b'])
  })

  it('puts out both lanterns when they meet on a channel', () => {
    const { game, state } = newGame(['a', 'b', 'c'])
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 0, c: 0, p: 1 }, c: { r: 5, c: 5, p: 3 } })
    d(state, 'a').hand = hand(HAIRPIN)
    const next = game.applyMove(state, 'a', { type: 'place', piece: d(state, 'a').hand[0]!.id, turns: 0 })
    expect(d(next, 'a').out?.why).toBe('crash')
    expect(d(next, 'b').out?.why).toBe('crash')
    expect(game.result(next)).toEqual({ winnerIds: ['c'] })
  })

  it('crashes into a lantern waiting further along the channel', () => {
    const { state } = newGame(['a', 'b', 'c'])
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 2, c: 0, p: 0 }, c: { r: 5, c: 5, p: 3 } })
    put(state, 1, 0, STRAIGHT)
    const outcome = preview(state, 'a', STRAIGHT.pattern, STRAIGHT.turns)!.outcomes
    expect(outcome.get('a')?.out).toBe('crash')
    expect(outcome.get('b')?.out).toBe('crash')
  })

  it('won’t let you put your own lantern out if another move keeps it lit', () => {
    const { game, state } = newGame()
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 5, c: 5, p: 3 } })
    d(state, 'a').hand = hand(HAIRPIN, STRAIGHT)
    expect(hasSafeMove(state, 'a')).toBe(true)
    expectMoveError(
      () => game.applyMove(state, 'a', { type: 'place', piece: d(state, 'a').hand[0]!.id, turns: 0 }),
      /put your lantern out/,
    )
  })

  it('ends the game when one lantern is left', () => {
    const { game, state } = newGame()
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 5, c: 5, p: 3 } })
    d(state, 'a').hand = hand(HAIRPIN)
    const next = game.applyMove(state, 'a', { type: 'place', piece: d(state, 'a').hand[0]!.id, turns: 0 })
    expect(next.phase).toBe('over')
    expect(game.result(next)).toEqual({ winnerIds: ['b'] })
    expect(game.waitingOn!(next)).toEqual([])
    expectMoveError(() => game.applyMove(next, 'b', { type: 'skip' }, { isHost: true }), /over/)
  })

  it('shares the win when the last lanterns go out together', () => {
    const { game, state } = newGame()
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 0, c: 0, p: 1 } })
    d(state, 'a').hand = hand(HAIRPIN)
    const next = game.applyMove(state, 'a', { type: 'place', piece: d(state, 'a').hand[0]!.id, turns: 0 })
    expect(next.phase).toBe('over')
    expect(game.result(next)!.winnerIds.sort()).toEqual(['a', 'b'])
  })

  it('skips lanterns that are out', () => {
    const { game, state } = newGame(['a', 'b', 'c'])
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 0, c: 0, p: 6 }, c: { r: 5, c: 5, p: 3 } })
    d(state, 'a').hand = hand(STRAIGHT, HAIRPIN)
    // A straight piece takes b from the left wall across to the right, and a down.
    let next = game.applyMove(state, 'a', { type: 'place', piece: d(state, 'a').hand[0]!.id, turns: STRAIGHT.turns })
    expect(next.order[next.current]).toBe('b')
    d(next, 'b').out = { move: 1, why: 'wall' }
    next.current = 0
    d(next, 'a').hand = hand(STRAIGHT)
    next = game.applyMove(next, 'a', { type: 'place', piece: d(next, 'a').hand[0]!.id, turns: STRAIGHT.turns })
    expect(next.order[next.current]).toBe('c')
  })

  it('rejects illegal moves', () => {
    const { game, state } = newGame()
    const piece = d(state, 'a').hand[0]!.id
    expectMoveError(() => game.applyMove(state, 'b', { type: 'place', piece, turns: 0 }), /not your turn/)
    expectMoveError(() => game.applyMove(state, 'a', { type: 'place', piece: 9999, turns: 0 }), /don’t have/)
    expectMoveError(() => game.applyMove(state, 'a', { type: 'place', piece, turns: 4 }), /Turn/)
    expectMoveError(() => game.applyMove(state, 'a', { type: 'place', piece, turns: 1.5 }), /Turn/)
    expectMoveError(() => game.applyMove(state, 'a', { type: 'place', piece: 'x', turns: 0 }), /Pick one/)
    expectMoveError(() => game.applyMove(state, 'a', { type: 'start', spot: 0 }), /already/)
    expectMoveError(() => game.applyMove(state, 'a', { type: 'dance' }), /Unknown/)
    expectMoveError(() => game.applyMove(state, 'a', null), /Unknown/)
    expectMoveError(() => game.applyMove(state, 'zed', { type: 'place', piece, turns: 0 }), /watching/)
    expectMoveError(() => game.applyMove(state, 'a', { type: 'skip' }), /host/)
    d(state, 'a').out = { move: 0, why: 'wall' }
    expectMoveError(() => game.applyMove(state, 'a', { type: 'place', piece, turns: 0 }), /out/)
  })
})

describe('picking starting spots', () => {
  it('lets players pick in turn, then starts play', () => {
    const { game, state } = newGame(['a', 'b'], { starts: 1 })
    expect(state.phase).toBe('start')
    expect(state.drifters.every((x) => x.spot === null)).toBe(true)
    expectMoveError(() => game.applyMove(state, 'b', { type: 'start', spot: 3 }), /not your turn/)
    expectMoveError(
      () => game.applyMove(state, 'a', { type: 'place', piece: d(state, 'a').hand[0]!.id, turns: 0 }),
      /Wait/,
    )
    let next = game.applyMove(state, 'a', { type: 'start', spot: 3 })
    expect(d(next, 'a').spot).toEqual(wallSpots(6)[3])
    expect(freeStarts(next)).toHaveLength(47)
    expectMoveError(() => game.applyMove(next, 'b', { type: 'start', spot: 3 }), /open spot/)
    expectMoveError(() => game.applyMove(next, 'b', { type: 'start', spot: 48 }), /open spot/)
    expectMoveError(() => game.applyMove(next, 'b', { type: 'start', spot: 'x' }), /Pick a spot/)
    next = game.applyMove(next, 'b', { type: 'start', spot: 20 })
    expect(next.phase).toBe('play')
    expect(next.order[next.current]).toBe('a')
  })

  it('picks a spot for a player who runs out of time', () => {
    const { game, state } = newGame(['a', 'b'], { starts: 1, timer: 20 })
    const next = game.tick!(state)
    expect(d(next, 'a').spot).not.toBeNull()
    expect(next.order[next.current]).toBe('b')
  })
})

describe('timer and skipping', () => {
  it('plays a move that keeps the lantern lit when time runs out', () => {
    const { game, state } = newGame(['a', 'b'], { timer: 20 })
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 5, c: 5, p: 3 } })
    d(state, 'a').hand = hand(HAIRPIN, HAIRPIN, STRAIGHT)
    const next = game.tick!(state)
    expect(d(next, 'a').out).toBeNull()
    expect(next.board[0]).toMatchObject({ pattern: STRAIGHT.pattern })
    expect(next.order[next.current]).toBe('b')
    expect(next.turnEndsAt).toBeGreaterThan(Date.now())
  })

  it('has no clock with no limit', () => {
    const { game, state } = newGame()
    expect(game.tickDelay!(state)).toBeNull()
  })

  it('lets the host play for someone who is away', () => {
    const { game, state } = newGame()
    const next = game.applyMove(state, 'b', { type: 'skip' }, { isHost: true })
    expect(next.moves).toBe(1)
    expect(next.board.filter(Boolean)).toHaveLength(1)
    expect(next.board.find(Boolean)!.by).toBe('a')
  })
})

describe('players leaving', () => {
  it('passes the turn on when the current player leaves', () => {
    const { game, state } = newGame(['a', 'b', 'c'])
    const next = game.onPlayerLeave!(state, 'a')!
    expect(d(next, 'a').gone).toBe(true)
    expect(d(next, 'a').out?.why).toBe('left')
    expect(next.order[next.current]).toBe('b')
    expect(next.phase).toBe('play')
  })

  it('keeps the turn when someone else leaves', () => {
    const { game, state } = newGame(['a', 'b', 'c'])
    const next = game.onPlayerLeave!(state, 'c')!
    expect(next.order[next.current]).toBe('a')
  })

  it('gives the win to the last lantern when the others leave', () => {
    const { game, state } = newGame(['a', 'b'])
    const next = game.onPlayerLeave!(state, 'a')!
    expect(next.phase).toBe('over')
    expect(game.result(next)).toEqual({ winnerIds: ['b'] })
  })

  it('ends a picking round early if only one player is left', () => {
    const { game, state } = newGame(['a', 'b'], { starts: 1 })
    const next = game.onPlayerLeave!(state, 'b')!
    expect(next.phase).toBe('over')
  })

  it('moves on in picking when the picker leaves', () => {
    const { game, state } = newGame(['a', 'b', 'c'], { starts: 1 })
    const next = game.onPlayerLeave!(state, 'a')!
    expect(next.phase).toBe('start')
    expect(next.order[next.current]).toBe('b')
  })

  it('doesn’t let walk-ins join', () => {
    expect(makeDriftLines().onPlayerJoin).toBeUndefined()
  })
})

describe('what players see', () => {
  it('shows only your own pieces', () => {
    const { game, state } = newGame()
    const view = game.viewFor(state, 'a')
    expect(view.hand).toEqual(d(state, 'a').hand)
    expect(view.drifters.find((x) => x.id === 'b')).not.toHaveProperty('hand')
    expect(view.drifters.find((x) => x.id === 'b')!.pieces).toBe(3)
    expect(game.viewFor(state, null).hand).toBeNull()
    expect(view.turn).toBe('a')
  })

  it('recolors a lantern', () => {
    const { game, state } = newGame()
    expect(d(game.recolor!(state, 'b', 7), 'b').color).toBe(7)
  })

  it('drifts with the same rules the client previews with', () => {
    const { state } = newGame()
    place(state, { a: { r: 0, c: 0, p: 0 }, b: { r: 5, c: 5, p: 3 } })
    const board = state.board.map(() => null) as (number[] | null)[]
    board[0] = turn(PATTERNS[STRAIGHT.pattern]!, STRAIGHT.turns)
    const outcome = drift(board, 6, [{ id: 'a', spot: d(state, 'a').spot! }], 0)
    expect(outcome.get('a')!.spot).toEqual({ r: 1, c: 0, p: 0 })
  })
})
