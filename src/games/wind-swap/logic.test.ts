import { describe, expect, it } from 'vitest'
import { MoveError } from '../types'
import {
  HOME_PORT,
  WINDS,
  hasAnyMove,
  startWithDeal,
  targetsFor,
  windSwap,
  type Ship,
  type WindSwapState,
} from './logic'

// Seat 0 holds breeze + squall, seat 1 holds gale + lull, and compass drifts.
const DEAL = ['breeze', 'squall', 'gale', 'lull', 'compass']

function setup(options: Record<string, number> = {}, deal = DEAL) {
  const state = windSwap.setup(['a', 'b'], { bestOf: 1, drawAfter: 100, ...options })
  return startWithDeal(state, 1, deal)
}

const sq = (row: number, col: number) => row * 5 + col
const empty = (): (Ship | null)[] => Array(25).fill(null)
const player = (state: WindSwapState, seat: 0 | 1) => state.seats[seat]

const sail = (state: WindSwapState, wind: string, from: number, to: number) =>
  windSwap.applyMove(state, player(state, state.turn), { type: 'sail', wind, from, to })

describe('setup', () => {
  it('lines up both fleets with captains on their home ports', () => {
    const state = setup()
    expect(state.board[HOME_PORT[0]]).toEqual({ seat: 0, captain: true })
    expect(state.board[HOME_PORT[1]]).toEqual({ seat: 1, captain: true })
    expect(state.board.filter((ship) => ship?.seat === 0)).toHaveLength(5)
    expect(state.board.filter((ship) => ship?.seat === 1)).toHaveLength(5)
    expect(state.board.slice(5, 20).every((ship) => ship === null)).toBe(true)
  })

  it('deals five different winds and lets the first seat start', () => {
    const state = windSwap.setup(['a', 'b'], { bestOf: 1, drawAfter: 100 })
    const dealt = [...state.hands[0], ...state.hands[1], state.drifting]
    expect(new Set(dealt).size).toBe(5)
    expect(dealt.every((id) => WINDS.some((wind) => wind.id === id))).toBe(true)
    expect(state.turn).toBe(0)
    expect([...state.seats].sort()).toEqual(['a', 'b'])
    expect(windSwap.waitingOn!(state)).toEqual([state.seats[0]])
  })

  it('has sixteen winds with moves that fit on a wind card', () => {
    expect(WINDS).toHaveLength(16)
    expect(new Set(WINDS.map((wind) => wind.id)).size).toBe(16)
    for (const wind of WINDS) {
      for (const [right, forward] of wind.steps) {
        expect(Math.abs(right)).toBeLessThanOrEqual(2)
        expect(Math.abs(forward)).toBeLessThanOrEqual(2)
        expect(right === 0 && forward === 0).toBe(false)
      }
    }
  })
})

describe('sailing', () => {
  it('turns directions around for the fleet at the top', () => {
    const board = empty()
    board[sq(2, 2)] = { seat: 0, captain: false }
    expect(targetsFor(board, 0, sq(2, 2), 'gust').sort()).toEqual([sq(1, 0), sq(2, 3)].sort())
    board[sq(2, 2)] = { seat: 1, captain: false }
    expect(targetsFor(board, 1, sq(2, 2), 'gust').sort()).toEqual([sq(3, 4), sq(2, 1)].sort())
  })

  it('jumps over ships, but not off the board or onto your own fleet', () => {
    const state = setup()
    // Squall: two forward, one back. From the bottom row, back is off the board.
    expect(targetsFor(state.board, 0, sq(4, 0), 'squall')).toEqual([sq(2, 0)])
    // Breeze sideways from the corner is blocked by the next ship over.
    expect(targetsFor(state.board, 0, sq(4, 0), 'breeze')).toEqual([sq(3, 0)])
  })

  it('moves the ship and swaps the used wind for the drifting one', () => {
    const next = sail(setup(), 'squall', sq(4, 0), sq(2, 0))
    expect(next.board[sq(4, 0)]).toBeNull()
    expect(next.board[sq(2, 0)]).toEqual({ seat: 0, captain: false })
    expect(next.hands[0]).toEqual(['breeze', 'compass'])
    expect(next.drifting).toBe('squall')
    expect(next.turn).toBe(1)
    expect(next.turns).toBe(1)
    expect(next.lastMove).toEqual({ seat: 0, wind: 'squall', from: sq(4, 0), to: sq(2, 0), sank: false })
  })

  it('sinks an enemy ship it lands on', () => {
    let state = setup()
    state = sail(state, 'squall', sq(4, 1), sq(2, 1))
    state = sail(state, 'gale', sq(0, 0), sq(1, 1)) // lands on (1, 1)
    // Bottom fleet now holds breeze + compass. Breeze forward sinks the ship at (1, 1).
    state = sail(state, 'breeze', sq(2, 1), sq(1, 1))
    expect(state.board[sq(1, 1)]).toEqual({ seat: 0, captain: false })
    expect(state.board.filter((ship) => ship?.seat === 1)).toHaveLength(4)
    expect(state.lastMove?.sank).toBe(true)
    expect(state.outcome).toBeNull()
  })
})

