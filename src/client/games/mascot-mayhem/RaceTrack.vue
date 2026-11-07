<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { MASCOTS } from '../../../games/mascot-mayhem/data'
import type { RevealedCard } from '../../../games/mascot-mayhem/logic'
import { FINISH, FOLDS, LANES, START, STARS, type Mascot } from '../../../games/mascot-mayhem/race'
import MascotSprite from './MascotSprite.vue'

const props = defineProps<{
  mascots: Mascot[]
  back: number
  latest: RevealedCard | null
  countdown: number
}>()

const S = 58
const L = 44
const X0 = 26
const TOP = 30
const TRACK_H = LANES * L
const FINISH_X = X0 + FINISH * S
const PODIUM_W = 190
const WIDTH = FINISH_X + PODIUM_W
const HEIGHT = TOP + TRACK_H + 30

const spaceX = (space: number) => X0 + space * S
const laneY = (lane: number) => TOP + (lane + 0.5) * L

// Finished mascots stand on the podium, in place order.
const PODIUM = [
  { x: FINISH_X + 95, y: TOP + 92, h: 70 },
  { x: FINISH_X + 45, y: TOP + 112, h: 50 },
  { x: FINISH_X + 145, y: TOP + 127, h: 35 },
]

const placed = computed(() =>
  props.mascots.map((m, index) => {
    const info = MASCOTS[index]!
    if (m.status === 'finished' && m.place !== null && m.place <= 3) {
      const step = PODIUM[m.place - 1]!
      return { index, info, m, x: step.x, y: step.y - 20 }
    }
    if (m.status === 'finished' && m.place === 4) {
      // The last mascot standing when the race ends trudges over to the side.
      return { index, info, m, x: FINISH_X + 95, y: TOP + TRACK_H - 22 }
    }
    // Mascots sharing a space and lane shuffle over so both show.
    const sharing = props.mascots.filter((o, j) => j < index && o.status === 'running' && o.pos === m.pos && o.lane === m.lane).length
    // Mascots that ran off the track stay just inside its edge, so they can still be seen.
    const lane = Math.min(LANES - 1, Math.max(0, m.lane))
    const pos = Math.min(FINISH - 1, Math.max(0, m.pos))
    return { index, info, m, x: spaceX(pos) + S / 2 + sharing * 10, y: laneY(lane) - sharing * 6 }
  }),
)

// Mascots run while they're moving to a new space.
const runningUntil = reactive<Record<number, number>>({})
let timers: ReturnType<typeof setTimeout>[] = []
watch(
  () => props.mascots.map((m) => `${m.pos}:${m.lane}`),
  (now, before) => {
    now.forEach((key, index) => {
      if (before && before[index] !== key) {
        runningUntil[index] = Date.now()
        timers.push(setTimeout(() => delete runningUntil[index], 850))
      }
    })
  },
)
onBeforeUnmount(() => timers.forEach(clearTimeout))

// ---- Camera ----
// On narrow screens the whole track is too small to follow, so the view zooms in on the pack
// and slides along with it. On wide screens it shows everything.

const narrow = ref(false)
let media: MediaQueryList | null = null
const onMedia = () => (narrow.value = !!media?.matches)
onMounted(() => {
  media = window.matchMedia('(max-width: 640px)')
  onMedia()
  media.addEventListener('change', onMedia)
})
onBeforeUnmount(() => media?.removeEventListener('change', onMedia))

const MIN_VIEW = 8 * S

const target = computed(() => {
  if (!narrow.value) return { x: 0, w: WIDTH }
  const running = props.mascots.filter((m) => m.status === 'running')
  // Once the race is decided, show the podium.
  if (!running.length || props.mascots.every((m) => m.status !== 'running' || m.place !== null)) {
    return { x: WIDTH - MIN_VIEW - S, w: MIN_VIEW + S }
  }
  const positions = running.map((m) => Math.min(FINISH, Math.max(0, m.pos)))
  const tail = spaceX(Math.min(...positions)) - S
  const lead = spaceX(Math.max(...positions)) + 3 * S
  const w = Math.min(WIDTH, Math.max(MIN_VIEW, lead - tail))
  const x = Math.min(Math.max(0, lead - w), WIDTH - w)
  return { x, w }
})

