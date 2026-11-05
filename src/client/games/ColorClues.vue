<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BOARD_COLORS } from '../../games/color-clues/colors'
import {
  COLUMNS,
  ROWS,
  cellLabel,
  type ColorCluesMove,
  type ColorCluesView,
} from '../../games/color-clues/logic'
import type { PublicPlayer } from '../../shared/protocol'

const props = defineProps<{
  view: ColorCluesView
  you: string
  players: PublicPlayer[]
}>()

const emit = defineEmits<{ move: [move: ColorCluesMove] }>()

// Chosen to stand out from each other, and outlined so they show on any board color.
const TOKEN_COLORS = ['#111111', '#ffffff', '#d7263d', '#1b4fd8', '#0b8a3e', '#7b2cbf', '#f28c00', '#00a6a6']
const TOKEN_TEXT = ['#ffffff', '#111111', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#111111', '#111111']

const ROW_LABELS = Array.from({ length: ROWS }, (_, row) => String.fromCharCode(65 + row))

const selectedCell = ref<number | null>(null)
const chosenColor = ref<number | null>(null)
const clueText = ref('')

const nameOf = (id: string) => props.players.find((player) => player.id === id)?.name ?? 'Someone'
const seatOf = (id: string) => props.view.seats[id] ?? 0
const initialOf = (id: string) => Array.from(nameOf(id))[0]?.toUpperCase() ?? '?'

const isGiver = computed(() => props.view.giverId === props.you)
const isYourTurn = computed(() => props.view.turnPlayerId === props.you)
const isReveal = computed(() => props.view.phase === 'reveal')
const isGameOver = computed(
  () =>
    isReveal.value &&
    Object.values(props.view.scores).some((score) => score >= props.view.targetScore),
)

const tokenByCell = computed(() => new Map(props.view.tokens.map((token) => [token.cell, token])))
const canPlaceSelected = computed(
  () =>
    isYourTurn.value && selectedCell.value !== null && !tokenByCell.value.has(selectedCell.value),
)

const standings = computed(() =>
  [...props.view.order].sort((a, b) => (props.view.scores[b] ?? 0) - (props.view.scores[a] ?? 0)),
)

const status = computed(() => {
  const { phase, giverId, turnPlayerId } = props.view
  const giver = nameOf(giverId)
  if (phase === 'firstClue') {
    return isGiver.value ? 'Choose a color and give a one-word clue' : `${giver} is thinking of a clue`
  }
  if (phase === 'secondClue') {
    return isGiver.value ? 'Now give a two-word clue' : `${giver} is thinking of a second clue`
  }
  if (phase === 'reveal') return 'Here’s the answer'
  if (isGiver.value) return `${nameOf(turnPlayerId ?? '')} is guessing`
  return isYourTurn.value ? 'Your turn: place a token' : `${nameOf(turnPlayerId ?? '')} is guessing`
})

/** Highlights the 3x3 scoring box, cut off where it meets the edge of the board. */
const scoringBox = computed(() => {
  const { target } = props.view
  if (!isReveal.value || target === null) return null
  const row = Math.floor(target / COLUMNS)
  const column = target % COLUMNS
  const top = Math.max(0, row - 1)
  const left = Math.max(0, column - 1)
  const bottom = Math.min(ROWS - 1, row + 1)
  const right = Math.min(COLUMNS - 1, column + 1)
  // Grid lines are offset by the row and column of labels.
  return {
    gridRow: `${top + 2} / ${bottom + 3}`,
    gridColumn: `${left + 2} / ${right + 3}`,
  }
})

function cellClick(cell: number) {
  if (props.view.phase === 'firstClue' && isGiver.value) {
    if (props.view.card?.includes(cell)) chosenColor.value = cell
    return
  }
  if (isYourTurn.value && !tokenByCell.value.has(cell)) selectedCell.value = cell
}

function isClickable(cell: number) {
  if (props.view.phase === 'firstClue' && isGiver.value) return !!props.view.card?.includes(cell)
  return isYourTurn.value && !tokenByCell.value.has(cell)
}

function cellDescription(cell: number) {
  const token = tokenByCell.value.get(cell)
  return token ? `${cellLabel(cell)}, ${nameOf(token.playerId)}’s token` : cellLabel(cell)
}

function placeToken() {
  if (selectedCell.value === null) return
  emit('move', { type: 'place', cell: selectedCell.value })
  selectedCell.value = null
}

function submitClue() {
  const text = clueText.value.trim()
  if (props.view.phase === 'firstClue' && chosenColor.value !== null) {
    emit('move', { type: 'firstClue', cell: chosenColor.value, word: text })
  } else if (props.view.phase === 'secondClue') {
    emit('move', { type: 'secondClue', words: text })
  }
}

// Clue text stays put after a rejected clue, and clears only once the game moves on.
watch(
  () => [props.view.phase, props.view.round],
  () => {
    clueText.value = ''
    selectedCell.value = null
    chosenColor.value = null
  },
)
watch(isYourTurn, () => {
  selectedCell.value = null
})
// Someone else can take the space while you're deciding.
watch(tokenByCell, (tokens) => {
  if (selectedCell.value !== null && tokens.has(selectedCell.value)) selectedCell.value = null
})
</script>

<template>
  <div class="color-clues">
    <header class="round-bar">
      <div>
        <p class="eyebrow">Round {{ view.round }} · {{ nameOf(view.giverId) }} gives the clues</p>
        <p class="status" aria-live="polite">{{ status }}</p>
      </div>
      <div class="clues" aria-live="polite">
        <p v-if="view.firstClue">
          <span class="eyebrow">Clue 1</span>
          <strong>{{ view.firstClue }}</strong>
        </p>
        <p v-if="view.secondClue">
          <span class="eyebrow">Clue 2</span>
          <strong>{{ view.secondClue }}</strong>
        </p>
      </div>
    </header>

    <form
      v-if="isGiver && (view.phase === 'firstClue' || view.phase === 'secondClue')"
      class="clue-form"
      @submit.prevent="submitClue"
    >
      <div v-if="view.card && view.phase === 'firstClue'" class="card" role="group" aria-label="Your card">
        <button
          v-for="cell in view.card"
          :key="cell"
          type="button"
          class="swatch"
          :class="{ chosen: chosenColor === cell }"
          :style="{ background: BOARD_COLORS[cell] }"
          :aria-pressed="chosenColor === cell"
          @click="chosenColor = cell"
        >
          <span class="swatch-label">{{ cellLabel(cell) }}</span>
        </button>
      </div>
      <div class="row">
        <input
          v-model="clueText"
          class="clue-input"
          maxlength="60"
          autocomplete="off"
          :aria-label="view.phase === 'firstClue' ? 'One-word clue' : 'Two-word clue'"
          :placeholder="view.phase === 'firstClue' ? 'One-word clue' : 'Two-word clue'"
        />
        <button
          class="primary"
          type="submit"
          :disabled="!clueText.trim() || (view.phase === 'firstClue' && chosenColor === null)"
        >
          Give clue
        </button>
      </div>
    </form>

    <div v-if="isYourTurn" class="place-bar">
      <span v-if="selectedCell === null">Tap a space. Tokens can’t be moved once placed.</span>
      <template v-else>
        <span class="selected-swatch" :style="{ background: BOARD_COLORS[selectedCell] }"></span>
        <span>{{ cellLabel(selectedCell) }}</span>
      </template>
      <button class="primary" :disabled="!canPlaceSelected" @click="placeToken">Place token</button>
    </div>

    <div class="play-area">
      <div class="board-scroll">
        <div class="board">
          <span class="corner"></span>
          <span v-for="column in COLUMNS" :key="`c${column}`" class="axis">{{ column }}</span>
          <template v-for="(label, row) in ROW_LABELS" :key="label">
            <span class="axis">{{ label }}</span>
            <button
              v-for="column in COLUMNS"
              :key="column"
              class="cell"
              :class="{
                selected: selectedCell === row * COLUMNS + column - 1,
                'on-card': view.phase === 'firstClue' && view.card?.includes(row * COLUMNS + column - 1),
                chosen: chosenColor === row * COLUMNS + column - 1,
                target: view.target === row * COLUMNS + column - 1,
              }"
              :style="{ background: BOARD_COLORS[row * COLUMNS + column - 1] }"
              :disabled="!isClickable(row * COLUMNS + column - 1)"
              :aria-label="cellDescription(row * COLUMNS + column - 1)"
              :title="cellDescription(row * COLUMNS + column - 1)"
              @click="cellClick(row * COLUMNS + column - 1)"
            >
              <span
                v-if="tokenByCell.has(row * COLUMNS + column - 1)"
                class="token"
                :style="{
                  background: TOKEN_COLORS[seatOf(tokenByCell.get(row * COLUMNS + column - 1)!.playerId)],
                  color: TOKEN_TEXT[seatOf(tokenByCell.get(row * COLUMNS + column - 1)!.playerId)],
                }"
              >
                {{ initialOf(tokenByCell.get(row * COLUMNS + column - 1)!.playerId) }}
              </span>
            </button>
          </template>
          <div v-if="scoringBox" class="scoring-box" :style="scoringBox"></div>
        </div>
      </div>

      <aside class="scores">
        <h2>Scores</h2>
        <p class="muted">First to {{ view.targetScore }}</p>
        <ol>
          <li v-for="id in standings" :key="id">
            <span class="token" :style="{ background: TOKEN_COLORS[seatOf(id)], color: TOKEN_TEXT[seatOf(id)] }">
              {{ initialOf(id) }}
            </span>
            <span class="score-name">{{ nameOf(id) }}</span>
            <span v-if="view.roundScores?.[id] !== undefined" class="gain">+{{ view.roundScores[id] }}</span>
            <strong>{{ view.scores[id] ?? 0 }}</strong>
          </li>
        </ol>
        <button
          v-if="isReveal && !isGameOver"
          class="primary next-round"
          @click="emit('move', { type: 'nextRound', round: view.round })"
        >
          Next round
        </button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.color-clues {
  display: grid;
  gap: 0.9rem;
  width: 100%;
  min-width: 0;
}

