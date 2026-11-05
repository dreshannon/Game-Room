import { colorClues } from './color-clues/logic'
import { ticTacToe } from './tic-tac-toe/logic'
import type { Game, GameOptionValues } from './types'

// Each game has its own State and View types, which the room never looks inside.
export const games: Game<any, any>[] = [colorClues, ticTacToe]

export const getGame = (id: string) => games.find((game) => game.id === id)

export const defaultOptions = (game: Game<any, any>): GameOptionValues =>
  Object.fromEntries((game.options ?? []).map((option) => [option.key, option.default]))