const camera = reactive({ x: 0, w: WIDTH })
let cameraFrame = 0
function moveCamera() {
  const goal = target.value
  camera.x += (goal.x - camera.x) * 0.12
  camera.w += (goal.w - camera.w) * 0.12
  const done = Math.abs(goal.x - camera.x) < 0.5 && Math.abs(goal.w - camera.w) < 0.5
  if (done) Object.assign(camera, goal)
  cameraFrame = done ? 0 : requestAnimationFrame(moveCamera)
}
watch(
  target,
  (goal, before) => {
    // Jump straight there the first time, and glide after that.
    if (!before) Object.assign(camera, goal)
    else if (!cameraFrame) cameraFrame = requestAnimationFrame(moveCamera)
  },
  { immediate: true },
)
onBeforeUnmount(() => cancelAnimationFrame(cameraFrame))
const viewBox = computed(() => `${camera.x.toFixed(1)} 0 ${camera.w.toFixed(1)} ${HEIGHT}`)

/** A crash bang where a mascot got hit. */
const bursts = computed(() => {
  const latest = props.latest
  if (!latest) return []
  return latest.events
    .filter((event) => event.kind === 'collide' && event.other !== undefined)
    .map((event) => {
      const spot = placed.value[event.other!]!
      return { key: `${latest.seq}-${event.other}`, x: spot.x, y: spot.y }
    })
})

const folded = computed(() => (props.back > 0 ? spaceX(props.back) - X0 + 8 : 0))
const starPath = (r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 ? r * 0.45 : r
    const angle = (Math.PI / 5) * i - Math.PI / 2
    return `${(Math.cos(angle) * radius).toFixed(1)},${(Math.sin(angle) * radius).toFixed(1)}`
  }).join(' ')
</script>