.round-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem 2rem;
}

.status {
  font-size: 1.2rem;
  font-weight: 700;
}

.clues {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
}

.clues p {
  display: grid;
}

.clues strong {
  font-size: 1.25rem;
  overflow-wrap: anywhere;
}

.clue-form {
  display: grid;
  gap: 0.75rem;
}

.card {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.swatch {
  display: flex;
  align-items: flex-end;
  width: 4.5rem;
  height: 4.5rem;
  padding: 0.25rem;
  border: 2px solid var(--line);
}

.swatch.chosen {
  border-color: var(--ink);
  outline: 3px solid var(--accent);
  outline-offset: 1px;
}

.swatch-label {
  padding: 0 0.3rem;
  border-radius: 0.25rem;
  background: #111111;
  color: #ffffff;
  font-size: 0.75rem;
}

.clue-input {
  flex: 1 1 12rem;
  min-width: 0;
}

.place-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  background: var(--accent-soft);
  font-weight: 600;
}

.place-bar button {
  margin-left: auto;
}

.selected-swatch {
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid var(--ink);
  border-radius: 0.2rem;
}

.play-area {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 14rem;
  gap: 1rem;
  align-items: start;
}

/* On narrow screens the board scrolls by itself so spaces stay big enough to tap. */
.board-scroll {
  overflow-x: auto;
  border-radius: 0.3rem;
}

