<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  MAX_WARDEN_STEPS,
  WAIT_ROUNDS,
  WARDENS,
  courierStarts,
  postChoices,
  thiefOptions,
  type MidnightLiftMove,
  type MidnightLiftView,
} from '../../../games/midnight-lift/logic'
import {
  CORNERS,
  DOORWAYS,
  MAP,
  MAP_SIZE,
  MARGIN,
  POST_CORNERS,
  SPACING,
  START_SPOTS,
  STREETS,
  cornersWithin,
} from '../../../games/midnight-lift/map'
import type { PublicPlayer } from '../../../shared/protocol'
import { canAnimate } from '../../motion'

const props = defineProps<{ view: MidnightLiftView; you: string; players: PublicPlayer[] }>()
const emit = defineEmits<{ move: [move: MidnightLiftMove] }>()

interface WardenLook {
  name: string
  fill: string
}
const WARDEN_LOOKS: WardenLook[] = [
  { name: 'Red', fill: '#d6453d' },
  { name: 'Blue', fill: '#2f6fde' },
  { name: 'Green', fill: '#23955a' },
  { name: 'Gold', fill: '#d99a12' },
  { name: 'Violet', fill: '#8a4fd0' },
]

const nameOf = (id: string | null) => props.players.find((p) => p.id === id)?.name ?? 'Someone'
const v = computed(() => props.view)
const isThief = computed(() => v.value.youAreThief)
const isWatch = computed(() => v.value.watchIds.includes(props.you))
const isLead = computed(() => v.value.leadId === props.you)
const myWardens = computed(() =>
  Array.from({ length: WARDENS }, (_, i) => i).filter((i) => v.value.owners[i] === props.you),
)

// ---- Local picks, cleared whenever the phase changes ----
const picked = ref<number[]>([])
const revealPick = ref<number | null>(null)
const mode = ref<'step' | 'dash' | 'rooftop'>('step')
const dashVia = ref<number | null>(null)
const target = ref<number | null>(null)
const warden = ref<number | null>(null)
const tokenPick = ref(0)
/** Corners for each post while the lead places them: five wardens, then two decoys. */
const draft = ref<(number | null)[]>(Array(7).fill(null))

const phaseKey = computed(() => `${v.value.night}-${v.value.phase}-${v.value.movesUsed}`)
watch(phaseKey, () => {
  picked.value = []
  revealPick.value = null
  mode.value = 'step'
  dashVia.value = null
  target.value = null
  warden.value = null
  if (v.value.phase === 'posts') {
    draft.value = Array(7).fill(null)
    tokenPick.value = 0
  }
  pickFreeWarden()
})

function pickFreeWarden() {
  if (warden.value !== null && !v.value.done[warden.value] && myWardens.value.includes(warden.value)) return
  warden.value = myWardens.value.find((i) => !v.value.done[i]) ?? null
}
watch(() => v.value.done.join(), pickFreeWarden, { immediate: true })

