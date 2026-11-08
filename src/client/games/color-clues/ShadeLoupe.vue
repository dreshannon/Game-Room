<script lang="ts">
import { COLUMNS, ROWS } from '../../../games/color-clues/logic'

export const LOUPE_COLUMNS = 9
export const LOUPE_ROWS = 7

/** The top-left corner of the zoomed window around a cell, kept inside the board. */
export function loupeWindow(center: number) {
  const row = Math.floor(center / COLUMNS)
  const column = center % COLUMNS
  return {
    top: Math.min(Math.max(0, row - Math.floor(LOUPE_ROWS / 2)), ROWS - LOUPE_ROWS),
    left: Math.min(Math.max(0, column - Math.floor(LOUPE_COLUMNS / 2)), COLUMNS - LOUPE_COLUMNS),
  }
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { BOARD_COLORS } from '../../../games/color-clues/colors'
import { cellLabel } from '../../../games/color-clues/logic'

export interface LoupeToken {
  background: string
  color: string
  initial: string
  name: string
}

const props = defineProps<{
  center: number
  selected: number | null
  target: number | null
  clickable: (cell: number) => boolean
  tokenAt: (cell: number) => LoupeToken | null
}>()

const emit = defineEmits<{ pick: [cell: number]; recenter: [cell: number]; close: [] }>()

const corner = computed(() => loupeWindow(props.center))

const rows = computed(() =>
  Array.from({ length: LOUPE_ROWS }, (_, r) => {
    const row = corner.value.top + r
    return {
      label: String.fromCharCode(65 + row),
      cells: Array.from({ length: LOUPE_COLUMNS }, (_, c) => row * COLUMNS + corner.value.left + c),
    }
  }),
)

const columns = computed(() => Array.from({ length: LOUPE_COLUMNS }, (_, c) => corner.value.left + c + 1))

const STEP = 3
function pan(rowStep: number, columnStep: number) {
  const { top, left } = corner.value
  const row = Math.min(Math.max(0, top + rowStep), ROWS - LOUPE_ROWS) + Math.floor(LOUPE_ROWS / 2)
  const column = Math.min(Math.max(0, left + columnStep), COLUMNS - LOUPE_COLUMNS) + Math.floor(LOUPE_COLUMNS / 2)
  emit('recenter', row * COLUMNS + column)
}

const canPan = computed(() => ({
  up: corner.value.top > 0,
  down: corner.value.top < ROWS - LOUPE_ROWS,
  left: corner.value.left > 0,
  right: corner.value.left < COLUMNS - LOUPE_COLUMNS,
}))

function describe(cell: number) {
  const token = props.tokenAt(cell)
  return token ? `${cellLabel(cell)}, ${token.name}’s token` : cellLabel(cell)
}
</script>

<template>
  <section class="loupe" aria-label="Zoomed view of the board">
    <div class="loupe-head">
      <span class="eyebrow">Zoomed in · tap the board to move</span>
      <button class="close" type="button" aria-label="Close zoomed view" @click="emit('close')">✕</button>
    </div>
    <div class="grid">
        <span class="axis"></span>
        <span v-for="column in columns" :key="`c${column}`" class="axis">{{ column }}</span>
        <template v-for="row in rows" :key="row.label">
          <span class="axis">{{ row.label }}</span>
          <button
            v-for="cell in row.cells"
            :key="cell"
            type="button"
            class="cell"
            :class="{ selected: selected === cell, target: target === cell }"
            :style="{ background: BOARD_COLORS[cell] }"
            :disabled="!clickable(cell)"
            :aria-label="describe(cell)"
            :aria-pressed="selected === cell"
            @click="emit('pick', cell)"
          >
            <span
              v-if="tokenAt(cell)"
              class="token"
              :style="{ background: tokenAt(cell)!.background, color: tokenAt(cell)!.color }"
            >
              {{ tokenAt(cell)!.initial }}
            </span>
          </button>
        </template>
      </div>
    <div class="pans">
      <button class="pan" type="button" :disabled="!canPan.left" aria-label="Move left" @click="pan(0, -STEP)">◀</button>
      <button class="pan" type="button" :disabled="!canPan.up" aria-label="Move up" @click="pan(-STEP, 0)">▲</button>
      <button class="pan" type="button" :disabled="!canPan.down" aria-label="Move down" @click="pan(STEP, 0)">▼</button>
      <button class="pan" type="button" :disabled="!canPan.right" aria-label="Move right" @click="pan(0, STEP)">▶</button>
    </div>
  </section>
</template>

<style scoped>
.loupe {
  display: grid;
  gap: 0.4rem;
  padding: 0.5rem;
  border: 2px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  animation: open 0.2s ease-out;
}

.loupe-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.close {
  padding: 0.15rem 0.5rem;
}

.pans {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
}

.pan {
  padding: 0.35rem 0;
  font-size: 0.8rem;
}

.grid {
  display: grid;
  grid-template-columns: 1rem repeat(9, minmax(0, 1fr));
  gap: 2px;
  width: 100%;
  padding: 2px 3px 3px 2px;
  border-radius: 0.3rem;
  background: #111111;
}

.axis {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 0.6rem;
  font-weight: 700;
}

.cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
}

.cell:disabled {
  opacity: 1;
  cursor: default;
}

.cell.selected,
.cell.target {
  z-index: 1;
  outline: 3px solid #ffffff;
  box-shadow: 0 0 0 5px #111111;
}

.token {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72%;
  aspect-ratio: 1;
  border-radius: 50%;
  box-shadow:
    0 0 0 1.5px #ffffff,
    0 0 0 3px #111111;
  font-size: 0.8rem;
  font-weight: 800;
}

@keyframes open {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loupe {
    animation: none;
  }
}
</style>
