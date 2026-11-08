<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { findBannedWord } from '../../games/color-clues/bannedWords'
import { BOARD_COLORS } from '../../games/color-clues/colors'
import {
  COLUMNS,
  ROWS,
  cellLabel,
  distance,
  guessersAfter,
  guesserPoints,
  type ColorCluesMove,
  type ColorCluesView,
} from '../../games/color-clues/logic'
import type { PublicPlayer } from '../../shared/protocol'
import ShadeLoupe, { LOUPE_COLUMNS, LOUPE_ROWS, loupeWindow, type LoupeToken } from './color-clues/ShadeLoupe.vue'

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
const rowCells = (row: number) => Array.from({ length: COLUMNS }, (_, column) => row * COLUMNS + column)

const selectedCell = ref<number | null>(null)
const chosenColor = ref<number | null>(null)
const clueText = ref('')

const nameOf = (id: string) => props.players.find((player) => player.id === id)?.name ?? 'Someone'
const seatOf = (id: string) => props.view.seats[id] ?? 0
const initialOf = (id: string) => Array.from(nameOf(id))[0]?.toUpperCase() ?? '?'
const tokenColor = (id: string) => ({ background: TOKEN_COLORS[seatOf(id)], color: TOKEN_TEXT[seatOf(id)] })

const isGiver = computed(() => props.view.giverId === props.you)
const isYourTurn = computed(() => props.view.turnPlayerId === props.you)
const isReveal = computed(() => props.view.phase === 'reveal')
const isGameOver = computed(
  () =>
    isReveal.value &&
    Object.values(props.view.scores).some((score) => score >= props.view.targetScore),
)

const tokenByCell = computed(() => new Map(props.view.tokens.map((token) => [token.cell, token])))
const tokenOrder = computed(() => new Map(props.view.tokens.map((token, index) => [token.cell, index])))
const canPlaceSelected = computed(
  () =>
    isYourTurn.value && selectedCell.value !== null && !tokenByCell.value.has(selectedCell.value),
)

const bannedWord = computed(() => findBannedWord(clueText.value.trim().split(/\s+/).filter(Boolean)))

/** Everyone guessing this phase, in turn order, with where each one is up to. */
const guessOrder = computed(() => {
  const { phase, order, giverId, queue } = props.view
  if (phase !== 'firstGuess' && phase !== 'secondGuess') return []
  const guessers = guessersAfter(order, giverId)
  if (phase === 'secondGuess') guessers.reverse()
  return guessers.map((id) => ({
    id,
    state: queue[0] === id ? 'current' : queue.includes(id) ? 'waiting' : 'done',
  }))
})

// ---- Animation ----

const canAnimate = () =>
  typeof window !== 'undefined' &&
  document.visibilityState === 'visible' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

let timers: ReturnType<typeof setTimeout>[] = []
const later = (ms: number, run: () => void) => timers.push(setTimeout(run, ms))
function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}

/** Cells whose token just landed, so it can drop in. */
const dropping = ref(new Set<number>())
watch(
  () => props.view.tokens,
  (next, prev) => {
    if (!prev || !canAnimate()) return
    const before = new Set(prev.map((token) => token.cell))
    const added = next.filter((token) => !before.has(token.cell)).map((token) => token.cell)
    if (added.length === 0) return
    dropping.value = new Set([...dropping.value, ...added])
    setTimeout(() => {
      const rest = new Set(dropping.value)
      added.forEach((cell) => rest.delete(cell))
      dropping.value = rest
    }, 700)
  },
)

// The reveal plays in steps: the board dims, the scoring boxes open out from the answer,
// then each token scores in the order it was placed while the totals count up.
const revealing = ref(false)
const ringsShown = ref(0)
const popped = ref(0)

function settleReveal() {
  clearTimers()
  revealing.value = false
  ringsShown.value = 2
  popped.value = props.view.tokens.length
}

