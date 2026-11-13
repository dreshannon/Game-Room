<script setup lang="ts">
// Practice for the lobby: find the shade a ready-made clue points at, on a small patch of the board.
import { computed, ref } from 'vue'
import { BOARD_COLORS } from '../../../games/color-clues/colors'
import { COLUMNS, ROWS } from '../../../games/color-clues/logic'
import type { PublicPlayer } from '../../../shared/protocol'
import DemoFrame from './DemoFrame.vue'

defineProps<{ you: string; players: PublicPlayer[] }>()

/** Clues and the board space each one points at, as [row, column]. */
const CLUES: { clue: string; at: [number, number] }[] = [
  { clue: 'Tomato', at: [0, 10] },
  { clue: 'Lemon', at: [11, 0] },
  { clue: 'Lawn', at: [15, 6] },
  { clue: 'Flamingo', at: [4, 14] },
  { clue: 'Lagoon', at: [15, 24] },
  { clue: 'Pumpkin', at: [4, 5] },
  { clue: 'Grape', at: [0, 24] },
  { clue: 'Sky', at: [11, 19] },
]
const ROUNDS = 3
const PATCH_COLUMNS = 9
const PATCH_ROWS = 7

interface Patch {
  clue: string
  /** The answer, as a row and column inside the patch. */
  row: number
  column: number
  colors: string[]
}

const between = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** Cuts a patch out of the board with the answer somewhere inside it. */
function patchFor({ clue, at: [row, column] }: (typeof CLUES)[number]): Patch {
  const top = between(row - 1 - Math.floor(Math.random() * (PATCH_ROWS - 2)), 0, ROWS - PATCH_ROWS)
  const left = between(column - 1 - Math.floor(Math.random() * (PATCH_COLUMNS - 2)), 0, COLUMNS - PATCH_COLUMNS)
  const colors: string[] = []
  for (let r = 0; r < PATCH_ROWS; r++)
    for (let c = 0; c < PATCH_COLUMNS; c++) colors.push(BOARD_COLORS[(top + r) * COLUMNS + left + c]!)
  return { clue, row: row - top, column: column - left, colors }
}

const patches = ref<Patch[]>([])
const round = ref(0)
const guess = ref<number | null>(null)
const score = ref(0)

const patch = computed(() => patches.value[round.value]!)
const over = computed(() => guess.value !== null && round.value === ROUNDS - 1)

/** How far a patch space is from the answer, counting diagonals as one step. */
function distance(cell: number) {
  const row = Math.floor(cell / PATCH_COLUMNS)
  const column = cell % PATCH_COLUMNS
  return Math.max(Math.abs(row - patch.value.row), Math.abs(column - patch.value.column))
}

const pointsFor = (cell: number) => [3, 2, 1][distance(cell)] ?? 0

const status = computed(() => {
  if (guess.value === null) return 'Tap the shade you think it is.'
  const points = pointsFor(guess.value)
  if (points === 3) return 'Exactly right! 3 points.'
  if (points === 2) return 'Inside the box: 2 points.'
  if (points === 1) return 'Touching the box: 1 point.'
  return 'Outside the box. No points.'
})

function restart() {
  patches.value = [...CLUES]
    .sort(() => Math.random() - 0.5)
    .slice(0, ROUNDS)
    .map(patchFor)
  round.value = 0
  score.value = 0
  guess.value = null
}

function pick(cell: number) {
  if (guess.value !== null) return
  guess.value = cell
  score.value += pointsFor(cell)
}

function nextClue() {
  round.value++
  guess.value = null
}

restart()
</script>

<template>
  <DemoFrame label="follow the clue" :over="over ? `${score} of ${ROUNDS * 3} points.` : ''" @restart="restart">
    <p class="muted">Clue {{ round + 1 }} of {{ ROUNDS }} · {{ score }} points</p>
    <p class="clue">
      <span class="muted">The clue is</span>
      <strong>{{ patch.clue }}</strong>
    </p>
    <div class="patch" :style="{ '--columns': PATCH_COLUMNS }">
      <button
        v-for="(color, cell) in patch.colors"
        :key="cell"
        class="shade"
        :class="{
          boxed: guess !== null && distance(cell) <= 1,
          answer: guess !== null && distance(cell) === 0,
          picked: guess === cell,
        }"
        :style="{ background: color }"
        :disabled="guess !== null"
        :aria-label="`Shade ${cell + 1}${guess !== null && distance(cell) === 0 ? ', the answer' : ''}${guess === cell ? ', your pick' : ''}`"
        @click="pick(cell)"
      >
        <span v-if="guess === cell" class="token" aria-hidden="true"></span>
      </button>
    </div>
    <p class="status" aria-live="polite">{{ status }}</p>
    <p v-if="guess !== null" class="muted key">The ringed shade was the answer. The lit box around it scores too.</p>
    <button v-if="guess !== null && !over" class="primary" @click="nextClue">Next clue</button>
  </DemoFrame>
</template>

<style scoped>
.clue {
  display: grid;
}

.clue strong {
  font-size: 1.4rem;
}

.patch {
  display: grid;
  grid-template-columns: repeat(var(--columns), 1fr);
  gap: 2px;
  width: min(100%, 21rem);
  padding: 3px;
  border-radius: var(--radius);
  background: #222;
}

.shade {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border: none;
  border-radius: 3px;
}

.shade:disabled {
  opacity: 0.35;
  cursor: default;
}

.shade.boxed:disabled,
.shade.picked:disabled {
  opacity: 1;
}

.shade.answer {
  z-index: 1;
  outline: 3px solid #fff;
  box-shadow: 0 0 0 5px #222;
}

.token {
  width: 55%;
  aspect-ratio: 1;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #222;
}

.status {
  font-weight: 700;
}

.key {
  font-size: 0.9rem;
}
</style>
