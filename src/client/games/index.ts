import type { Component } from 'vue'
import ColorClues from './ColorClues.vue'
import DialInDemo from './demos/DialInDemo.vue'
import LuckyStreakDemo from './demos/LuckyStreakDemo.vue'
import MascotMayhemDemo from './demos/MascotMayhemDemo.vue'
import MidnightLiftDemo from './demos/MidnightLiftDemo.vue'
import OverheatDemo from './demos/OverheatDemo.vue'
import ShadeHuntDemo from './demos/ShadeHuntDemo.vue'
import TicTacToeDemo from './demos/TicTacToeDemo.vue'
import TierTalkDemo from './demos/TierTalkDemo.vue'
import WindSwapDemo from './demos/WindSwapDemo.vue'
import DialIn from './DialIn.vue'
import DialInRules from './rules/DialInRules.vue'
import DriftLines from './drift-lines/DriftLines.vue'
import DriftLinesDemo from './drift-lines/DriftLinesDemo.vue'
import DriftLinesRules from './rules/DriftLinesRules.vue'
import LuckyStreak from './LuckyStreak.vue'
import LuckyStreakRevengeRules from './rules/LuckyStreakRevengeRules.vue'
import LuckyStreakRules from './rules/LuckyStreakRules.vue'
import MascotMayhem from './mascot-mayhem/MascotMayhem.vue'
import MascotMayhemRules from './rules/MascotMayhemRules.vue'
import MidnightLift from './midnight-lift/MidnightLift.vue'
import MidnightLiftRules from './rules/MidnightLiftRules.vue'
import OverheatRules from './rules/OverheatRules.vue'
import Overheat from './overheat/Overheat.vue'
import ShadeHuntRules from './rules/ShadeHuntRules.vue'
import TicTacToeRules from './rules/TicTacToeRules.vue'
import TierTalkRules from './rules/TierTalkRules.vue'
import TicTacToe from './TicTacToe.vue'
import TierTalk from './TierTalk.vue'
import WindSwap from './wind-swap/WindSwap.vue'
import WindSwapRules from './rules/WindSwapRules.vue'

export interface GameView {
  /** Receives `view`, `you` (player id) and `players` as props, and emits `move`. */
  component: Component
  /** Shown in the How to play box. */
  rules: Component
  /** A practice version for the lobby, played on your own. Receives `you` and `players` as props. */
  demo?: Component
  /** One line on the game's tile in the lobby. */
  tagline: string
  /** Tints the game's tile in the lobby. */
  accent: string
}

export const gameViews: Record<string, GameView> = {
  'color-clues': {
    component: ColorClues,
    rules: ShadeHuntRules,
    demo: ShadeHuntDemo,
    tagline: 'One-word clues to one color in 480 shades.',
    accent: '#7b2cbf',
  },
  'lucky-streak': {
    component: LuckyStreak,
    rules: LuckyStreakRules,
    demo: LuckyStreakDemo,
    tagline: 'Flip for points, but never the same number twice.',
    accent: '#c8401f',
  },
  'lucky-streak-revenge': {
    component: LuckyStreak,
    rules: LuckyStreakRevengeRules,
    demo: LuckyStreakDemo,
    tagline: 'Push your luck, and push it onto everyone else.',
    accent: '#8e1b3a',
  },
  'tier-talk': {
    component: TierTalk,
    rules: TierTalkRules,
    demo: TierTalkDemo,
    tagline: 'Guess how the Tier Wizard ranks 8 contenders.',
    accent: '#1b8a6b',
  },
  'dial-in': {
    component: DialIn,
    rules: DialInRules,
    demo: DialInDemo,
    tagline: 'Find the hidden spot on the dial from one clue.',
    accent: '#1b4fd8',
  },
  overheat: {
    component: Overheat,
    rules: OverheatRules,
    demo: OverheatDemo,
    tagline: 'Race to the line without cooking your engine.',
    accent: '#e63946',
  },
  'mascot-mayhem': {
    component: MascotMayhem,
    rules: MascotMayhemRules,
    demo: MascotMayhemDemo,
    tagline: 'Bet on a mascot race, then rig the deck.',
    accent: '#f2b705',
  },
  'midnight-lift': {
    component: MidnightLift,
    rules: MidnightLiftRules,
    demo: MidnightLiftDemo,
    tagline: 'One thief, the whole Watch, four nights to get away.',
    accent: '#3a3f52',
  },
  'drift-lines': {
    component: DriftLines,
    rules: DriftLinesRules,
    demo: DriftLinesDemo,
    tagline: 'Lay channels, steer your lantern, keep it lit.',
    accent: '#2b6f8f',
  },
  'wind-swap': {
    component: WindSwap,
    rules: WindSwapRules,
    demo: WindSwapDemo,
    tagline: 'Every wind you use blows over to your rival.',
    accent: '#2f7d8c',
  },
  'tic-tac-toe': {
    component: TicTacToe,
    rules: TicTacToeRules,
    demo: TicTacToeDemo,
    tagline: 'Three in a row. You know this one.',
    accent: '#6b655a',
  },
}