describe('illegal moves', () => {
  it('rejects moves out of turn or from people not playing', () => {
    const state = setup()
    expect(() => windSwap.applyMove(state, player(state, 1), { type: 'sail', wind: 'gale', from: 0, to: 6 })).toThrow(
      'not your turn',
    )
    expect(() => windSwap.applyMove(state, 'z', { type: 'sail', wind: 'breeze', from: 20, to: 15 })).toThrow(
      'not playing',
    )
  })

  it.each([
    [{ type: 'sail', wind: 'gale', from: sq(4, 0), to: sq(3, 0) }, 'your two winds'],
    [{ type: 'sail', wind: 'nope', from: sq(4, 0), to: sq(3, 0) }, 'your two winds'],
    [{ type: 'sail', wind: 'breeze', from: 25, to: sq(3, 0) }, 'not a square'],
    [{ type: 'sail', wind: 'breeze', from: sq(4, 0), to: 1.5 }, 'not a square'],
    [{ type: 'sail', wind: 'breeze', from: sq(2, 2), to: sq(1, 2) }, 'your own ships'],
    [{ type: 'sail', wind: 'breeze', from: sq(0, 0), to: sq(1, 0) }, 'your own ships'],
    [{ type: 'sail', wind: 'breeze', from: sq(4, 0), to: sq(2, 0) }, 'can’t take'],
    [{ type: 'pass', wind: 'breeze' }, 'have to make one'],
    [{ type: 'jump' }, 'not a move'],
    [null, 'not a move'],
  ])('rejects %o', (move, message) => {
    const state = setup()
    expect(() => windSwap.applyMove(state, player(state, 0), move)).toThrow(MoveError)
    expect(() => windSwap.applyMove(state, player(state, 0), move)).toThrow(message)
  })

  it('rejects moves after the game ends', () => {
    const state = { ...setup(), outcome: { winner: 0, how: 'sunk' } } as WindSwapState
    expect(() => sail(state, 'squall', sq(4, 0), sq(2, 0))).toThrow('over')
  })
})

describe('no legal move', () => {
  // The bottom fleet fills the left column. Squall only goes straight up or down, and swell's
  // forward step goes off the left edge, so no ship can move.
  function stuck() {
    const board = empty()
    board[sq(0, 0)] = { seat: 0, captain: true }
    for (let row = 1; row < 5; row++) board[sq(row, 0)] = { seat: 0, captain: false }
    board[sq(4, 4)] = { seat: 1, captain: true }
    return { ...setup(), board, hands: [['squall', 'swell'], ['gale', 'lull']] } as WindSwapState
  }

  it('lets a stuck player swap a wind without moving', () => {
    const state = stuck()
    expect(hasAnyMove(state, 0)).toBe(false)
    const next = windSwap.applyMove(state, player(state, 0), { type: 'pass', wind: 'squall' })
    expect(next.board).toEqual(state.board)
    expect(next.hands[0]).toEqual(['compass', 'swell'])
    expect(next.drifting).toBe('squall')
    expect(next.turn).toBe(1)
    expect(next.lastMove).toEqual({ seat: 0, wind: 'squall' })
  })

  it('still needs one of your own winds to pass', () => {
    const state = stuck()
    expect(() => windSwap.applyMove(state, player(state, 0), { type: 'pass', wind: 'gale' })).toThrow('your two winds')
  })
})

describe('winning', () => {
  it('ends the game when a captain is sunk', () => {
    const board = empty()
    board[sq(3, 2)] = { seat: 0, captain: false }
    board[sq(2, 2)] = { seat: 1, captain: true }
    board[sq(4, 2)] = { seat: 0, captain: true }
    const state = { ...setup(), board } as WindSwapState
    const next = sail(state, 'breeze', sq(3, 2), sq(2, 2))
    expect(next.outcome).toEqual({ winner: 0, how: 'sunk' })
    expect(next.wins).toEqual([1, 0])
    expect(windSwap.result(next)).toEqual({ winnerIds: [next.seats[0]] })
    expect(windSwap.waitingOn!(next)).toEqual([])
  })

  it('ends the game when a captain reaches the enemy home port', () => {
    const board = empty()
    board[sq(1, 2)] = { seat: 0, captain: true }
    board[sq(4, 4)] = { seat: 1, captain: true }
    const state = { ...setup(), board } as WindSwapState
    const next = sail(state, 'breeze', sq(1, 2), HOME_PORT[1])
    expect(next.outcome).toEqual({ winner: 0, how: 'port' })
  })

  it('does not count a deckhand reaching the enemy port', () => {
    const board = empty()
    board[sq(1, 2)] = { seat: 0, captain: false }
    board[sq(4, 2)] = { seat: 0, captain: true }
    board[sq(4, 4)] = { seat: 1, captain: true }
    const state = { ...setup(), board } as WindSwapState
    expect(sail(state, 'breeze', sq(1, 2), HOME_PORT[1]).outcome).toBeNull()
  })

  it('lets the top fleet win by reaching the bottom port', () => {
    const board = empty()
    board[sq(3, 2)] = { seat: 1, captain: true }
    board[sq(0, 0)] = { seat: 0, captain: true }
    const state = { ...setup(), board, turn: 1 } as WindSwapState
    const next = sail(state, 'lull', sq(3, 2), HOME_PORT[0]) // lull forward is down for the top fleet
    expect(next.outcome).toEqual({ winner: 1, how: 'port' })
  })
})

