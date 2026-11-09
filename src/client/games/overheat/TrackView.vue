<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { TRACK_WIDTH, getTrack, layoutTrack, pointAlong, type Point } from '../../../games/overheat/tracks'

export interface TrackCar {
  id: string
  name: string
  color: string
  pos: number
  spot: 0 | 1
  isYou: boolean
}

const props = defineProps<{
  trackId: number
  cars: TrackCar[]
  /** Zooms in on this car, if set. */
  followId: string | null
  highlightId: string | null
  /** Your next corner. `distance` is the move that crosses it, so the badge shows one less. */
  nextCorner: { space: number; distance: number } | null
}>()

const layout = computed(() => layoutTrack(getTrack(props.trackId)))
const W = TRACK_WIDTH
const MARGIN = 70

// ---- Positions along the track ----

/** Screen position and heading for a car at a (possibly fractional) space and spot. */
function placeAt(pos: number, spot: number) {
  const l = layout.value
  const point = pointAlong(l, (pos + 0.5) * l.spaceLength)
  const inside = (W / 4) * l.insideSide
  const offset = inside + (-inside - inside) * spot
  // The driver's left, with y pointing down the screen.
  const nx = point.ty
  const ny = -point.tx
  return {
    x: point.x + nx * offset,
    y: point.y + ny * offset,
    angle: (Math.atan2(point.ty, point.tx) * 180) / Math.PI,
  }
}

/** Points across the track at a distance along it, from one edge to the other. */
function across(distance: number, extra = 0) {
  const point = pointAlong(layout.value, distance)
  const half = W / 2 + extra
  return {
    x1: point.x + point.ty * half,
    y1: point.y - point.tx * half,
    x2: point.x - point.ty * half,
    y2: point.y + point.tx * half,
  }
}

const toPath = (points: Point[], closed: boolean) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') + (closed ? 'Z' : '')

function stretch(from: number, to: number): Point[] {
  const points: Point[] = []
  const steps = Math.max(2, Math.ceil((to - from) / 6))
  for (let i = 0; i <= steps; i++) {
    const p = pointAlong(layout.value, from + ((to - from) * i) / steps)
    points.push([p.x, p.y])
  }
  return points
}

// ---- The scenery, worked out once per track ----

const scene = computed(() => {
  const l = layout.value
  const { minX, minY, maxX, maxY } = l.bounds
  const spaces = l.def.spaces

  const ticks = Array.from({ length: spaces }, (_, i) => across(i * l.spaceLength))
  const corners = l.corners.map((corner) => {
    const distance = corner.space * l.spaceLength
    const point = pointAlong(l, distance)
    const outside = -l.insideSide * (W / 2 + 26)
    return {
      ...corner,
      line: across(distance, 3),
      sign: { x: point.x + point.ty * outside, y: point.y - point.tx * outside },
      // Back along the track from the sign, the way cars arrive, so it stays inside the picture.
      before: { x: point.x + point.ty * outside - point.tx * 40, y: point.y - point.tx * outside - point.ty * 40 },
      kerb: toPath(stretch(distance - 2.5 * l.spaceLength, distance + 1.5 * l.spaceLength), false),
    }
  })

  const finish = pointAlong(l, 0)
  const grid = [1, 2, 3, 4].flatMap((back) =>
    [0, 1].map((spot) => placeAt(-back, spot)),
  )

  // Trees scattered off the track, the same every time for a track.
  let seed = 1234 + l.def.id * 977
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const near = l.path.filter((_, i) => i % 6 === 0)
  const trees: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < 260 && trees.length < 90; i++) {
    const x = minX - MARGIN + rand() * (maxX - minX + MARGIN * 2)
    const y = minY - MARGIN + rand() * (maxY - minY + MARGIN * 2)
    const r = 7 + rand() * 9
    const clear = near.every((p) => Math.hypot(p[0] - x, p[1] - y) > W / 2 + 34 + r)
    const apart = trees.every((t) => Math.hypot(t.x - x, t.y - y) > t.r + r + 4)
    if (clear && apart) trees.push({ x, y, r })
  }

  return {
    box: { x: minX - MARGIN, y: minY - MARGIN, w: maxX - minX + MARGIN * 2, h: maxY - minY + MARGIN * 2 },
    d: toPath(l.path, true),
    ticks,
    corners,
    finish: { x: finish.x, y: finish.y, angle: (Math.atan2(finish.ty, finish.tx) * 180) / Math.PI },
    grid,
    trees,
    colors: l.def.scenery,
  }
})

// ---- Animating cars between positions ----

interface Shown {
  pos: number
  spot: number
  from: { pos: number; spot: number }
  to: { pos: number; spot: number }
  start: number
  duration: number
}