<template>
  <svg class="race-track" :viewBox="viewBox" role="img" aria-label="The race track">
    <defs>
      <pattern id="mm-grass" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#5fae4f" />
        <rect width="20" height="40" fill="#68b857" />
      </pattern>
      <pattern id="mm-checker" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="#fff" />
        <rect width="6" height="6" fill="#1d1b19" />
        <rect x="6" y="6" width="6" height="6" fill="#1d1b19" />
      </pattern>
      <linearGradient id="mm-curl" x1="0" x2="1">
        <stop offset="0" stop-color="#3a2e26" />
        <stop offset="0.8" stop-color="#4b3b30" />
        <stop offset="1" stop-color="#8a7461" />
      </linearGradient>
    </defs>

    <rect :width="WIDTH" :height="HEIGHT" fill="url(#mm-grass)" />

    <!-- The running track. -->
    <rect :x="X0" :y="TOP" :width="FINISH * S" :height="TRACK_H" fill="#c8553d" />
    <rect
      v-for="star in STARS"
      :key="`star-col-${star}`"
      :x="spaceX(star)"
      :y="TOP"
      :width="S"
      :height="TRACK_H"
      fill="#ffd166"
      opacity="0.28"
    />
    <line
      v-for="lane in LANES + 1"
      :key="`lane-${lane}`"
      :x1="X0"
      :x2="FINISH_X"
      :y1="TOP + (lane - 1) * L"
      :y2="TOP + (lane - 1) * L"
      stroke="#fff"
      :stroke-width="lane === 1 || lane === LANES + 1 ? 3 : 1.6"
      :opacity="lane === 1 || lane === LANES + 1 ? 1 : 0.75"
    />
    <line
      v-for="space in FINISH"
      :key="`space-${space}`"
      :x1="spaceX(space)"
      :x2="spaceX(space)"
      :y1="TOP"
      :y2="TOP + TRACK_H"
      stroke="#fff"
      stroke-opacity="0.22"
      stroke-width="1"
    />
    <rect :x="spaceX(START) - 2" :y="TOP" width="4" :height="TRACK_H" fill="#fff" />
    <rect :x="FINISH_X" :y="TOP" width="14" :height="TRACK_H" fill="url(#mm-checker)" />

    <g v-for="star in STARS" :key="`star-${star}`" :transform="`translate(${spaceX(star) + S / 2} ${TOP - 13})`">
      <polygon :points="starPath(11)" fill="#ffd166" stroke="#1d1b19" stroke-width="1.5" />
    </g>

    <g v-for="(fold, i) in FOLDS" :key="`fold-${fold}`">
      <line
        :x1="spaceX(fold)"
        :x2="spaceX(fold)"
        :y1="TOP"
        :y2="TOP + TRACK_H"
        stroke="#fffbe6"
        stroke-width="2"
        stroke-dasharray="6 6"
        opacity="0.8"
      />
      <text :x="spaceX(fold)" :y="TOP + TRACK_H + 18" class="fold-label">fold {{ i + 1 }}</text>
    </g>
    <text :x="spaceX(START)" :y="TOP + TRACK_H + 18" class="fold-label">start</text>
    <text :x="FINISH_X + 7" :y="TOP + TRACK_H + 18" class="fold-label">finish</text>

    <!-- The folded part of the track, rolled up from the back. -->
    <g class="fold-mat">
      <rect :x="X0 - 8" :y="TOP - 6" :width="folded" :height="TRACK_H + 12" fill="url(#mm-curl)" rx="6" />
    </g>

    <!-- The podium. -->
    <g>
      <rect
        v-for="(step, i) in PODIUM"
        :key="`podium-${i}`"
        :x="step.x - 24"
        :y="step.y"
        width="48"
        :height="step.h"
        :fill="['#ffd166', '#dfe3e8', '#e3a46f'][i]"
        stroke="#1d1b19"
        stroke-width="2"
        rx="3"
      />
      <text v-for="(step, i) in PODIUM" :key="`num-${i}`" :x="step.x" :y="step.y + 24" class="podium-num">{{ i + 1 }}</text>
    </g>

    <g
      v-for="spot in placed"
      :key="spot.index"
      class="slot"
      :style="{ transform: `translate(${spot.x}px, ${spot.y}px)` }"
    >
      <g transform="scale(0.88)">
        <MascotSprite
          :animal="spot.info.animal"
          :color="spot.info.color"
          :running="runningUntil[spot.index] !== undefined"
          :fallen="spot.m.fallen"
          :backwards="spot.m.facing === -1"
          :out="spot.m.status === 'out'"
        />
      </g>
    </g>

    <g v-for="burst in bursts" :key="burst.key" class="burst" :style="{ transform: `translate(${burst.x}px, ${burst.y - 8}px)` }">
      <polygon :points="starPath(22)" fill="#fff3b0" stroke="#e5383b" stroke-width="3" />
      <text class="pow" y="1">POW</text>
    </g>

    <text v-if="countdown > 0" :key="countdown" :x="camera.x + camera.w / 2" :y="TOP + TRACK_H / 2" class="countdown">{{ countdown }}</text>
  </svg>
</template>

<style scoped>
.race-track {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius);
  user-select: none;
}

.slot {
  transition: transform 0.75s cubic-bezier(0.45, 0, 0.25, 1);
}

.fold-mat rect {
  transition: width 0.9s cubic-bezier(0.65, 0, 0.35, 1);
}

.fold-label {
  fill: #fff;
  font-size: 11px;
  font-weight: 700;
  text-anchor: middle;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.45);
  stroke-width: 3px;
}

.podium-num {
  fill: #1d1b19;
  font-size: 18px;
  font-weight: 900;
  text-anchor: middle;
}

.burst {
  pointer-events: none;
}

.burst polygon,
.burst text {
  animation: pow 0.9s ease-out forwards;
  transform-box: fill-box;
  transform-origin: center;
}

.pow {
  fill: #e5383b;
  font-size: 11px;
  font-weight: 900;
  text-anchor: middle;
  dominant-baseline: central;
}

@keyframes pow {
  0% {
    transform: scale(0.2);
    opacity: 1;
  }
  30% {
    transform: scale(1.15);
  }
  70% {
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0;
  }
}

.countdown {
  fill: #fff;
  font-size: 110px;
  font-weight: 900;
  text-anchor: middle;
  dominant-baseline: central;
  paint-order: stroke;
  stroke: #1d1b19;
  stroke-width: 8px;
  animation: count 0.85s ease-out;
  transform-box: fill-box;
  transform-origin: center;
}

@keyframes count {
  from {
    transform: scale(1.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .slot,
  .fold-mat rect {
    transition-duration: 0.01s;
  }
}
</style>
