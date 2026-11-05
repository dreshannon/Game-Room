import type { Component } from 'vue'
import TicTacToe from './TicTacToe.vue'

/**
 * Game components receive `view`, `you` (player id) and `players` as props,
 * and emit `move` with whatever the game's applyMove expects.
 */
export const gameViews: Record<string, Component> = {
  'tic-tac-toe': TicTacToe,
}
