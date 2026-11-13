import { colorClues } from './color-clues/logic'
import { dialIn } from './dial-in/logic'
import { driftLines } from './drift-lines/logic'
import { luckyStreak, luckyStreakRevenge } from './lucky-streak/engine'
import { mascotMayhem } from './mascot-mayhem/logic'
import { midnightLift } from './midnight-lift/logic'
import { overheat } from './overheat/logic'
import { ticTacToe } from './tic-tac-toe/logic'
import { tierTalk } from './tier-talk/logic'
import { windSwap } from './wind-swap/logic'
import type { Game, GameOptionValues } from './types'

// Each game has its own State and View types, which the room never looks inside.
export const games: Game<any, any>[] = [colorClues, luckyStreak, luckyStreakRevenge, tierTalk, dialIn, overheat, mascotMayhem, midnightLift, driftLines, windSwap, ticTacToe]

export const getGame = (id: string) => games.find((game) => game.id === id)

export const defaultOptions = (game: Game<any, any>): GameOptionValues =>
  Object.fromEntries((game.options ?? []).map((option) => [option.key, option.default]))