// ---- Motion ----
const animate = ref(false)
const updateMotion = () => (animate.value = canAnimate())
onMounted(() => {
  updateMotion()
  document.addEventListener('visibilitychange', updateMotion)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', updateMotion))

// ---- What can be tapped right now ----
const movesLeft = computed(() => v.value.maxMoves - v.value.movesUsed)
const options = computed(() => (isThief.value && v.value.phase === 'thief' ? thiefOptions(v.value, movesLeft.value) : null))

const doorTargets = computed<Set<number>>(() => {
  const view = v.value
  if (isThief.value) {
    if (view.phase === 'safehouse') return new Set(DOORWAYS.map((d) => d.id).filter((d) => !START_SPOTS.includes(d)))
    if (view.phase === 'couriers') return new Set(courierStarts(view))
    if (view.phase === 'wait') return new Set(view.couriers)
    if (view.phase === 'thief' && options.value) {
      if (mode.value === 'step') return new Set(options.value.steps)
      if (mode.value === 'rooftop') return new Set(options.value.rooftops)
      const dashes = options.value.dashes
      if (dashVia.value === null) return new Set(dashes.map((d) => d.via))
      return new Set(dashes.filter((d) => d.via === dashVia.value).map((d) => d.to))
    }
  }
  if (isWatch.value && view.phase === 'watchAct' && warden.value !== null) {
    const corner = view.wardens[warden.value]
    if (corner === null || corner === undefined) return new Set()
    return new Set(CORNERS[corner]!.doorways.filter((d) => !view.searched[warden.value!]?.includes(d)))
  }
  return new Set()
})

const postCornersTonight = computed(() => {
  const { fixed, open } = postChoices(v.value)
  return new Set([...fixed, ...open])
})

const cornerTargets = computed<Set<number>>(() => {
  const view = v.value
  if (isThief.value && view.phase === 'wait') {
    return new Set(view.posts.filter((p) => !p.revealed).map((p) => p.corner))
  }
  if (isLead.value && view.phase === 'posts') return postCornersTonight.value
  if (isWatch.value && view.phase === 'watchMove' && warden.value !== null) {
    const start = view.moveStart[warden.value]!
    const taken = view.wardens.filter((c, i) => i !== warden.value && c !== null)
    return new Set([start, ...cornersWithin(start, MAX_WARDEN_STEPS)].filter((c) => !taken.includes(c)))
  }
  return new Set()
})

// ---- Taps ----
function tapDoorway(id: number) {
  if (!doorTargets.value.has(id)) return
  const view = v.value
  if (isThief.value && view.phase === 'safehouse') return (target.value = id)
  if (isThief.value && (view.phase === 'couriers' || view.phase === 'wait')) {
    const limit = view.phase === 'couriers' ? view.carryingTonight : view.jobsTonight
    if (picked.value.includes(id)) picked.value = picked.value.filter((d) => d !== id)
    else if (limit === 1) picked.value = [id]
    else if (picked.value.length < limit) picked.value = [...picked.value, id]
    return
  }
  if (isThief.value && view.phase === 'thief') {
    if (mode.value === 'dash' && dashVia.value === null) return (dashVia.value = id)
    return (target.value = id)
  }
  if (view.phase === 'watchAct') target.value = id
}

function tapCorner(id: number) {
  const view = v.value
  // Tapping another of your own wardens selects it.
  const wardenHere = view.wardens.indexOf(id)
  const acting = view.phase === 'watchMove' || view.phase === 'watchAct'
  if (isWatch.value && acting && myWardens.value.includes(wardenHere) && !view.done[wardenHere] && wardenHere !== warden.value) {
    warden.value = wardenHere
    target.value = null
    return
  }
  if (!cornerTargets.value.has(id)) return
  if (isThief.value && view.phase === 'wait') return (revealPick.value = id)
  if (view.phase === 'posts') {
    const next = [...draft.value]
    const clash = next.indexOf(id)
    if (clash !== -1) next[clash] = null
    next[tokenPick.value] = id
    draft.value = next
    const empty = next.findIndex((c) => c === null)
    if (empty !== -1) tokenPick.value = empty
    return
  }
  if (view.phase === 'watchMove' && warden.value !== null) {
    emit('move', { type: 'moveWarden', warden: warden.value, to: id })
  }
}

function setMode(next: typeof mode.value) {
  mode.value = next
  dashVia.value = null
  target.value = null
}

function go() {
  if (target.value === null) return
  if (mode.value === 'step') emit('move', { type: 'step', to: target.value })
  else if (mode.value === 'rooftop') emit('move', { type: 'rooftop', to: target.value })
  else if (dashVia.value !== null) emit('move', { type: 'dash', via: dashVia.value, to: target.value })
}

const fixedCorners = computed(() => new Set(postChoices(v.value).fixed))
const draftReady = computed(
  () => draft.value.every((c) => c !== null) && [...fixedCorners.value].every((c) => draft.value.includes(c)),
)
function placePosts() {
  if (!draftReady.value) return
  const corners = draft.value as number[]
  emit('move', { type: 'posts', wardens: corners.slice(0, WARDENS), decoys: corners.slice(WARDENS) })
}

// ---- Words ----
const thiefName = computed(() => nameOf(v.value.thiefId))
const status = computed(() => {
  const view = v.value
  if (view.phase === 'over') return view.winner === 'thief' ? 'The thief got away!' : 'The Watch caught the thief!'
  if (isThief.value) {
    switch (view.phase) {
      case 'safehouse':
        return 'Pick a doorway for your safehouse. Only you can see it.'
      case 'couriers':
        return `Pick ${view.carryingTonight} courier${view.carryingTonight === 1 ? '' : 's'} to carry valuables. The rest are decoys.`
      case 'posts':
        return `${nameOf(view.leadId)} is placing the Watch’s posts.`
      case 'wait':
        return view.waitRound >= WAIT_ROUNDS
          ? `Strike now: pick ${view.jobsTonight === 1 ? 'a courier' : `${view.jobsTonight} couriers`}.`
          : `Strike a courier, or pick a post to check and wait.`
      case 'thief':
        return mode.value === 'dash' && dashVia.value === null
          ? 'Dash: pick the first doorway.'
          : 'Your move. Get home before you run out of moves.'
      default:
        return 'The Watch is on the move.'
    }
  }
  switch (view.phase) {
    case 'safehouse':
      return `${thiefName.value} is picking a safehouse.`
    case 'couriers':
      return `${thiefName.value} is sending out couriers.`
    case 'posts':
      return isLead.value ? 'Place the posts: pick a token, then a corner.' : `${nameOf(view.leadId)} is placing the posts.`
    case 'wait':
      return `${thiefName.value} is watching the couriers. Round ${view.waitRound} of ${WAIT_ROUNDS}.`
    case 'thief':
      return `${thiefName.value} is on the move.`
    case 'watchMove':
      if (!isWatch.value) return 'The Watch is moving.'
      return warden.value === null ? 'Waiting for the rest of the Watch.' : `Move ${WARDEN_LOOKS[warden.value]!.name} up to two corners, then press Done.`
    case 'watchAct':
      if (!isWatch.value) return 'The Watch is searching.'
      return warden.value === null
        ? 'Waiting for the rest of the Watch.'
        : `${WARDEN_LOOKS[warden.value]!.name}: pick a doorway by its corner to search or arrest.`
  }
  return ''
})

const roleLine = computed(() => {
  if (isThief.value) return 'You’re the thief.'
  if (isWatch.value) {
    const names = myWardens.value.map((i) => WARDEN_LOOKS[i]!.name).join(', ')
    return `You’re on the Night Watch, running ${names}.`
  }
  return 'You’re watching.'
})

const TRAIL_MARK = { job: '✕', step: '•', dash: '»', rooftop: '⌃' } as const
const trailCells = computed(() =>
  Array.from({ length: v.value.maxMoves }, (_, i) => v.value.trail[i] ?? null),
)

// ---- Map drawing ----
const INSET = 11
const blocks = computed(() => {
  const rects: { x: number; y: number; w: number; h: number }[] = MAP.cells.map((cell) => ({
    x: MARGIN + cell.col * SPACING + INSET,
    y: MARGIN + cell.row * SPACING + INSET,
    w: SPACING - INSET * 2,
    h: SPACING - INSET * 2,
  }))
  // Fill in closed streets so joined blocks read as one.
  for (const key of MAP.closed) {
    const [r, c] = key.slice(1).split(',').map(Number) as [number, number]
    if (key.startsWith('v')) {
      rects.push({ x: MARGIN + c * SPACING - INSET - 1, y: MARGIN + r * SPACING + INSET, w: INSET * 2 + 2, h: SPACING - INSET * 2 })
    } else {
      rects.push({ x: MARGIN + c * SPACING + INSET, y: MARGIN + r * SPACING - INSET - 1, w: SPACING - INSET * 2, h: INSET * 2 + 2 })
    }
  }
  return rects
})

const streetLines = STREETS.map((s) => ({ a: CORNERS[s.ends[0]]!, b: CORNERS[s.ends[1]]!, key: s.key }))

const pathLine = computed(() => {
  const path = v.value.phase === 'over' ? v.value.path : isThief.value ? v.value.path : []
  return path.map((d) => `${DOORWAYS[d]!.x},${DOORWAYS[d]!.y}`).join(' ')
})
const pastPaths = computed(() =>
  v.value.history.map((path) => path.map((d) => `${DOORWAYS[d]!.x},${DOORWAYS[d]!.y}`).join(' ')),
)

const shownCouriers = computed(() => {
  const view = v.value
  if (view.phase === 'posts') return view.courierSpots.map((d) => ({ d, real: isThief.value ? view.couriers.includes(d) : null }))
  if (view.phase === 'wait') return view.couriers.map((d) => ({ d, real: true }))
  return []
})

const wardenAt = (corner: number) => v.value.wardens.indexOf(corner)
const draftAt = (corner: number) => draft.value.indexOf(corner)

function doorClass(id: number) {
  return {
    start: (v.value.phase === 'couriers' || v.value.phase === 'safehouse') && START_SPOTS.includes(id),
    target: doorTargets.value.has(id),
    picked: picked.value.includes(id) || target.value === id || dashVia.value === id,
    missed: v.value.misses.includes(id),
  }
}

const jobsLine = computed(() => `${v.value.jobsDone} of 5 jobs`)
</script>

<template>
  <div class="midnight-lift" :class="{ animate }">
    <div class="topline">
      <p class="eyebrow">Night {{ view.night }} of 4 · {{ jobsLine }}</p>
      <p class="muted role">{{ roleLine }}</p>
    </div>

    <p class="status" aria-live="polite">{{ status }}</p>
    <p v-if="view.news && !['over', 'safehouse'].includes(view.phase)" class="news muted">{{ view.news }}</p>
    <p v-if="view.phase === 'over'" class="news">{{ view.news }}</p>

    <div class="board">
      <svg :viewBox="`0 0 ${MAP_SIZE} ${MAP_SIZE}`" role="img" aria-label="Map of the market district">
        <rect :width="MAP_SIZE" :height="MAP_SIZE" rx="10" class="ground" />
        <rect v-for="(b, i) in blocks" :key="`b${i}`" :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="5" class="block" />
        <line v-for="s in streetLines" :key="s.key" :x1="s.a.x" :y1="s.a.y" :x2="s.b.x" :y2="s.b.y" class="street" />

        <polyline v-for="(p, i) in pastPaths" :key="`h${i}`" :points="p" class="trail past" />
        <polyline v-if="pathLine" :points="pathLine" class="trail" />

        <!-- Corners -->
        <g v-for="c in CORNERS" :key="`c${c.id}`" :data-corner="c.id" :transform="`translate(${c.x} ${c.y})`" @click="tapCorner(c.id)">
          <circle r="13" class="hit" />
          <rect x="-5" y="-5" width="10" height="10" rx="2" class="corner" :class="{ marked: POST_CORNERS.includes(c.id) && view.phase === 'posts' }" />
          <circle v-if="cornerTargets.has(c.id)" r="11" class="ring corner-ring" :class="{ picked: revealPick === c.id, required: view.phase === 'posts' && fixedCorners.has(c.id) }" />
        </g>

        <!-- Doorways -->
        <g v-for="d in DOORWAYS" :key="`d${d.id}`" :data-door="d.id" :transform="`translate(${d.x} ${d.y})`" :class="doorClass(d.id)" class="door-g" @click="tapDoorway(d.id)">
          <circle r="13" class="hit" />
          <circle r="5.5" class="door" />
          <circle v-if="doorClass(d.id).target" r="9.5" class="ring" />
        </g>

        <!-- Job sites -->
        <g v-for="j in view.jobSites" :key="`j${j}`" :transform="`translate(${DOORWAYS[j]!.x} ${DOORWAYS[j]!.y})`" class="job">
          <path d="M-6 -6 L6 6 M6 -6 L-6 6" />
        </g>

        <!-- Lanterns -->
        <g v-for="l in view.lanterns" :key="`l${l}`" :transform="`translate(${DOORWAYS[l]!.x} ${DOORWAYS[l]!.y})`" class="lantern">
          <circle r="9" class="glow" />
          <path d="M-3.5 -5 H3.5 L4.5 3 H-4.5 Z M-2 -7.5 H2" />
        </g>

        <!-- Couriers -->
        <g v-for="c in shownCouriers" :key="`k${c.d}`" :transform="`translate(${DOORWAYS[c.d]!.x} ${DOORWAYS[c.d]!.y})`" class="courier" :class="{ decoy: c.real === false, picked: picked.includes(c.d) }">
          <circle r="7.5" />
          <path d="M-3 -1 H3 V3.5 H-3 Z M-1.5 -1 V-3 H1.5 V-1" />
        </g>

        <!-- Safehouse and thief, for the thief's eyes -->
        <g v-if="view.safehouse !== null" :transform="`translate(${DOORWAYS[view.safehouse]!.x} ${DOORWAYS[view.safehouse]!.y})`" class="safehouse">
          <path d="M-8 1 L0 -8 L8 1 V8 H-8 Z" />
        </g>
        <g v-if="view.position !== null" :transform="`translate(${DOORWAYS[view.position]!.x} ${DOORWAYS[view.position]!.y})`" class="thief">
          <circle r="8" />
          <path d="M-5 -1.5 H5" />
        </g>

        <!-- Posts before the alarm -->
        <g v-for="p in view.posts" :key="`p${p.corner}`" :transform="`translate(${CORNERS[p.corner]!.x} ${CORNERS[p.corner]!.y})`" class="post" @click="tapCorner(p.corner)">
          <rect x="-9" y="-9" width="18" height="18" rx="4" :style="p.warden !== null ? { fill: WARDEN_LOOKS[p.warden]!.fill } : undefined" :class="{ hidden: p.warden === null && !p.revealed, revealed: p.revealed }" />
          <text v-if="p.warden === null" y="4" text-anchor="middle">?</text>
          <circle v-if="revealPick === p.corner" r="13" class="ring picked" />
        </g>

        <!-- The lead's posts while they place them -->
        <template v-if="view.phase === 'posts' && isLead">
          <g v-for="(corner, i) in draft" :key="`dr${i}`">
            <g v-if="corner !== null" :transform="`translate(${CORNERS[corner]!.x} ${CORNERS[corner]!.y})`" class="post" @click="tapCorner(corner)">
              <rect x="-9" y="-9" width="18" height="18" rx="4" :class="{ hidden: i >= WARDENS }" :style="i < WARDENS ? { fill: WARDEN_LOOKS[i]!.fill } : undefined" />
              <text v-if="i >= WARDENS" y="4" text-anchor="middle">D</text>
            </g>
          </g>
        </template>

        <!-- Wardens -->
        <g v-for="(corner, i) in view.wardens" :key="`w${i}`">
          <g v-if="corner !== null" :transform="`translate(${CORNERS[corner]!.x} ${CORNERS[corner]!.y})`" class="warden" :class="{ mine: myWardens.includes(i), selected: warden === i && isWatch, done: view.done[i] && (view.phase === 'watchMove' || view.phase === 'watchAct') }" @click="tapCorner(corner)">
            <circle r="10" :style="{ fill: WARDEN_LOOKS[i]!.fill }" />
            <circle r="4" class="cap" />
          </g>
        </g>
      </svg>
    </div>

    <!-- Moves used tonight: everyone sees how, only the thief sees where. -->
    <div v-if="['thief', 'watchMove', 'watchAct', 'over'].includes(view.phase)" class="moves" aria-label="Moves used tonight">
      <span v-for="(cell, i) in trailCells" :key="i" class="move-cell" :class="cell ?? 'empty'">{{ cell ? TRAIL_MARK[cell] : i + 1 }}</span>
    </div>
    <p v-if="['thief', 'watchMove', 'watchAct'].includes(view.phase)" class="muted small">
      {{ movesLeft }} moves left · {{ view.dashes }} dash{{ view.dashes === 1 ? '' : 'es' }} · {{ view.rooftops }} rooftop{{ view.rooftops === 1 ? '' : 's' }}
    </p>

    <!-- Thief controls -->
    <div v-if="isThief" class="controls">
      <button v-if="view.phase === 'safehouse'" class="primary" :disabled="target === null" @click="target !== null && emit('move', { type: 'safehouse', doorway: target })">
        Hide here
      </button>
      <button v-if="view.phase === 'couriers'" class="primary" :disabled="picked.length !== view.carryingTonight" @click="emit('move', { type: 'couriers', doorways: picked })">
        Send them out ({{ picked.length }}/{{ view.carryingTonight }})
      </button>
      <template v-if="view.phase === 'wait'">
        <button class="primary" :disabled="picked.length !== view.jobsTonight" @click="emit('move', { type: 'strike', doorways: picked })">
          Strike{{ view.jobsTonight > 1 ? ` (${picked.length}/${view.jobsTonight})` : '' }}
        </button>
        <button :disabled="revealPick === null || view.waitRound >= WAIT_ROUNDS" @click="revealPick !== null && emit('move', { type: 'wait', reveal: revealPick })">
          Wait and check post
        </button>
      </template>
      <template v-if="view.phase === 'thief'">
        <div class="modes" role="group" aria-label="Kind of move">
          <button :class="{ on: mode === 'step' }" @click="setMode('step')">Step</button>
          <button :class="{ on: mode === 'dash' }" :disabled="!options?.dashes.length" @click="setMode('dash')">Dash ({{ view.dashes }})</button>
          <button :class="{ on: mode === 'rooftop' }" :disabled="!options?.rooftops.length" @click="setMode('rooftop')">Rooftop ({{ view.rooftops }})</button>
        </div>
        <button class="primary" :disabled="target === null" @click="go">Go</button>
      </template>
    </div>

    <!-- Watch controls -->
    <div v-if="isWatch" class="controls">
      <template v-if="view.phase === 'posts' && isLead">
        <div class="tokens" role="group" aria-label="Posts to place">
          <button v-for="(corner, i) in draft" :key="i" class="token" :class="{ on: tokenPick === i, placed: corner !== null }" @click="tokenPick = i">
            <span class="swatch" :class="{ decoy: i >= WARDENS }" :style="i < WARDENS ? { background: WARDEN_LOOKS[i]!.fill } : undefined" />
            {{ i < WARDENS ? WARDEN_LOOKS[i]!.name : 'Decoy' }}
          </button>
        </div>
        <p v-if="view.night > 1" class="muted small">Five posts go where the wardens ended last night (solid rings), and two on other marked corners.</p>
        <button class="primary" :disabled="!draftReady" @click="placePosts">Place posts</button>
      </template>

      <template v-if="view.phase === 'watchMove' || view.phase === 'watchAct'">
        <div class="tokens" role="group" aria-label="Your wardens">
          <button v-for="i in myWardens" :key="i" class="token" :class="{ on: warden === i }" :disabled="view.done[i]" @click="warden = i; target = null">
            <span class="swatch" :style="{ background: WARDEN_LOOKS[i]!.fill }" />
            {{ WARDEN_LOOKS[i]!.name }}
          </button>
        </div>
        <template v-if="view.phase === 'watchAct'">
          <div class="row">
            <button class="primary" :disabled="target === null || warden === null" @click="target !== null && warden !== null && emit('move', { type: 'search', warden, doorway: target })">
              Search
            </button>
            <button :disabled="target === null || warden === null" @click="target !== null && warden !== null && emit('move', { type: 'arrest', warden, doorway: target })">
              Arrest
            </button>
          </div>
        </template>
        <button :disabled="myWardens.every((i) => view.done[i])" @click="emit('move', { type: 'done' })">
          {{ view.phase === 'watchMove' ? 'Done moving' : 'Done searching' }}
        </button>
      </template>
    </div>

    <ul class="key muted small">
      <li><span class="k k-door" /> Doorway</li>
      <li><span class="k k-corner" /> Corner</li>
      <li><span class="k k-job">✕</span> Robbed</li>
      <li><span class="k k-lantern" /> Thief came by</li>
      <li v-if="isThief || view.phase === 'over'"><span class="k k-home" /> Safehouse</li>
    </ul>
  </div>
</template>

<style scoped>
.midnight-lift {
  --ml-ground: #3a3f52;
  --ml-block: #e9e1cf;
  --ml-street: #8c93ab;
  --ml-door: #fffdf8;
  --ml-door-edge: #3a3f52;
  --ml-target: #f2b705;
  --ml-lantern: #ffc93c;
  --ml-thief: #1d1b19;
  --ml-courier: #1b8a6b;
  display: grid;
  gap: 0.6rem;
  justify-items: center;
  width: 100%;
}

:root[data-theme='dark'] .midnight-lift {
  --ml-ground: #12141c;
  --ml-block: #2c2a33;
  --ml-street: #4b5168;
  --ml-door: #d9d1c1;
  --ml-door-edge: #12141c;
  --ml-thief: #f2ede3;
  --ml-courier: #36c08f;
}

.topline {
  display: grid;
  justify-items: center;
  gap: 0.1rem;
  text-align: center;
}

.status {
  font-size: 1.05rem;
  font-weight: 700;
  text-align: center;
}

.news {
  text-align: center;
}

.small {
  font-size: 0.85rem;
  text-align: center;
}

.board {
  width: min(100%, 32rem);
}

svg {
  display: block;
  width: 100%;
  height: auto;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.ground {
  fill: var(--ml-ground);
}

.block {
  fill: var(--ml-block);
}

.street {
  stroke: var(--ml-street);
  stroke-width: 2;
  stroke-dasharray: 3 4;
}

.hit {
  fill: transparent;
  cursor: pointer;
}

.corner {
  fill: var(--ml-street);
}

.corner.marked {
  fill: var(--ml-target);
}

.door {
  fill: var(--ml-door);
  stroke: var(--ml-door-edge);
  stroke-width: 1.5;
}

.door-g.start .door {
  fill: var(--ml-courier);
}

.door-g.missed .door {
  fill: var(--ml-street);
}

.ring {
  fill: none;
  stroke: var(--ml-target);
  stroke-width: 2.5;
  pointer-events: none;
}

.ring.required {
  stroke-dasharray: none;
  stroke-width: 4;
  stroke: #fff;
}

.door-g.picked .ring,
.ring.picked {
  stroke: var(--accent);
  stroke-width: 3.5;
}

.animate .ring:not(.picked) {
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}

.trail {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
  stroke-linejoin: round;
  stroke-linecap: round;
  opacity: 0.75;
  pointer-events: none;
}

.trail.past {
  opacity: 0.3;
  stroke-dasharray: 4 4;
}

.job path {
  stroke: var(--accent);
  stroke-width: 3.5;
  stroke-linecap: round;
  pointer-events: none;
}

.lantern {
  pointer-events: none;
}

.lantern .glow {
  fill: var(--ml-lantern);
  opacity: 0.55;
}

.lantern path {
  fill: var(--ml-lantern);
  stroke: #1d1b19;
  stroke-width: 1.2;
}

.courier {
  pointer-events: none;
}

.courier circle {
  fill: var(--ml-courier);
  stroke: var(--ml-door);
  stroke-width: 1.5;
}

.courier path {
  fill: none;
  stroke: #fff;
  stroke-width: 1.3;
}

.courier.decoy {
  opacity: 0.45;
}

.courier.picked circle {
  stroke: var(--accent);
  stroke-width: 3;
}

.safehouse path {
  fill: var(--ml-target);
  stroke: #1d1b19;
  stroke-width: 1.5;
  pointer-events: none;
}

.thief {
  pointer-events: none;
}

.thief circle {
  fill: var(--ml-thief);
  stroke: var(--accent);
  stroke-width: 2.5;
}

.thief path {
  stroke: var(--accent);
  stroke-width: 2.5;
}

.post {
  cursor: pointer;
}

.post rect {
  stroke: #fff;
  stroke-width: 1.5;
}

.post rect.hidden {
  fill: #5c6178;
}

.post text {
  fill: #fff;
  font-size: 12px;
  font-weight: 800;
  pointer-events: none;
}

.warden {
  cursor: pointer;
}

.warden circle:first-child {
  stroke: #fff;
  stroke-width: 2;
}

.warden .cap {
  fill: rgba(255, 255, 255, 0.85);
}

.warden.selected circle:first-child {
  stroke: var(--ml-target);
  stroke-width: 3.5;
}

.warden.done {
  opacity: 0.55;
}

.moves {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.2rem;
  max-width: 32rem;
}

.move-cell {
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border: 1px solid var(--line);
  border-radius: 0.3rem;
  background: var(--surface);
  font-size: 0.8rem;
  font-weight: 700;
}

.move-cell.empty {
  color: var(--muted);
  font-weight: 400;
  font-size: 0.7rem;
}

.move-cell.job {
  color: var(--accent);
}

.move-cell.dash,
.move-cell.rooftop {
  background: var(--accent-soft);
}

.controls {
  display: grid;
  gap: 0.5rem;
  justify-items: center;
  width: 100%;
}

.modes,
.tokens {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
}

.modes button,
.token {
  padding: 0.4rem 0.7rem;
}

.modes button.on,
.token.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.token {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.token.placed:not(.on) {
  opacity: 0.7;
}

.swatch {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 0.2rem;
}

.swatch.decoy {
  background: #5c6178;
}

.key {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.25rem 0.9rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.key li {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.k {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
}

.k-door {
  border: 1.5px solid var(--ml-door-edge);
  border-radius: 50%;
  background: var(--ml-door);
}

.k-corner {
  border-radius: 0.15rem;
  background: var(--ml-street);
}

.k-job {
  width: auto;
  height: auto;
  color: var(--accent);
  font-weight: 800;
}

.k-lantern {
  border-radius: 50%;
  background: var(--ml-lantern);
}

.k-home {
  background: var(--ml-target);
  clip-path: polygon(50% 0, 100% 45%, 100% 100%, 0 100%, 0 45%);
}
</style>