describe('draws', () => {
  it('is a draw after the turn limit', () => {
    let state = setup({ drawAfter: 60 })
    state = { ...state, turns: 59 }
    state = sail(state, 'squall', sq(4, 0), sq(2, 0))
    expect(state.outcome).toEqual({ winner: null, how: 'turns' })
    expect(state.draws).toBe(1)
  })

  it('has no turn limit when it is off', () => {
    let state = setup({ drawAfter: 0 })
    state = { ...state, turns: 500 }
    expect(sail(state, 'squall', sq(4, 0), sq(2, 0)).outcome).toBeNull()
  })

  it('is a draw when the same position comes up a third time', () => {
    const start = setup()
    const once = sail(start, 'squall', sq(4, 0), sq(2, 0))
    const key = Object.keys(once.seen).find((k) => !(k in start.seen))!
    expect(once.seen[key]).toBe(1)
    // Pretend this position has come up twice already.
    const replay = sail({ ...start, seen: { ...start.seen, [key]: 2 } }, 'squall', sq(4, 0), sq(2, 0))
    expect(replay.outcome).toEqual({ winner: null, how: 'repeat' })
    expect(replay.draws).toBe(1)
  })

  it('counts a position by board, winds and whose turn it is', () => {
    const state = setup()
    const key = Object.keys(state.seen)[0]!
    expect(key).toContain('breeze+squall')
    expect(key.endsWith('/0')).toBe(true)
    const forced = { ...state, seen: { [key.replace(/\/0$/, '/1')]: 2 } } as WindSwapState
    // Moving to a new position doesn't trip the draw.
    expect(sail(forced, 'squall', sq(4, 0), sq(2, 0)).outcome).toBeNull()
  })
})

describe('the series', () => {
  function winGame(state: WindSwapState, seat: 0 | 1) {
    const board = empty()
    board[seat === 0 ? sq(3, 2) : sq(1, 2)] = { seat, captain: false }
    board[sq(2, 2)] = { seat: (1 - seat) as 0 | 1, captain: true }
    board[seat === 0 ? sq(4, 0) : sq(0, 0)] = { seat, captain: true }
    const hands = [...state.hands] as WindSwapState['hands']
    hands[seat] = ['compass', 'squall']
    const ready = { ...state, board, hands, drifting: 'whirl', turn: seat } as WindSwapState
    return sail(ready, 'compass', seat === 0 ? sq(3, 2) : sq(1, 2), sq(2, 2))
  }

  it('alternates who goes first and ends when someone has a majority', () => {
    let state = setup({ bestOf: 3 })
    state = winGame(state, 0)
    expect(windSwap.result(state)).toBeNull()
    expect(() => sail(state, state.hands[1][0], 0, 5)).toThrow('over')
    state = windSwap.applyMove(state, player(state, 1), { type: 'nextGame', game: 1 })
    expect(state.game).toBe(2)
    expect(state.turn).toBe(1)
    expect(state.outcome).toBeNull()
    expect(state.turns).toBe(0)
    // A second click for the old game does nothing.
    expect(windSwap.applyMove(state, player(state, 0), { type: 'nextGame', game: 1 })).toBe(state)
    state = winGame(state, 0)
    expect(windSwap.result(state)).toEqual({ winnerIds: [state.seats[0]] })
    expect(() => windSwap.applyMove(state, player(state, 0), { type: 'nextGame', game: 2 })).toThrow('series is over')
  })

  it('won’t start the next game before this one ends', () => {
    const state = setup({ bestOf: 3 })
    expect(() => windSwap.applyMove(state, player(state, 0), { type: 'nextGame', game: 1 })).toThrow('Finish')
  })
})

describe('leaving', () => {
  it('gives the series to the player who stays', () => {
    const state = setup({ bestOf: 3 })
    const next = windSwap.onPlayerLeave!(state, player(state, 0))!
    expect(next.outcome).toEqual({ winner: 1, how: 'left' })
    expect(windSwap.result(next)).toEqual({ winnerIds: [state.seats[1]] })
    expect(windSwap.waitingOn!(next)).toEqual([])
  })

  it('ignores someone who was only watching', () => {
    const state = setup()
    expect(windSwap.onPlayerLeave!(state, 'z')).toBe(state)
  })
})

describe('the view', () => {
  it('shows the whole table to everyone, without the position history', () => {
    const state = setup()
    const view = windSwap.viewFor(state, null)
    expect(view.hands).toEqual(state.hands)
    expect(view.drifting).toBe(state.drifting)
    expect('seen' in view).toBe(false)
    expect(windSwap.viewFor(state, 'a')).toEqual(view)
  })
})
