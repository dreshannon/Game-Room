import { describe, expect, it } from 'vitest'
import { MoveError } from '../types'
import { ticTacToe, winsNeeded, type TicTacToeState } from './logic'

const setup = (bestOf = 3) => ticTacToe.setup(['a', 'b'], { bestOf })

/** Plays cells in order, with X and O alternating. */
function playCells(state: TicTacToeState, cells: number[]) {
  return cells.reduce(
    (next, cell) => ticTacToe.applyMove(next, next.players[next.turn], { type: 'place', cell }),
    state,
  )
}

// X takes the top row.
const X_WINS = [0, 3, 1, 4, 2]
const DRAW = [0, 1, 2, 4, 3, 5, 7, 6, 8]

const nextGame = (state: TicTacToeState) =>
  ticTacToe.applyMove(state, state.seats[0], { type: 'nextGame', game: state.game })

describe('a single game', () => {
  it('starts with X, and only lets each player move on their turn', () => {
    const state = setup()
    expect(state.turn).toBe('X')
    expect(() => ticTacToe.applyMove(state, state.players.O, { type: 'place', cell: 0 })).toThrow('not your turn')
    const next = ticTacToe.applyMove(state, state.players.X, { type: 'place', cell: 4 })
    expect(next.turn).toBe('O')
    expect(ticTacToe.waitingOn!(next)).toEqual([state.players.O])
  })

  it.each([-1, 9, 1.5, '4', null])('rejects %s as a square', (cell) => {
    const state = setup()
    expect(() => ticTacToe.applyMove(state, state.players.X, { type: 'place', cell })).toThrow(MoveError)
  })

  it('rejects taken squares and moves after the game ends', () => {
    const state = playCells(setup(), [4])
    expect(() => ticTacToe.applyMove(state, state.players.O, { type: 'place', cell: 4 })).toThrow('taken')
    const won = playCells(setup(), X_WINS)
    expect(() => ticTacToe.applyMove(won, won.players.O, { type: 'place', cell: 8 })).toThrow('over')
  })

  it('shows the winning line and who won', () => {
    const state = playCells(setup(), X_WINS)
    const view = ticTacToe.viewFor(state, null)
    expect(view.winningLine).toEqual([0, 1, 2])
    expect(view.gameResult).toBe(state.players.X)
    expect(ticTacToe.waitingOn!(state)).toEqual([])
  })

  it('counts a full board with no line as a draw', () => {
    const state = playCells(setup(), DRAW)
    expect(ticTacToe.viewFor(state, null).gameResult).toBe('draw')
    expect(state.draws).toBe(1)
  })

  it('rejects moves from anyone not playing, such as spectators', () => {
    expect(() => ticTacToe.applyMove(setup(), 'watcher', { type: 'place', cell: 0 })).toThrow('not playing')
  })
})

describe('a series', () => {
  it('needs a majority of the games to win', () => {
    expect(winsNeeded(1)).toBe(1)
    expect(winsNeeded(3)).toBe(2)
    expect(winsNeeded(5)).toBe(3)
    expect(winsNeeded(7)).toBe(4)
  })

  it('takes turns going first, and keeps score', () => {
    let state = setup()
    const [first, second] = state.seats
    expect(state.players.X).toBe(first)
    state = playCells(state, X_WINS)
    expect(state.wins).toEqual([1, 0])
    expect(ticTacToe.result(state)).toBeNull()

    state = nextGame(state)
    expect(state.game).toBe(2)
    expect(state.players.X).toBe(second)
    expect(state.board.every((cell) => cell === null)).toBe(true)
    state = playCells(state, X_WINS)
    expect(state.wins).toEqual([1, 1])

    state = nextGame(state)
    expect(state.players.X).toBe(first)
  })

  it('ends when someone wins the majority, not counting draws', () => {
    let state = playCells(setup(), DRAW)
    state = playCells(nextGame(state), X_WINS)
    state = playCells(nextGame(state), X_WINS)
    // Draw, then each seat won once as X.
    expect(state.wins).toEqual([1, 1])
    state = playCells(nextGame(state), X_WINS)
    expect(ticTacToe.result(state)).toEqual({ winnerIds: [state.seats[1]] })
    expect(() => nextGame(state)).toThrow('series is over')
  })

  it('ends after one game when the series is a single game', () => {
    const state = playCells(setup(1), X_WINS)
    expect(ticTacToe.result(state)).toEqual({ winnerIds: [state.players.X] })
  })

  it('does not start the next game early, or twice from a double click', () => {
    expect(() => nextGame(setup())).toThrow('Finish')
    const done = playCells(setup(), X_WINS)
    const next = nextGame(done)
    expect(ticTacToe.applyMove(next, next.seats[1], { type: 'nextGame', game: 1 })).toBe(next)
  })
})

describe('setup', () => {
  it('is a two-seat game where the host picks the players', () => {
    expect(ticTacToe.seats).toBe(2)
    expect(new Set(setup().seats)).toEqual(new Set(['a', 'b']))
  })
})