.board {
  position: relative;
  display: grid;
  grid-template-columns: 1.1rem repeat(30, minmax(0, 1fr));
  gap: 2px;
  min-width: 46rem;
  padding: 2px 4px 4px 2px;
  background: #111111;
}

.axis {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1.3;
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

.cell:hover:not(:disabled),
.cell.selected,
.cell.on-card,
.cell.target,
.cell.chosen {
  outline: 2px solid #ffffff;
  outline-offset: 0;
  box-shadow: 0 0 0 3px #111111;
  z-index: 1;
}

.cell.selected,
.cell.chosen {
  outline-width: 3px;
}

.token {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 78%;
  aspect-ratio: 1;
  border-radius: 50%;
  box-shadow:
    0 0 0 1.5px #ffffff,
    0 0 0 3px #111111;
  font-size: 0.6rem;
  font-weight: 800;
  line-height: 1;
}

/* Absolute so it sits over its grid area without taking up a place in the grid. */
.scoring-box {
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 3px solid #ffffff;
  box-shadow:
    0 0 0 2px #111111,
    inset 0 0 0 2px #111111;
  pointer-events: none;
}

.scores {
  display: grid;
  gap: 0.5rem;
}

.scores ol {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.scores li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.scores .token {
  width: 1.4rem;
  font-size: 0.7rem;
}

.score-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.gain {
  color: var(--muted);
  font-size: 0.85rem;
}

.next-round {
  margin-top: 0.5rem;
  width: 100%;
}

/* Stack before the board would need to scroll beside the scores. */
@media (max-width: 1080px) {
  .play-area {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