function playReveal() {
  clearTimers()
  if (!canAnimate()) return settleReveal()
  revealing.value = true
  ringsShown.value = 0
  popped.value = 0
  later(700, () => (ringsShown.value = 1))
  later(1050, () => (ringsShown.value = 2))
  const gap = props.view.tokens.length > 12 ? 220 : 380
  const start = 1500
  props.view.tokens.forEach((_, index) => later(start + index * gap, () => (popped.value = index + 1)))
  later(start + props.view.tokens.length * gap + 900, settleReveal)
}

watch(
  () => [props.view.phase, props.view.round] as const,
  ([phase, round], [oldPhase, oldRound]) => {
    if (phase === 'reveal' && oldPhase === 'secondGuess' && round === oldRound) playReveal()
    else if (phase === 'reveal') settleReveal()
    else clearTimers()
  },
)
if (props.view.phase === 'reveal') settleReveal()

const pointsFor = (cell: number) => (props.view.target === null ? 0 : guesserPoints(cell, props.view.target))

/** Scores as they count up during the reveal. */
const shownScores = computed(() => {
  const { scores, roundScores, tokens, target, giverId } = props.view
  if (!revealing.value || !roundScores || target === null) return scores
  const shown: Record<string, number> = {}
  for (const id of Object.keys(scores)) shown[id] = (scores[id] ?? 0) - (roundScores[id] ?? 0)
  for (const token of tokens.slice(0, popped.value)) {
    if (token.playerId in shown) shown[token.playerId]! += guesserPoints(token.cell, target)
    if (distance(token.cell, target) <= 1 && giverId in shown) shown[giverId]! += 1
  }
  return shown
})

const standings = computed(() =>
  [...props.view.order].sort((a, b) => (shownScores.value[b] ?? 0) - (shownScores.value[a] ?? 0)),
)

const status = computed(() => {
  const { phase, giverId, turnPlayerId } = props.view
  const giver = nameOf(giverId)
  if (phase === 'firstClue') {
    return isGiver.value ? 'Choose a color and give a one-word clue' : `${giver} is thinking of a clue`
  }
  if (phase === 'secondClue') {
    return isGiver.value ? 'Now give a second clue of one or two words' : `${giver} is thinking of a second clue`
  }
  if (phase === 'reveal') return revealing.value ? 'Revealing the answer…' : 'Here’s the answer'
  if (isGiver.value) return `${nameOf(turnPlayerId ?? '')} is guessing`
  return isYourTurn.value ? 'Your turn: place a token' : `${nameOf(turnPlayerId ?? '')} is guessing`
})

// ---- Board ----

// On a phone the whole board fits on screen, and tapping it opens a zoomed view to choose from.
const narrow = ref(false)
let narrowQuery: MediaQueryList | null = null
const updateNarrow = () => (narrow.value = !!narrowQuery?.matches)
onMounted(() => {
  narrowQuery = window.matchMedia('(max-width: 700px)')
  updateNarrow()
  narrowQuery.addEventListener('change', updateNarrow)
})
onBeforeUnmount(() => {
  narrowQuery?.removeEventListener('change', updateNarrow)
  clearTimers()
})
watch(narrow, (isNarrow) => {
  if (!isNarrow) loupeCenter.value = null
})

const boardEl = ref<HTMLElement | null>(null)
const loupeCenter = ref<number | null>(null)

function boardTap(event: MouseEvent) {
  if (!narrow.value || !boardEl.value) return
  const first = boardEl.value.querySelector('[data-cell="0"]')?.getBoundingClientRect()
  const last = boardEl.value.querySelector(`[data-cell="${ROWS * COLUMNS - 1}"]`)?.getBoundingClientRect()
  if (!first || !last) return
  const clamp = (value: number, max: number) => Math.min(Math.max(0, value), max)
  const column = clamp(Math.floor(((event.clientX - first.left) / (last.right - first.left)) * COLUMNS), COLUMNS - 1)
  const row = clamp(Math.floor(((event.clientY - first.top) / (last.bottom - first.top)) * ROWS), ROWS - 1)
  loupeCenter.value = row * COLUMNS + column
}