const shown = reactive<Record<string, Shown>>({})
let frame = 0

function tick(now: number) {
  let moving = false
  for (const car of Object.values(shown)) {
    const t = Math.min(1, (now - car.start) / car.duration)
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    car.pos = car.from.pos + (car.to.pos - car.from.pos) * eased
    car.spot = car.from.spot + (car.to.spot - car.from.spot) * eased
    if (t < 1) moving = true
  }
  frame = moving ? requestAnimationFrame(tick) : 0
}

watch(
  () => props.cars.map((car) => [car.id, car.pos, car.spot] as const),
  (cars) => {
    const now = performance.now()
    for (const [id, pos, spot] of cars) {
      const current = shown[id]
      if (!current) {
        shown[id] = { pos, spot, from: { pos, spot }, to: { pos, spot }, start: now, duration: 1 }
        continue
      }
      if (current.to.pos === pos && current.to.spot === spot) continue
      const distance = Math.abs(pos - current.pos)
      current.from = { pos: current.pos, spot: current.spot }
      current.to = { pos, spot }
      current.start = now
      current.duration = Math.min(1800, 350 + distance * 110)
    }
    for (const id of Object.keys(shown)) if (!cars.some(([carId]) => carId === id)) delete shown[id]
    if (!frame) frame = requestAnimationFrame(tick)
  },
  { immediate: true },
)

onBeforeUnmount(() => cancelAnimationFrame(frame))

const drawn = computed(() =>
  props.cars
    .filter((car) => shown[car.id])
    .map((car) => {
      const s = shown[car.id]!
      return { ...car, ...placeAt(s.pos, s.spot), moving: s.pos !== s.to.pos }
    })
    // Your car and the moving car go on top.
    .sort((a, b) => Number(a.isYou || a.moving) - Number(b.isYou || b.moving)),
)

// ---- Camera ----

const viewBox = computed(() => {
  const box = scene.value.box
  const target = props.followId ? drawn.value.find((car) => car.id === props.followId) : null
  if (!target) return `${box.x} ${box.y} ${box.w} ${box.h}`
  const w = Math.max(380, box.w * 0.5)
  const h = (w * box.h) / box.w
  const x = Math.min(Math.max(target.x - w / 2, box.x), box.x + box.w - w)
  const y = Math.min(Math.max(target.y - h / 2, box.y), box.y + box.h - h)
  return `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`
})

const hovered = ref<string | null>(null)

const nextCornerSign = computed(() => {
  const next = props.nextCorner
  const corner = next && scene.value.corners.find((c) => c.space === next.space)
  // Counts the tiles in between, so 0 means you're on the tile right before the corner.
  return corner ? { ...corner.sign, pill: corner.before, distance: next.distance - 1 } : null
})
</script>

