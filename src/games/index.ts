import { ticTacToe } from './tic-tac-toe/logic'
import type { Game } from './types'

// Each game has its own State and View types, which the room never looks inside.
export const games: Game<any, any>[] = [ticTacToe]

export const getGame = (id: string) => games.find((game) => game.id === id)
