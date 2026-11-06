import type { Component } from 'vue'
import ColorClues from './ColorClues.vue'
import LuckyStreak from './LuckyStreak.vue'
import LuckyStreakRevengeRules from './rules/LuckyStreakRevengeRules.vue'
import LuckyStreakRules from './rules/LuckyStreakRules.vue'
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
  'tic-tac-toe': { component: TicTacToe, rules: TicTacToeRules },
}
