<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  LANTERN_COLORS,
  freeStarts,
  preview,
  type DriftMove,
  type DriftView,
  type DrifterView,
  type OutReason,
} from '../../../games/drift-lines/logic'
import { PATTERNS, turn, wallSpots, type Segment, type Spot } from '../../../games/drift-lines/paths'
import type { PublicPlayer } from '../../../shared/protocol'
import { canAnimate } from '../../motion'
import { SQUARE, channel, channels, opening } from './art'
import PieceArt from './PieceArt.vue'

const props = defineProps<{ view: DriftView; you: string; players: PublicPlayer[]; hostId?: string | null }>()
const emit = defineEmits<{ move: [move: DriftMove] }>()

const v = computed(() => props.view)
const PAD = 22
const span = computed(() => v.value.size * SQUARE + PAD * 2)
/** Lanterns grow with the board so they stay easy to see when it's drawn smaller. */
const lanternSize = computed(() => 6 + v.value.size * 1.4)
const nameOf = (id: string) => props.players.find((p) => p.id === id)?.name ?? 'Someone'
const youOr = (id: string) => (id === props.you ? 'You' : nameOf(id))
const colorOf = (d: { color: number }) => LANTERN_COLORS[d.color % LANTERN_COLORS.length]!.fill
const me = computed(() => v.value.drifters.find((d) => d.id === props.you) ?? null)
const myTurn = computed(() => v.value.turn === props.you)
const isHost = computed(() => props.hostId === props.you)
const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

// ---- Clock and motion ----
const now = ref(Date.now())
const animate = ref(false)
const updateMotion = () => (animate.value = canAnimate())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 250)
  updateMotion()
  document.addEventListener('visibilitychange', updateMotion)
})
onBeforeUnmount(() => {
  clearInterval(clock)
  document.removeEventListener('visibilitychange', updateMotion)
})
const secondsLeft = computed(() =>
  v.value.turnEndsAt === null ? null : Math.max(0, Math.ceil((v.value.turnEndsAt - now.value) / 1000)),
)
const timeShare = computed(() =>
  v.value.turnEndsAt === null || v.value.timer === 0
    ? 1
    : Math.max(0, Math.min(1, (v.value.turnEndsAt - now.value) / (v.value.timer * 1000))),
)

// ---- Board geometry ----
const squareXY = (sq: number) => {
  const r = Math.floor(sq / v.value.size)
  const c = sq % v.value.size
  return [PAD + c * SQUARE, PAD + r * SQUARE] as const
}
const spotXY = (s: Spot) => opening(s.p, PAD + s.c * SQUARE, PAD + s.r * SQUARE)
const segmentPath = (s: Segment) => {
  const [x, y] = squareXY(s.sq)
  return channel(s.a, s.b, x, y)
}
/** Where a lantern is drawn: its spot, or the end of its trail if it went out on the way. */
function lanternXY(d: DrifterView) {
  const last = d.trail[d.trail.length - 1]
  if (!d.lit && last && d.out?.why !== 'left') {
    const [x, y] = squareXY(last.sq)
    return opening(last.b, x, y)
  }
  return d.spot ? spotXY(d.spot) : null
}

const placed = computed(() =>
  v.value.board.flatMap((cell, sq) => {
    if (!cell) return []
    const [x, y] = squareXY(sq)
    return [{ sq, x, y, paths: channels(turn(PATTERNS[cell.pattern]!, cell.turns), x, y) }]
  }),
)
const grid = computed(() => Array.from({ length: v.value.size * v.value.size }, (_, sq) => squareXY(sq)))

// Trails drawn so far, so new ones can be drawn in as they appear.
const seenTrail = ref<Record<string, number>>({})
const freshFrom = ref<Record<string, number>>({})
watch(
  () => v.value.moves,
  () => {
    const next: Record<string, number> = {}
    const fresh: Record<string, number> = {}
    for (const d of v.value.drifters) {
      fresh[d.id] = seenTrail.value[d.id] ?? d.trail.length
      next[d.id] = d.trail.length
    }
    freshFrom.value = fresh
    seenTrail.value = next
  },
  { immediate: true },
)
const trails = computed(() =>
  v.value.drifters.map((d) => ({
    id: d.id,
    color: colorOf(d),
    lit: d.lit,
    paths: d.trail.map((s, i) => ({ d: segmentPath(s), fresh: i >= (freshFrom.value[d.id] ?? d.trail.length), i })),
  })),
)
const freshDelay = (id: string, i: number) =>
  animate.value ? { animationDelay: `${(i - (freshFrom.value[id] ?? 0)) * 160}ms` } : {}

