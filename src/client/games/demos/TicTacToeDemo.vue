<script setup lang="ts">
// Practice for the lobby: spot the square that makes three in a row.
import { computed, ref } from 'vue'
import type { PublicPlayer } from '../../../shared/protocol'
import DemoFrame from './DemoFrame.vue'

defineProps<{ you: string; players: PublicPlayer[] }>()

type Mark = 'X' | 'O' | null
const X = 'X' as const
const O = 'O' as const
const _ = null

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

/** Boards where X is to move and can win at once. */
const PUZZLES: Mark[][] = [
  [X, X, _, O, O, _, _, _, _],
  [X, O, _, _, X, O, _, _, _],
  [O, _, X, _, _, X, O, _, _],
  [X, O, X, O, _, _, X, O, _],
  [_, O, _, X, X, _, O, _, _],
  [_, _, _, O, X, O, X, _, _],
]
const ROUNDS = 3

const order = ref<number[]>([])
const round = ref(0)
const board = ref<Mark[]>([])
const line = ref<number[] | null>(null)
const note = ref('')

function load() {
  board.value = [...PUZZLES[order.value[round.value]!]!]
  line.value = null
  note.value = ''
}

function restart() {
  order.value = PUZZLES.map((_puzzle, index) => index)
    .sort(() => Math.random() - 0.5)
    .slice(0, ROUNDS)
  round.value = 0
  load()
}

const done = computed(() => line.value !== null && round.value === ROUNDS - 1)

function place(cell: number) {
  if (line.value || board.value[cell]) return
  const next = [...board.value]
  next[cell] = X
  const made = LINES.find((cells) => cells.every((index) => next[index] === X))
  if (!made) {
    note.value = 'No line there. Look for two X’s with a gap.'
    return
  }
  board.value = next
  line.value = made
  note.value = 'Three in a row!'
}

function nextBoard() {
  round.value++
  load()
}

restart()
</script>

<template>
  <DemoFrame label="find the winning square" :over="done ? 'That’s the whole game: three in a row.' : ''" @restart="restart">
    <p class="status">You’re X. Board {{ round + 1 }} of {{ ROUNDS }}: win in one move.</p>
    <div class="board">
      <button
        v-for="(cell, index) in board"
        :key="index"
        class="cell"
        :class="{ winning: line?.includes(index), o: cell === 'O' }"
        :disabled="!!line || cell !== null"
        :aria-label="`Square ${index + 1}: ${cell ?? 'empty'}`"
        @click="place(index)"
      >
        {{ cell }}
      </button>
    </div>
    <p class="note" aria-live="polite">{{ note || ' ' }}</p>
    <button v-if="line && !done" class="primary" @click="nextBoard">Next board</button>
  </DemoFrame>
</template>

<style scoped>
.status {
  font-weight: 700;
}

.board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.4rem;
  width: min(100%, 13rem);
}

.cell {
  aspect-ratio: 1;
  padding: 0;
  font-size: 2rem;
  font-weight: 800;
  color: var(--accent);
}

.cell.o {
  color: var(--ink);
}

.cell:disabled {
  opacity: 1;
  cursor: default;
}

.cell.winning {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.note {
  color: var(--muted);
}
</style>
