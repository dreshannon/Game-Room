import { MoveError, type Game } from '../types'

export type Mark = 'X' | 'O'

export interface TicTacToeState {
  /** The two players, in the order they were seated. */
  seats: [string, string]
  /** Series wins for each seat. */
  wins: [number, number]
  draws: number
  bestOf: number
  /** Which game of the series this is, from 1. */
  game: number
  board: (Mark | null)[]
  players: Record<Mark, string>
  turn: Mark
}

export interface TicTacToeView extends TicTacToeState {
  winningLine: number[] | null
  /** The winner of the current game, or 'draw', or null while it's being played. */
  gameResult: string | null
  winsNeeded: number
  seriesOver: boolean
}

export type TicTacToeMove = { type: 'place'; cell: number } | { type: 'nextGame'; game: number }

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

/** The winner's player id, 'draw', or null if the game is still going. */
function gameResult(state: TicTacToeState): string | null {
  const line = findWinningLine(state.board)
  if (line) return state.players[state.board[line[0]!]!]
  return state.board.every(Boolean) ? 'draw' : null
}

export const winsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1

function seriesWinner(state: TicTacToeState) {
  const needed = winsNeeded(state.bestOf)
  const index = state.wins.findIndex((wins) => wins >= needed)
  return index === -1 ? null : state.seats[index]!
}

/** Starts a game of the series. The seats take turns going first as X. */
function startGame(state: TicTacToeState, game: number): TicTacToeState {
  const first = state.seats[(game - 1) % 2]!
  const second = state.seats[game % 2]!
  return {
    ...state,
    game,
    board: Array<Mark | null>(9).fill(null),
    players: { X: first, O: second },
    turn: 'X',
  }
}

export const ticTacToe: Game<TicTacToeState, TicTacToeView> = {
  id: 'tic-tac-toe',
  name: 'Tic-Tac-Toe',
  minPlayers: 2,
  maxPlayers: 2,
  seats: 2,
  options: [
    {
      key: 'bestOf',
      label: 'Series',
      min: 1,
      max: 7,
      default: 3,
      choices: [
        { value: 1, label: 'One game' },
        { value: 3, label: 'Best of 3' },
        { value: 5, label: 'Best of 5' },
        { value: 7, label: 'Best of 7' },
      ],
    },
  ],

  setup(playerIds, options) {
    // Who goes first in the first game is random. After that, it alternates.
    const seats = (Math.random() < 0.5 ? [...playerIds] : [...playerIds].reverse()) as [string, string]
    const initial: TicTacToeState = {
      seats,
      wins: [0, 0],
      draws: 0,
      bestOf: options.bestOf ?? 3,
      game: 0,
      board: [],
      players: { X: seats[0], O: seats[1] },
      turn: 'X',
    }
    return startGame(initial, 1)
  },

  applyMove(state, playerId, rawMove) {
    if (!state.seats.includes(playerId)) throw new MoveError('You are not playing in this game.')
    const move = (rawMove ?? {}) as Record<string, unknown>

    if (move.type === 'nextGame') {
      // Both players may click at once; only the first click counts.
      if (move.game !== state.game) return state
      if (gameResult(state) === null) throw new MoveError('Finish this game first.')
      if (seriesWinner(state)) throw new MoveError('The series is over.')
      return startGame(state, state.game + 1)
    }

    if (gameResult(state) !== null) throw new MoveError('This game is over.')
    if (state.players[state.turn] !== playerId) throw new MoveError('It is not your turn.')

    const cell = move.cell
    if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell > 8) {
      throw new MoveError('That is not a square on the board.')
    }
    if (state.board[cell]) throw new MoveError('That square is taken.')

    const board = [...state.board]
    board[cell] = state.turn
    const next: TicTacToeState = { ...state, board, turn: state.turn === 'X' ? 'O' : 'X' }

    // Record the result as soon as the game ends.
    const result = gameResult(next)
    if (result === 'draw') return { ...next, draws: state.draws + 1 }
    if (result) {
      const wins = [...state.wins] as [number, number]
      wins[state.seats.indexOf(result)]! += 1
      return { ...next, wins }
    }
    return next
  },

  viewFor(state) {
    return {
      ...state,
      winningLine: findWinningLine(state.board),
      gameResult: gameResult(state),
      winsNeeded: winsNeeded(state.bestOf),
      seriesOver: seriesWinner(state) !== null,
    }
  },

  result(state) {
    const winner = seriesWinner(state)
    return winner ? { winnerIds: [winner] } : null
  },

  waitingOn(state) {
    if (gameResult(state) !== null) return []
    return [state.players[state.turn]]
  },
}