// ---- Your move ----
const selected = ref<number | null>(null)
const turnsOf = ref<Record<number, number>>({})
const hand = computed(() => v.value.hand ?? [])
watch(
  hand,
  (pieces) => {
    if (!pieces.some((p) => p.id === selected.value)) selected.value = pieces[0]?.id ?? null
  },
  { immediate: true },
)
const selectedPiece = computed(() => hand.value.find((p) => p.id === selected.value) ?? null)
function pick(id: number) {
  if (selected.value === id) return rotate(1)
  selected.value = id
}
function rotate(by: number) {
  if (selected.value === null) return
  turnsOf.value = { ...turnsOf.value, [selected.value]: ((turnsOf.value[selected.value] ?? 0) + by + 4) % 4 }
}
const turnsFor = (id: number) => turnsOf.value[id] ?? 0

const asState = computed(() => ({
  size: v.value.size,
  board: v.value.board,
  drifters: v.value.drifters.map((d) => ({
    id: d.id,
    color: d.color,
    spot: d.spot,
    trail: d.trail,
    hand: [],
    out: d.lit ? null : (d.out ?? { move: 0, why: 'left' as OutReason }),
    gone: d.gone,
  })),
}))
const safeFor = (pattern: number, turns: number) =>
  !preview(asState.value, props.you, pattern, turns)?.outcomes.get(props.you)?.out
const anySafe = computed(() => hand.value.some((p) => [0, 1, 2, 3].some((t) => safeFor(p.pattern, t))))

const ghost = computed(() => {
  if (!myTurn.value || v.value.phase !== 'play' || !selectedPiece.value) return null
  const piece = selectedPiece.value
  const turns = turnsFor(piece.id)
  const result = preview(asState.value, props.you, piece.pattern, turns)
  if (!result) return null
  const [x, y] = squareXY(result.sq)
  const mine = result.outcomes.get(props.you)
  const others = [...result.outcomes].filter(([id, o]) => id !== props.you && o.out).map(([id]) => id)
  return {
    x,
    y,
    paths: channels(turn(PATTERNS[piece.pattern]!, turns), x, y),
    trail: (mine?.trail ?? []).map(segmentPath),
    out: mine?.out ?? null,
    others,
  }
})
const ghostLine = computed(() => {
  const g = ghost.value
  if (!g) return ''
  const others = g.others.length ? ` ${listNames(g.others.map(nameOf))} ${g.others.length === 1 ? 'goes' : 'go'} out.` : ''
  if (g.out === 'wall') return `This puts you out on the wall.${others}`
  if (g.out === 'crash') return `This crashes you into another lantern.${others}`
  return `Safe.${others}`
})
const blocked = computed(() => !!ghost.value?.out && anySafe.value)

function placePiece() {
  if (!selectedPiece.value || blocked.value) return
  emit('move', { type: 'place', piece: selectedPiece.value.id, turns: turnsFor(selectedPiece.value.id) })
}

// ---- Picking a start ----
const free = computed(() => (v.value.phase === 'start' ? freeStarts(asState.value) : []))
const startChoice = ref<number | null>(null)
watch(
  free,
  (spots) => {
    if (!spots.some((s) => s.index === startChoice.value)) {
      startChoice.value = spots[Math.floor(spots.length / 2)]?.index ?? null
    }
  },
  { immediate: true },
)
const choosingStart = computed(() => v.value.phase === 'start' && myTurn.value)
const startSpot = computed(() => (startChoice.value === null ? null : wallSpots(v.value.size)[startChoice.value]!))
function stepStart(by: number) {
  const list = free.value
  const at = list.findIndex((s) => s.index === startChoice.value)
  startChoice.value = list[(at + by + list.length) % list.length]!.index
}
function tapBoard(event: MouseEvent) {
  if (!choosingStart.value) return
  const svg = event.currentTarget as SVGSVGElement
  const box = svg.getBoundingClientRect()
  const x = ((event.clientX - box.left) / box.width) * span.value
  const y = ((event.clientY - box.top) / box.height) * span.value
  let best: number | null = null
  let bestDistance = Infinity
  for (const s of free.value) {
    const [sx, sy] = spotXY(s.spot)
    const distance = (sx - x) ** 2 + (sy - y) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = s.index
    }
  }
  startChoice.value = best
}
function sendStart() {
  if (startChoice.value !== null) emit('move', { type: 'start', spot: startChoice.value })
}

