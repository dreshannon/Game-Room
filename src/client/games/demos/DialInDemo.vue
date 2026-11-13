<script setup lang="ts">
// Practice for the lobby: turn the dial to fit a ready-made clue, then see the target.
import { computed, ref } from 'vue'
import { DIAL_MAX, DIAL_START, pointsFor, SCORE_BANDS } from '../../../games/dial-in/logic'
import type { PublicPlayer } from '../../../shared/protocol'
import DemoFrame from './DemoFrame.vue'

defineProps<{ you: string; players: PublicPlayer[] }>()

interface Card {
  ends: [string, string]
  clue: string
  target: number
}

const CARDS: Card[] = [
  { ends: ['Freezing', 'Scorching'], clue: 'Fresh from the oven', target: 152 },
  { ends: ['Quiet', 'Deafening'], clue: 'A library', target: 18 },
  { ends: ['Mild', 'Spicy'], clue: 'Black pepper', target: 62 },
  { ends: ['Harmless', 'Dangerous'], clue: 'A wasp', target: 84 },
  { ends: ['Easy to draw', 'Impossible to draw'], clue: 'A horse', target: 138 },
  { ends: ['Kid stuff', 'Grown-up stuff'], clue: 'Doing your taxes', target: 172 },
  { ends: ['Cheap date', 'Fancy date'], clue: 'A picnic', target: 40 },
]
const ROUNDS = 3

const CX = 200
const CY = 200
const R = 175

function point(position: number, radius = R) {
  const angle = (Math.PI * position) / DIAL_MAX
  return { x: CX - radius * Math.cos(angle), y: CY - radius * Math.sin(angle) }
}

function wedge(from: number, to: number) {
  const start = point(Math.max(0, from))
  const end = point(Math.min(DIAL_MAX, to))
  return `M ${CX} ${CY} L ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y} Z`
}

const order = ref<Card[]>([])
const round = ref(0)
const dial = ref(DIAL_START)
const locked = ref(false)
const score = ref(0)
const dragging = ref(false)
const svg = ref<SVGSVGElement | null>(null)

const card = computed(() => order.value[round.value]!)
const needle = computed(() => point(dial.value, R - 8))
const points = computed(() => pointsFor(Math.round(dial.value), card.value.target))
const over = computed(() => locked.value && round.value === ROUNDS - 1)
const bands = computed(() =>
  locked.value
    ? [...SCORE_BANDS].reverse().map((band) => ({
        points: band.points,
        path: wedge(card.value.target - band.within, card.value.target + band.within),
      }))
    : [],
)

const status = computed(() => {
  if (!locked.value) return 'Drag the dial to where the clue fits, then lock in.'
  if (points.value === 4) return 'Bullseye! 4 points.'
  return points.value ? `Close: ${points.value} points.` : 'Missed the target. No points.'
})

function restart() {
  order.value = [...CARDS].sort(() => Math.random() - 0.5).slice(0, ROUNDS)
  round.value = 0
  score.value = 0
  dial.value = DIAL_START
  locked.value = false
}

function onPointerDown(event: PointerEvent) {
  if (locked.value) return
  dragging.value = true
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  onPointerMove(event)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  const matrix = svg.value?.getScreenCTM()
  if (!matrix) return
  const at = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  const degrees = (Math.atan2(Math.max(0, CY - at.y), at.x - CX) * 180) / Math.PI
  dial.value = Math.min(DIAL_MAX, Math.max(0, DIAL_MAX - degrees))
}

function nudge(by: number) {
  if (!locked.value) dial.value = Math.min(DIAL_MAX, Math.max(0, dial.value + by))
}

function lockIn() {
  locked.value = true
  score.value += points.value
}

function nextClue() {
  round.value++
  dial.value = DIAL_START
  locked.value = false
}

restart()
</script>

<template>
  <DemoFrame label="read the clue" :over="over ? `${score} of ${ROUNDS * 4} points.` : ''" @restart="restart">
    <p class="muted">Clue {{ round + 1 }} of {{ ROUNDS }} · {{ score }} points</p>
    <p class="clue">
      <span class="muted">The Psychic says</span>
      <strong>“{{ card.clue }}”</strong>
    </p>
    <div class="ends">
      <span>← {{ card.ends[0] }}</span>
      <span>{{ card.ends[1] }} →</span>
    </div>
    <svg
      ref="svg"
      class="dial"
      :class="{ turnable: !locked }"
      viewBox="0 0 400 215"
      role="slider"
      :aria-label="`Dial between ${card.ends[0]} and ${card.ends[1]}`"
      :aria-valuemin="0"
      :aria-valuemax="DIAL_MAX"
      :aria-valuenow="Math.round(dial)"
      :tabindex="locked ? -1 : 0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="dragging = false"
      @pointercancel="dragging = false"
      @keydown.left.prevent="nudge(-2)"
      @keydown.right.prevent="nudge(2)"
    >
      <defs>
        <linearGradient id="dial-demo-face" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#3d5a80" />
          <stop offset="50%" stop-color="#e8e1d1" />
          <stop offset="100%" stop-color="#c8401f" />
        </linearGradient>
      </defs>
      <path :d="wedge(0, DIAL_MAX)" fill="url(#dial-demo-face)" stroke="#222" stroke-width="2" />
      <path v-for="band in bands" :key="band.points" :d="band.path" :class="`band band-${band.points}`" />
      <line :x1="CX" :y1="CY" :x2="needle.x" :y2="needle.y" class="needle" />
      <circle :cx="CX" :cy="CY" r="12" class="hub" />
    </svg>
    <p class="status" aria-live="polite">{{ status }}</p>
    <button v-if="!locked" class="primary" @click="lockIn">Lock in</button>
    <button v-else-if="!over" class="primary" @click="nextClue">Next clue</button>
  </DemoFrame>
</template>

<style scoped>
.clue {
  display: grid;
}

.clue strong {
  font-size: 1.3rem;
}

.ends {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  width: min(100%, 22rem);
  font-size: 0.9rem;
  font-weight: 600;
}

.ends span:last-child {
  text-align: right;
}

.dial {
  width: min(100%, 22rem);
  touch-action: none;
  user-select: none;
}

.dial.turnable {
  cursor: grab;
}

.dial:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.band {
  stroke: #222;
  stroke-width: 1;
}

.band-2 {
  fill: #f6c445;
}

.band-3 {
  fill: #f08a24;
}

.band-4 {
  fill: #2f6fdb;
}

.needle {
  stroke: #b3121c;
  stroke-width: 5;
  stroke-linecap: round;
}

.hub {
  fill: #b3121c;
  stroke: #222;
  stroke-width: 2;
}

.status {
  font-weight: 700;
}
</style>
