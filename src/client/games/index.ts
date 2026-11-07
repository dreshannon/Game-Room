import type { Component } from 'vue'
import ColorClues from './ColorClues.vue'
import DialIn from './DialIn.vue'
import DialInRules from './rules/DialInRules.vue'
import LuckyStreak from './LuckyStreak.vue'
import LuckyStreakRevengeRules from './rules/LuckyStreakRevengeRules.vue'
import LuckyStreakRules from './rules/LuckyStreakRules.vue'
import MascotMayhem from './mascot-mayhem/MascotMayhem.vue'
import MascotMayhemRules from './rules/MascotMayhemRules.vue'
import OverheatRules from './rules/OverheatRules.vue'
import Overheat from './overheat/Overheat.vue'
import ShadeHuntRules from './rules/ShadeHuntRules.vue'
import TicTacToeRules from './rules/TicTacToeRules.vue'
import TierTalkRules from './rules/TierTalkRules.vue'
import TicTacToe from './TicTacToe.vue'
import TierTalk from './TierTalk.vue'

export interface GameView {
  /** Receives `view`, `you` (player id) and `players` as props, and emits `move`. */
  component: Component
  /** Shown in the How to play box. */
  rules: Component
}

export const gameViews: Record<string, GameView> = {
  'color-clues': { component: ColorClues, rules: ShadeHuntRules },
  'lucky-streak': { component: LuckyStreak, rules: LuckyStreakRules },
  'lucky-streak-revenge': { component: LuckyStreak, rules: LuckyStreakRevengeRules },
  'tier-talk': { component: TierTalk, rules: TierTalkRules },
  'dial-in': { component: DialIn, rules: DialInRules },
  overheat: { component: Overheat, rules: OverheatRules },
  'mascot-mayhem': { component: MascotMayhem, rules: MascotMayhemRules },
  'tic-tac-toe': { component: TicTacToe, rules: TicTacToeRules },
}