// ---- What's going on ----
const facing = computed(() => {
  if (v.value.phase !== 'play' || !v.value.turn) return null
  const spot = v.value.drifters.find((d) => d.id === v.value.turn)?.spot
  return spot ? squareXY(spot.r * v.value.size + spot.c) : null
})
const whyText: Record<OutReason, string> = { wall: 'hit the wall', crash: 'crashed', left: 'left' }
const lastLine = computed(() => {
  const last = v.value.last
  if (!last) return ''
  const outs = last.outs
  const parts = [`${youOr(last.by)} placed a piece.`]
  for (const why of ['wall', 'crash'] as const) {
    const ids = outs.filter((o) => o.why === why).map((o) => youOr(o.id))
    if (ids.length) parts.push(`${listNames(ids)} ${whyText[why]}.`)
  }
  return parts.join(' ')
})
const statusLine = computed(() => {
  if (v.value.phase === 'over') return 'Game over'
  const who = v.value.turn
  if (!who) return ''
  if (v.value.phase === 'start') return myTurn.value ? 'Pick where your lantern starts' : `${nameOf(who)} is picking a spot`
  return myTurn.value ? 'Your turn' : `${nameOf(who)}’s turn`
})
const litCount = computed(() => v.value.drifters.filter((d) => d.lit).length)
const roster = computed(() =>
  [...v.value.drifters].sort(
    (a, b) => Number(b.lit) - Number(a.lit) || (b.out?.move ?? 0) - (a.out?.move ?? 0),
  ),
)
const rosterNote = (d: DrifterView) => {
  if (d.lit) return d.id === v.value.turn ? (v.value.phase === 'start' ? 'picking' : 'playing') : ''
  return d.out ? whyText[d.out.why] : 'out'
}
const hurry = computed(() => myTurn.value && secondsLeft.value !== null && secondsLeft.value <= 5)
</script>