// Grid lines are offset by the row and column of labels, which the phone board leaves out.
const gridOffset = computed(() => (narrow.value ? 1 : 2))

function boxStyle(top: number, left: number, bottom: number, right: number) {
  const offset = gridOffset.value
  return {
    gridRow: `${Math.max(0, top) + offset} / ${Math.min(ROWS - 1, bottom) + offset + 1}`,
    gridColumn: `${Math.max(0, left) + offset} / ${Math.min(COLUMNS - 1, right) + offset + 1}`,
  }
}

/** The box around the answer that scores this many steps out, cut off at the board's edge. */
function scoringBox(reach: number) {
  const { target } = props.view
  if (!isReveal.value || target === null) return null
  const row = Math.floor(target / COLUMNS)
  const column = target % COLUMNS
  return boxStyle(row - reach, column - reach, row + reach, column + reach)
}

const loupeFrame = computed(() => {
  if (loupeCenter.value === null) return null
  const { top, left } = loupeWindow(loupeCenter.value)
  return boxStyle(top, left, top + LOUPE_ROWS - 1, left + LOUPE_COLUMNS - 1)
})

const isDim = (cell: number) =>
  revealing.value && props.view.target !== null && distance(cell, props.view.target) > 2

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

function loupeToken(cell: number): LoupeToken | null {
  const token = tokenByCell.value.get(cell)
  if (!token) return null
  return { ...tokenColor(token.playerId), initial: initialOf(token.playerId), name: nameOf(token.playerId) } as LoupeToken
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
watch(
  () => props.view.round,
  () => (loupeCenter.value = null),
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

    <ol v-if="guessOrder.length" class="guess-order" aria-label="Guessing order">
      <li v-for="guesser in guessOrder" :key="guesser.id" class="chip" :class="guesser.state">
        <span class="token" :style="tokenColor(guesser.id)">{{ initialOf(guesser.id) }}</span>
        <span class="chip-name">{{ guesser.id === you ? 'You' : nameOf(guesser.id) }}</span>
        <span v-if="guesser.state === 'done'" class="chip-mark" aria-label="placed">✓</span>
        <span v-else-if="guesser.state === 'current'" class="visually-hidden">guessing now</span>
      </li>
    </ol>

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
      <div v-else-if="view.target !== null" class="your-color">
        <span class="big-swatch" :style="{ background: BOARD_COLORS[view.target] }"></span>
        <span>Your color, {{ cellLabel(view.target) }}</span>
      </div>
      <div class="row">
        <input
          v-model="clueText"
          class="clue-input"
          maxlength="60"
          autocomplete="off"
          :aria-label="view.phase === 'firstClue' ? 'One-word clue' : 'Second clue, one or two words'"
          :aria-describedby="bannedWord ? 'banned-word' : undefined"
          :placeholder="view.phase === 'firstClue' ? 'One-word clue' : 'One or two words'"
        />
        <button
          class="primary"
          type="submit"
          :disabled="!clueText.trim() || !!bannedWord || (view.phase === 'firstClue' && chosenColor === null)"
        >
          Give clue
        </button>
      </div>
      <p v-if="bannedWord" id="banned-word" class="warning">
        “{{ bannedWord }}” describes a color. Name a thing instead, like an object, food or place.
      </p>
      <p v-else class="muted small">No color names or shade words like “pale” or “bright”.</p>
    </form>

    <div v-if="isYourTurn" class="place-bar">
      <template v-if="selectedCell === null">
        <span class="big-swatch empty" aria-hidden="true"></span>
        <span>{{ narrow ? 'Tap the board to zoom in, then pick a space.' : 'Pick a space.' }} Tokens can’t be moved once placed.</span>
      </template>
      <template v-else>
        <span class="big-swatch" :style="{ background: BOARD_COLORS[selectedCell] }"></span>
        <span class="pick">
          <strong>{{ cellLabel(selectedCell) }}</strong>
          <span class="muted small">for “{{ view.secondClue ?? view.firstClue }}”</span>
        </span>
      </template>
      <button class="primary" :disabled="!canPlaceSelected" @click="placeToken">Place token</button>
    </div>

    <ShadeLoupe
      v-if="narrow && loupeCenter !== null"
      :center="loupeCenter"
      :selected="selectedCell ?? chosenColor"
      :target="isReveal ? view.target : null"
      :clickable="isClickable"
      :token-at="loupeToken"
      @pick="cellClick"
      @recenter="loupeCenter = $event"
      @close="loupeCenter = null"
    />

    <div class="play-area">
      <div class="board-scroll">
        <div
          ref="boardEl"
          class="board"
          :class="{ compact: narrow, revealing }"
          @click="boardTap"
        >
          <template v-if="!narrow">
            <span class="corner"></span>
            <span v-for="column in COLUMNS" :key="`c${column}`" class="axis">{{ column }}</span>
          </template>
          <template v-for="(label, row) in ROW_LABELS" :key="label">
            <span v-if="!narrow" class="axis">{{ label }}</span>
            <button
              v-for="cell in rowCells(row)"
              :key="cell"
              class="cell"
              :data-cell="cell"
              :class="{
                selected: selectedCell === cell,
                'on-card': view.phase === 'firstClue' && view.card?.includes(cell),
                chosen: chosenColor === cell,
                target: view.target === cell,
                dim: isDim(cell),
              }"
              :style="{ background: BOARD_COLORS[cell] }"
              :disabled="!isClickable(cell)"
              :aria-label="cellDescription(cell)"
              :title="cellDescription(cell)"
              @click.stop="cellClick(cell)"
            >
              <span
                v-if="tokenByCell.has(cell)"
                class="token"
                :class="{
                  drop: dropping.has(cell),
                  scored: revealing && tokenOrder.get(cell)! < popped,
                }"
                :style="tokenColor(tokenByCell.get(cell)!.playerId)"
              >
                {{ initialOf(tokenByCell.get(cell)!.playerId) }}
              </span>
              <span
                v-if="revealing && tokenByCell.has(cell) && tokenOrder.get(cell)! < popped"
                class="points"
                :class="{ zero: pointsFor(cell) === 0 }"
                aria-hidden="true"
              >
                +{{ pointsFor(cell) }}
              </span>
            </button>
          </template>
          <div v-if="ringsShown >= 2 && scoringBox(2)" class="scoring-box outer" :style="scoringBox(2)!"></div>
          <div v-if="ringsShown >= 1 && scoringBox(1)" class="scoring-box" :style="scoringBox(1)!"></div>
          <div v-if="narrow && loupeFrame" class="loupe-frame" :style="loupeFrame"></div>
        </div>
      </div>

      <aside class="scores">
        <h2>Scores</h2>
        <p class="muted">First to {{ view.targetScore }}</p>
        <ol>
          <li v-for="id in standings" :key="id">
            <span class="token" :style="tokenColor(id)">{{ initialOf(id) }}</span>
            <span class="score-name">{{ nameOf(id) }}</span>
            <span v-if="!revealing && view.roundScores?.[id] !== undefined" class="gain">+{{ view.roundScores[id] }}</span>
            <strong :key="shownScores[id]" class="score-num">{{ shownScores[id] ?? 0 }}</strong>
          </li>
        </ol>
        <button
          v-if="isReveal && !isGameOver && !revealing"
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

