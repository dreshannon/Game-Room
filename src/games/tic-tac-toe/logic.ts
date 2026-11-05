import { MoveError, type Game } from '../types'

export type Mark = 'X' | 'O'

export interface TicTacToeState {
  board: (Mark | null)[]
  players: Record<Mark, string>
  turn: Mark
}

export interface TicTacToeView extends TicTacToeState {
  winningLine: number[] | null
}

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

const findWinningLine = (board: TicTacToeState['board']) =>
  LINES.find((line) => {
    const [a, b, c] = line as [number, number, number]
    return board[a] && board[a] === board[b] && board[a] === board[c]
  }) ?? null

export const ticTacToe: Game<TicTacToeState, TicTacToeView> = {
  id: 'tic-tac-toe',
  name: 'Tic-Tac-Toe',
  minPlayers: 2,
  maxPlayers: 2,

  setup(playerIds) {
    const [first, second] = Math.random() < 0.5 ? playerIds : [...playerIds].reverse()
    return {
      board: Array<Mark | null>(9).fill(null),
      players: { X: first!, O: second! },
      turn: 'X',
    }
  },

  applyMove(state, playerId, move) {
    if (ticTacToe.result(state)) throw new MoveError('The game is over.')
    if (state.players.X !== playerId && state.players.O !== playerId) {
      throw new MoveError('You are not playing in this game.')
    }
    if (state.players[state.turn] !== playerId) throw new MoveError('It is not your turn.')

    const cell = (move as { cell?: unknown } | null)?.cell
    if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell > 8) {
      throw new MoveError('That is not a square on the board.')
    }
    if (state.board[cell]) throw new MoveError('That square is taken.')

    const board = [...state.board]
    board[cell] = state.turn
    return { ...state, board, turn: state.turn === 'X' ? 'O' : 'X' }
  },

  viewFor(state) {
    return { ...state, winningLine: findWinningLine(state.board) }
  },

  result(state) {
    const line = findWinningLine(state.board)
    if (line) return { winnerIds: [state.players[state.board[line[0]!]!]] }
    return state.board.every(Boolean) ? { winnerIds: [] } : null
  },
}