<template>
  <div class="dl" :class="{ animate }">
    <header class="top">
      <p class="eyebrow">{{ statusLine }} · {{ litCount }} lit</p>
      <p v-if="secondsLeft !== null && v.phase !== 'over'" class="clock" :class="{ hurry }">
        {{ secondsLeft }}s
      </p>
    </header>
    <div v-if="v.turnEndsAt !== null && v.phase !== 'over'" class="timebar" aria-hidden="true">
      <span :style="{ transform: `scaleX(${timeShare})` }" />
    </div>

    <svg
      class="board"
      :class="{ picking: choosingStart }"
      :viewBox="`0 0 ${span} ${span}`"
      role="img"
      :aria-label="`Canal board, ${v.size} by ${v.size}`"
      @click="tapBoard"
    >
      <rect :x="PAD - 6" :y="PAD - 6" :width="v.size * SQUARE + 12" :height="v.size * SQUARE + 12" rx="14" class="wall" />
      <rect :x="PAD" :y="PAD" :width="v.size * SQUARE" :height="v.size * SQUARE" class="canal" />
      <rect
        v-for="([x, y], sq) in grid"
        :key="`g${sq}`"
        :x="x + 4"
        :y="y + 4"
        :width="SQUARE - 8"
        :height="SQUARE - 8"
        rx="8"
        class="slot"
      />
      <g v-for="cell in placed" :key="`p${cell.sq}`" class="placed" :class="{ newest: v.last?.sq === cell.sq }">
        <rect :x="cell.x + 2" :y="cell.y + 2" :width="SQUARE - 4" :height="SQUARE - 4" rx="8" class="face" />
        <path v-for="c in cell.paths" :key="c.key" :d="c.d" class="water" />
      </g>

      <rect
        v-if="facing"
        :x="facing[0] + 2"
        :y="facing[1] + 2"
        :width="SQUARE - 4"
        :height="SQUARE - 4"
        rx="8"
        class="facing"
      />

      <g v-for="t in trails" :key="`t${t.id}`" :class="{ dim: !t.lit }">
        <path
          v-for="s in t.paths"
          :key="s.i"
          :d="s.d"
          class="trail"
          :class="{ fresh: s.fresh }"
          :style="{ stroke: t.color, ...(s.fresh ? freshDelay(t.id, s.i) : {}) }"
          pathLength="1"
        />
      </g>

      <g v-if="ghost" class="ghost">
        <rect :x="ghost.x + 2" :y="ghost.y + 2" :width="SQUARE - 4" :height="SQUARE - 4" rx="8" class="face" />
        <path v-for="c in ghost.paths" :key="c.key" :d="c.d" class="water" />
        <path
          v-for="(d, i) in ghost.trail"
          :key="`gt${i}`"
          :d="d"
          class="ghost-trail"
          :class="{ bad: ghost.out }"
          :style="{ stroke: me ? colorOf(me) : undefined }"
        />
      </g>

      <g v-if="choosingStart">
        <circle
          v-for="s in free"
          :key="`f${s.index}`"
          :cx="spotXY(s.spot)[0]"
          :cy="spotXY(s.spot)[1]"
          r="6"
          class="free"
        />
        <circle
          v-if="startSpot"
          :cx="spotXY(startSpot)[0]"
          :cy="spotXY(startSpot)[1]"
          r="16"
          class="chosen"
          :style="{ fill: me ? colorOf(me) : undefined }"
        />
      </g>

      <template v-for="d in v.drifters" :key="`l${d.id}`">
        <g
          v-if="lanternXY(d)"
          class="lantern"
          :class="{ out: !d.lit, mine: d.id === you, current: d.id === v.turn }"
          :style="{ transform: `translate(${lanternXY(d)![0]}px, ${lanternXY(d)![1]}px)` }"
        >
          <circle v-if="d.lit" :r="lanternSize * 1.7" class="halo" :style="{ fill: colorOf(d) }" />
          <circle :r="lanternSize" class="body" :style="{ fill: d.lit ? colorOf(d) : 'none', stroke: colorOf(d) }" />
          <text
            v-if="d.lit"
            :y="lanternSize * 0.36"
            class="initial"
            :style="{ fill: LANTERN_COLORS[d.color % LANTERN_COLORS.length]!.text, fontSize: `${lanternSize * 1.1}px` }"
          >
            {{ nameOf(d.id).slice(0, 1).toUpperCase() }}
          </text>
        </g>
      </template>
    </svg>

    <p v-if="lastLine" class="last" role="status">{{ lastLine }}</p>

    <!-- Your move -->
    <section v-if="v.phase === 'play' && myTurn && hand.length" class="panel controls">
      <p class="label">Pick a piece and turn it. Tap it again to turn.</p>
      <div class="hand">
        <button
          v-for="p in hand"
          :key="p.id"
          class="piece-button"
          :class="{ chosen: p.id === selected, risky: !safeFor(p.pattern, turnsFor(p.id)) }"
          :aria-pressed="p.id === selected"
          :aria-label="`Piece${p.id === selected ? ', picked' : ''}`"
          @click="pick(p.id)"
        >
          <PieceArt :pattern="p.pattern" :turns="turnsFor(p.id)" />
        </button>
      </div>
      <div class="row actions">
        <button aria-label="Turn left" @click="rotate(-1)">⟲</button>
        <button aria-label="Turn right" @click="rotate(1)">⟳</button>
        <button class="primary" :disabled="!selectedPiece || blocked" @click="placePiece">Place</button>
      </div>
      <p class="ghost-line" :class="{ warn: ghost?.out }">
        {{ ghostLine }}
        <template v-if="blocked"> Try another piece or turn it.</template>
        <template v-else-if="ghost?.out"> Every move does, so you can play it.</template>
      </p>
    </section>

    <section v-else-if="choosingStart" class="panel controls">
      <p class="label">Tap the wall, or step along it, to pick where you start.</p>
      <div class="row actions">
        <button aria-label="Previous spot" @click="stepStart(-1)">◀</button>
        <button aria-label="Next spot" @click="stepStart(1)">▶</button>
        <button class="primary" :disabled="startChoice === null" @click="sendStart">Start here</button>
      </div>
    </section>

    <p v-else-if="v.phase !== 'over' && me && !me.lit" class="muted note">Your lantern is out. Watch the rest drift.</p>
    <p v-else-if="v.phase !== 'over' && !me" class="muted note">You’re watching this game.</p>

    <section class="panel roster">
      <ul>
        <li v-for="d in roster" :key="d.id" :class="{ out: !d.lit, current: d.id === v.turn }">
          <span class="swatch" :style="{ background: d.lit ? colorOf(d) : 'transparent', borderColor: colorOf(d) }" />
          <span class="name">{{ youOr(d.id) }}</span>
          <span class="muted small">{{ rosterNote(d) }}</span>
        </li>
      </ul>
      <button v-if="isHost && v.phase !== 'over' && !myTurn" class="skip" @click="emit('move', { type: 'skip' })">
        Play for {{ v.turn ? nameOf(v.turn) : 'them' }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.dl {
  --dl-canal: color-mix(in srgb, var(--ink) 7%, var(--paper));
  --dl-wall: color-mix(in srgb, var(--ink) 22%, var(--paper));
  --dl-piece: var(--surface);
  --dl-edge: var(--line);
  --dl-water: color-mix(in srgb, var(--muted) 45%, var(--surface));
  display: grid;
  gap: 0.75rem;
  max-width: 36rem;
  margin: 0 auto;
}

.top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.clock {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.clock.hurry {
  color: var(--accent);
}

.timebar {
  height: 4px;
  border-radius: 2px;
  background: var(--line);
  overflow: hidden;
}

.timebar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transition: transform 0.25s linear;
}

.board {
  display: block;
  width: 100%;
  height: auto;
  touch-action: manipulation;
}

.board.picking {
  cursor: pointer;
}

.wall {
  fill: var(--dl-wall);
}

.canal {
  fill: var(--dl-canal);
}

.slot {
  fill: none;
  stroke: var(--dl-edge);
  stroke-width: 2;
  stroke-dasharray: 6 8;
}

.face {
  fill: var(--dl-piece);
  stroke: var(--dl-edge);
  stroke-width: 2;
}

.placed.newest .face {
  stroke: var(--muted);
  stroke-width: 4;
}

.water {
  fill: none;
  stroke: var(--dl-water);
  stroke-width: 8;
  stroke-linecap: round;
}

.facing {
  fill: none;
  stroke: var(--accent);
  stroke-width: 5;
  stroke-dasharray: 12 8;
}

.trail {
  fill: none;
  stroke-width: 11;
  stroke-linecap: round;
}

.dim .trail {
  opacity: 0.35;
}

.animate .trail.fresh {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw 0.3s ease-out forwards;
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

.ghost {
  opacity: 0.85;
  pointer-events: none;
}

.ghost .face {
  stroke: var(--accent);
  stroke-width: 4;
}

.ghost-trail {
  fill: none;
  stroke-width: 9;
  stroke-linecap: round;
  stroke-dasharray: 14 12;
}

.ghost-trail.bad {
  stroke: var(--accent) !important;
}

.free {
  fill: var(--muted);
  opacity: 0.6;
}

.chosen {
  stroke: var(--ink);
  stroke-width: 4;
}

.lantern {
  pointer-events: none;
}

.animate .lantern {
  transition: transform 0.5s ease-in-out;
}

.halo {
  opacity: 0.25;
}

.animate .lantern.current .halo {
  animation: glow 1.6s ease-in-out infinite;
}

@keyframes glow {
  50% {
    opacity: 0.5;
  }
}

.body {
  stroke-width: 3;
}

.lantern.mine .body {
  stroke: var(--ink) !important;
  stroke-width: 4;
}

.lantern.out .body {
  stroke-width: 4;
  stroke-dasharray: 5 4;
}

.initial {
  font-weight: 800;
  text-anchor: middle;
}

.last {
  font-size: 0.95rem;
}

.controls {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
}

.label {
  font-weight: 600;
}

.hand {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 6.5rem));
  gap: 0.6rem;
}

.piece-button {
  padding: 0.35rem;
  border-width: 2px;
}

.piece-button.chosen {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.piece-button.risky {
  opacity: 0.6;
}

.piece-button.risky.chosen {
  opacity: 1;
}

.animate .piece-button :deep(svg) {
  transition: transform 0.15s;
}

.actions button:not(.primary) {
  min-width: 3rem;
  font-size: 1.1rem;
}

.ghost-line {
  min-height: 1.5em;
  font-size: 0.95rem;
}

.ghost-line.warn {
  color: var(--accent);
}

.note {
  text-align: center;
}

.roster {
  padding: 0.75rem 1rem;
}

.roster ul {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.35rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.roster li {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.roster li.current .name {
  font-weight: 700;
}

.roster li.out .name {
  color: var(--muted);
  text-decoration: line-through;
}

.swatch {
  flex: none;
  width: 0.9rem;
  height: 0.9rem;
  border: 2px solid;
  border-radius: 50%;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.small {
  font-size: 0.8rem;
}

.skip {
  margin-top: 0.75rem;
  font-size: 0.85rem;
}
</style>