.big-swatch {
  flex: none;
  width: 3.25rem;
  height: 3.25rem;
  border: 2px solid var(--ink);
  border-radius: 0.35rem;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
}

.big-swatch.empty {
  border-style: dashed;
  border-color: var(--muted);
  background:
    repeating-linear-gradient(45deg, transparent 0 6px, color-mix(in srgb, var(--muted) 20%, transparent) 6px 7px);
  box-shadow: none;
}

.pick {
  display: grid;
}

.pick strong {
  font-size: 1.1rem;
}

.your-color {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-weight: 600;
}

.small {
  font-size: 0.85rem;
}

.warning {
  color: #b3261e;
  font-size: 0.9rem;
  font-weight: 600;
}

/* ---- Guessing order ---- */

.guess-order {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.chip {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem 0.2rem 0.25rem;
  border: 2px solid var(--line);
  border-radius: 999px;
  font-size: 0.85rem;
  transition:
    border-color 0.3s ease,
    opacity 0.3s ease,
    transform 0.3s ease;
}

.chip .token {
  width: 1.3rem;
  font-size: 0.65rem;
}

.chip.done {
  opacity: 0.55;
}

.chip.current {
  border-color: var(--accent);
  background: var(--accent-soft);
  font-weight: 700;
  transform: scale(1.06);
}

.chip-mark {
  color: var(--accent);
  font-weight: 800;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
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
  animation: box-open 0.35s cubic-bezier(0.2, 1.4, 0.4, 1);
}

.scoring-box.outer {
  border: 2px dashed #ffffff;
  box-shadow: 0 0 0 1px rgb(17 17 17 / 0.7);
}

.loupe-frame {
  position: absolute;
  inset: 0;
  z-index: 3;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 2px #111111, 0 0 0 999px rgb(0 0 0 / 0.25);
  pointer-events: none;
}

/* ---- Reveal ---- */

.cell {
  transition: filter 0.45s ease;
}

.board.revealing .cell.dim {
  filter: brightness(0.35) saturate(0.4);
}

.board.revealing .cell.target {
  z-index: 3;
  animation: pulse 0.7s ease-in-out 2;
}

.token.drop {
  animation: drop 0.5s cubic-bezier(0.3, 1.5, 0.5, 1);
}

.token.scored {
  animation: score-pop 0.4s ease-out;
}

.points {
  position: absolute;
  bottom: 70%;
  left: 50%;
  z-index: 4;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: #111111;
  color: #ffe08a;
  font-size: 0.75rem;
  font-weight: 800;
  white-space: nowrap;
  pointer-events: none;
  animation: float-up 1.5s ease-out forwards;
}

.points.zero {
  color: #bbbbbb;
}

.score-num {
  display: inline-block;
  min-width: 2ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
  animation: bump 0.3s ease-out;
}

@keyframes box-open {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
}

@keyframes pulse {
  50% {
    transform: scale(1.6);
    box-shadow: 0 0 0 3px #111111, 0 0 14px 4px rgb(255 255 255 / 0.8);
  }
}

@keyframes drop {
  0% {
    opacity: 0;
    transform: translateY(-160%) scale(1.4);
  }
  60% {
    opacity: 1;
  }
}

@keyframes score-pop {
  50% {
    transform: scale(1.45);
  }
}

@keyframes float-up {
  0% {
    opacity: 0;
    transform: translate(-50%, 6px) scale(0.6);
  }
  15% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1.1);
  }
  70% {
    opacity: 1;
    transform: translate(-50%, -10px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -18px) scale(1);
  }
}

@keyframes bump {
  50% {
    transform: scale(1.3);
    color: var(--accent);
  }
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

/* On phones the whole board fits, and tapping it opens the zoomed view. */
.board.compact {
  grid-template-columns: repeat(30, minmax(0, 1fr));
  gap: 1px;
  min-width: 0;
  padding: 2px;
  cursor: zoom-in;
}

.board.compact .cell {
  pointer-events: none;
}

.board.compact .token {
  width: 86%;
  box-shadow:
    0 0 0 1px #ffffff,
    0 0 0 2px #111111;
  font-size: 0;
}

.board.compact .points {
  font-size: 0.6rem;
}

:root[data-theme='dark'] .warning {
  color: #ff8a80;
}

@media (prefers-reduced-motion: reduce) {
  .scoring-box,
  .token.drop,
  .token.scored,
  .score-num,
  .board.revealing .cell.target {
    animation: none;
  }
}

/* Stack before the board would need to scroll beside the scores. */
@media (max-width: 1080px) {
  .play-area {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