<template>
  <svg class="track" :viewBox="viewBox" role="img" :aria-label="`${layout.def.name} race track`">
    <defs>
      <pattern :id="`checker-${trackId}`" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="#fff" />
        <rect width="6" height="6" fill="#111" />
        <rect x="6" y="6" width="6" height="6" fill="#111" />
      </pattern>
    </defs>

    <rect
      :x="scene.box.x - 400"
      :y="scene.box.y - 400"
      :width="scene.box.w + 800"
      :height="scene.box.h + 800"
      :fill="scene.colors.grass"
    />
    <path :d="scene.d" :fill="scene.colors.infield" />

    <g class="trees">
      <g v-for="(tree, i) in scene.trees" :key="i">
        <circle :cx="tree.x + 3" :cy="tree.y + 4" :r="tree.r" fill="#000" opacity="0.18" />
        <circle :cx="tree.x" :cy="tree.y" :r="tree.r" :fill="scene.colors.tree" />
        <circle :cx="tree.x - tree.r * 0.3" :cy="tree.y - tree.r * 0.3" :r="tree.r * 0.45" fill="#fff" opacity="0.12" />
      </g>
    </g>

    <!-- Kerbs peek out from under the asphalt at each corner. -->
    <g v-for="corner in scene.corners" :key="`kerb-${corner.space}`">
      <path :d="corner.kerb" fill="none" stroke="#fff" :stroke-width="W + 12" />
      <path :d="corner.kerb" fill="none" stroke="#d62828" :stroke-width="W + 12" stroke-dasharray="9 9" />
    </g>

    <path :d="scene.d" fill="none" stroke="#f4f1ea" :stroke-width="W + 5" stroke-linejoin="round" />
    <path :d="scene.d" fill="none" stroke="#3b3b40" :stroke-width="W" stroke-linejoin="round" />
    <path :d="scene.d" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="7 7" />

    <line
      v-for="(t, i) in scene.ticks"
      :key="`tick-${i}`"
      :x1="t.x1"
      :y1="t.y1"
      :x2="t.x2"
      :y2="t.y2"
      stroke="#fff"
      stroke-opacity="0.16"
      stroke-width="1.2"
    />

    <g v-for="(spot, i) in scene.grid" :key="`grid-${i}`" :transform="`translate(${spot.x} ${spot.y}) rotate(${spot.angle})`">
      <path d="M 10 -9 L 13 -9 L 13 9 L 10 9" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="1.6" />
    </g>

    <g :transform="`translate(${scene.finish.x} ${scene.finish.y}) rotate(${scene.finish.angle})`">
      <rect x="-6" :y="-W / 2" width="12" :height="W" :fill="`url(#checker-${trackId})`" />
    </g>

    <g v-for="corner in scene.corners" :key="`corner-${corner.space}`" class="corner">
      <line v-bind="corner.line" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round" />
      <circle :cx="corner.sign.x" :cy="corner.sign.y" r="15" fill="#fff" stroke="#d62828" stroke-width="4" />
      <text :x="corner.sign.x" :y="corner.sign.y" class="limit">{{ corner.limit }}</text>
    </g>

    <g v-if="nextCornerSign" class="next-corner" aria-hidden="true">
      <circle :cx="nextCornerSign.x" :cy="nextCornerSign.y" r="21" class="next-ring" />
      <g :transform="`translate(${nextCornerSign.pill.x} ${nextCornerSign.pill.y})`">
        <rect x="-21" y="-15" width="42" height="30" rx="15" class="next-pill" />
        <text class="next-text">{{ nextCornerSign.distance }}</text>
      </g>
    </g>

    <g
      v-for="car in drawn"
      :key="car.id"
      class="car"
      :class="{ you: car.isYou, active: car.id === highlightId }"
      :transform="`translate(${car.x.toFixed(2)} ${car.y.toFixed(2)}) rotate(${car.angle.toFixed(1)})`"
      @pointerenter="hovered = car.id"
      @pointerleave="hovered = null"
    >
      <title>{{ car.name }}{{ car.isYou ? ' (you)' : '' }}</title>
      <circle v-if="car.isYou || car.id === highlightId" class="halo" r="17" />
      <g v-if="car.moving" class="streaks">
        <line x1="-16" y1="-4" x2="-30" y2="-4" />
        <line x1="-16" y1="4" x2="-34" y2="4" />
      </g>
      <ellipse cx="1.5" cy="2.5" rx="13" ry="7" fill="#000" opacity="0.3" />
      <rect x="-14" y="-7.5" width="3.5" height="15" rx="1" fill="#1d1d1f" />
      <rect x="-12" y="-6" width="24" height="12" rx="5" :fill="car.color" stroke="#111" stroke-width="1.2" />
      <rect x="11" y="-5.5" width="3" height="11" rx="1" fill="#1d1d1f" />
      <rect x="-3" y="-3.6" width="8" height="7.2" rx="2.5" fill="#1d1d1f" />
      <rect x="-10" y="-1" width="7" height="2" fill="#fff" opacity="0.55" />
    </g>

    <g v-for="car in drawn.filter((c) => c.id === hovered || c.isYou)" :key="`tag-${car.id}`" class="tag">
      <text :x="car.x" :y="car.y - 20">{{ car.isYou ? 'You' : car.name }}</text>
    </g>
  </svg>
</template>

<style scoped>
.track {
  display: block;
  width: 100%;
  height: auto;
  /* Short enough that the cards below stay in view without much scrolling. */
  max-height: min(52vh, 34rem);
  border-radius: var(--radius);
  background: #333;
  touch-action: manipulation;
}

.limit {
  fill: #111;
  font-size: 17px;
  font-weight: 800;
  text-anchor: middle;
  dominant-baseline: central;
}

.halo {
  fill: none;
  stroke: #fff;
  stroke-width: 2.5;
  animation: pulse 1.4s ease-in-out infinite;
}

.car.active:not(.you) .halo {
  stroke: #ffd60a;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.95;
  }
  50% {
    opacity: 0.25;
  }
}

.next-ring {
  fill: none;
  stroke: #ffd60a;
  stroke-width: 3;
  animation: pulse 1.4s ease-in-out infinite;
}

.next-pill {
  fill: #ffd60a;
  stroke: #111;
  stroke-width: 1.5;
}

.next-text {
  fill: #111;
  font-size: 20px;
  font-weight: 800;
  text-anchor: middle;
  dominant-baseline: central;
}

.streaks line {
  stroke: #fff;
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0.6;
}

.tag text {
  fill: #fff;
  font-size: 13px;
  font-weight: 700;
  text-anchor: middle;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.75);
  stroke-width: 3px;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .next-ring,
  .halo {
    animation: none;
  }
}
</style>
