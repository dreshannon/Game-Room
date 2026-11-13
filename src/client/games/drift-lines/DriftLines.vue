<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  LANTERN_COLORS,
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
const lanternSize = computed(() => 4 + v.value.size * 2.2)
const nameOf = (id: string) => props.players.find((p) => p.id === id)?.name ?? 'Someone'
const youOr = (id: string) => (id === props.you ? 'You' : nameOf(id))
const swatchOf = (d: { color: number }) => LANTERN_COLORS[d.color % LANTERN_COLORS.length]!
const colorOf = (d: { color: number }) => swatchOf(d).fill
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
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  clearInterval(clock)
  stopDrifting()
  document.removeEventListener('visibilitychange', updateMotion)
  window.removeEventListener('keydown', onKey)
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
/** Where a lantern rests: its spot, or the end of its trail if it went out on the way. */
function restingXY(d: DrifterView) {
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
const newestSq = computed(() => v.value.log[v.value.log.length - 1]?.sq ?? null)

// ---- Drifting: new trail draws in while the lantern follows it ----
const seenTrail = ref<Record<string, number>>({})
const freshFrom = ref<Record<string, number>>({})
/** Milliseconds per channel drifted. */
const segmentMs = ref(220)
const moving = ref<Record<string, [number, number]>>({})
const measure = ref<SVGGElement | null>(null)
let frame = 0

function stopDrifting() {
  cancelAnimationFrame(frame)
  moving.value = {}
  measure.value?.replaceChildren()
}

function startDrifting() {
  stopDrifting()
  const group = measure.value
  if (!animate.value || !group) return
  const runs = v.value.drifters
    .map((d) => ({ id: d.id, segments: d.trail.slice(freshFrom.value[d.id] ?? d.trail.length) }))
    .filter((r) => r.segments.length > 0)
  if (runs.length === 0) return
  const longest = Math.max(...runs.map((r) => r.segments.length))
  const step = Math.min(220, 2600 / longest)
  segmentMs.value = step
  const paths = runs.map((r) =>
    r.segments.map((s) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', segmentPath(s))
      group.appendChild(path)
      return { path, length: path.getTotalLength() }
    }),
  )
  const began = performance.now()
  const tick = (time: number) => {
    // A frame's timestamp can be from just before the drift began.
    const elapsed = Math.max(0, time - began)
    const next: Record<string, [number, number]> = {}
    runs.forEach((r, i) => {
      const parts = paths[i]!
      const index = Math.min(parts.length - 1, Math.floor(elapsed / step))
      const share = Math.min(1, (elapsed - index * step) / step)
      const point = parts[index]!.path.getPointAtLength(share * parts[index]!.length)
      if (elapsed < parts.length * step) next[r.id] = [point.x, point.y]
    })
    moving.value = next
    if (Object.keys(next).length > 0) frame = requestAnimationFrame(tick)
    else stopDrifting()
  }
  frame = requestAnimationFrame(tick)
}

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
    nextTick(startDrifting)
  },
  { immediate: true },
)
const trails = computed(() =>
  v.value.drifters.map((d) => ({
    id: d.id,
    color: colorOf(d),
    lit: d.lit || d.id in moving.value,
    paths: d.trail.map((s, i) => ({ d: segmentPath(s), fresh: i >= (freshFrom.value[d.id] ?? d.trail.length), i })),
  })),
)
const freshStyle = (id: string, i: number) =>
  animate.value
    ? {
        animationDelay: `${(i - (freshFrom.value[id] ?? 0)) * segmentMs.value}ms`,
        animationDuration: `${segmentMs.value}ms`,
      }
    : {}
const lanterns = computed(() =>
  v.value.drifters.flatMap((d) => {
    const at = moving.value[d.id] ?? restingXY(d)
    if (!at) return []
    return [{ d, at, glowing: d.lit || d.id in moving.value }]
  }),
)

// ---- Your pieces ----
const selected = ref<number | null>(null)
const turnsOf = ref<Record<number, number>>({})
const hand = computed(() => v.value.hand ?? [])
const selectedPiece = computed(() => hand.value.find((p) => p.id === selected.value) ?? null)
const turnsFor = (id: number) => turnsOf.value[id] ?? 0
const setTurns = (id: number, turns: number) => (turnsOf.value = { ...turnsOf.value, [id]: ((turns % 4) + 4) % 4 })

const asState = computed(() => ({
  size: v.value.size,
  board: v.value.board,
  drifters: v.value.drifters.map((d) => ({
    id: d.id,
    color: d.color,
    spot: d.spot,
    pick: null,
    trail: d.trail,
    hand: [],
    out: d.lit ? null : (d.out ?? { move: 0, why: 'left' as OutReason }),
    gone: d.gone,
  })),
}))
const safeFor = (pattern: number, turns: number) =>
  !preview(asState.value, props.you, pattern, turns)?.outcomes.get(props.you)?.out
const safeTurns = computed(
  () => new Map(hand.value.map((p) => [p.id, [0, 1, 2, 3].filter((t) => safeFor(p.pattern, t))])),
)
const anySafe = computed(() => [...safeTurns.value.values()].some((turns) => turns.length > 0))
const isSafe = (id: number) => safeTurns.value.get(id)?.includes(turnsFor(id)) ?? false
const noSafeTurn = (id: number) => safeTurns.value.get(id)?.length === 0

/** Turns a piece to its next safe position, if the one it's at would put you out. */
function turnToSafe(id: number) {
  const safe = safeTurns.value.get(id) ?? []
  if (safe.length === 0 || safe.includes(turnsFor(id))) return
  const from = turnsFor(id)
  const next = [1, 2, 3].map((k) => (from + k) % 4).find((t) => safe.includes(t))
  if (next !== undefined) setTurns(id, next)
}

watch(
  hand,
  (pieces) => {
    if (!pieces.some((p) => p.id === selected.value)) selected.value = pieces[0]?.id ?? null
  },
  { immediate: true },
)
// When your turn comes round, make sure the piece you lined up can be played safely.
// If it can't be turned safely at all, switch to one that can.
watch(
  () => (myTurn.value ? v.value.moves : -1),
  (moves) => {
    if (moves < 0 || selected.value === null) return
    if (noSafeTurn(selected.value)) {
      const playable = hand.value.find((p) => !noSafeTurn(p.id))
      if (playable) selected.value = playable.id
    }
    turnToSafe(selected.value)
  },
  { immediate: true },
)

function pick(id: number) {
  if (selected.value === id) return rotate(1)
  selected.value = id
  turnToSafe(id)
}
function rotate(by: number) {
  if (selected.value !== null) setTurns(selected.value, turnsFor(selected.value) + by)
}

const ghost = computed(() => {
  if (!myTurn.value || v.value.phase !== 'play' || !selectedPiece.value) return null
  const piece = selectedPiece.value
  const turns = turnsFor(piece.id)
  const result = preview(asState.value, props.you, piece.pattern, turns)
  if (!result) return null
  const [x, y] = squareXY(result.sq)
  const mine = result.outcomes.get(props.you)
  const others = [...result.outcomes]
    .filter(([id]) => id !== props.you)
    .map(([id, o]) => {
      const d = v.value.drifters.find((x) => x.id === id)!
      return { id, color: colorOf(d), out: o.out, trail: o.trail.map(segmentPath) }
    })
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
  const knocked = g.others.filter((o) => o.out).map((o) => nameOf(o.id))
  const pushed = g.others.filter((o) => !o.out).map((o) => nameOf(o.id))
  const parts: string[] = []
  if (g.out === 'wall') parts.push('This puts you out on the wall.')
  else if (g.out === 'crash') parts.push('This crashes you into another lantern.')
  else parts.push('Safe.')
  if (knocked.length) parts.push(`${listNames(knocked)} ${knocked.length === 1 ? 'goes' : 'go'} out.`)
  if (pushed.length) parts.push(`${listNames(pushed)} ${pushed.length === 1 ? 'drifts' : 'drift'} too.`)
  return parts.join(' ')
})
const blocked = computed(() => !!ghost.value?.out && anySafe.value)
const canPlace = computed(() => myTurn.value && !!selectedPiece.value && !blocked.value)

function placePiece() {
  if (!canPlace.value) return
  emit('move', { type: 'place', piece: selectedPiece.value!.id, turns: turnsFor(selectedPiece.value!.id) })
}

/** Before the first piece: tells you if someone earlier in turn order took the spot you picked. */
const bumpedLine = computed(() => {
  const first = v.value.log[0]
  return v.value.moves === 0 && first?.by === null && first.bumped.includes(props.you)
    ? 'Someone earlier picked your spot, so you start nearby. '
    : ''
})
const waitLine = computed(() => {
  if (myTurn.value) return ''
  const who = v.value.turn
  return who ? `Waiting for ${nameOf(who)}. Line up your next piece.` : ''
})

// ---- Picking a start, all at once and in secret ----
const wall = computed(() => wallSpots(v.value.size).map((spot, index) => ({ spot, index })))
const picking = computed(() => v.value.phase === 'start' && !!me.value && me.value.lit)
const startChoice = ref<number | null>(null)
watch(
  () => [v.value.phase, v.value.size] as const,
  () => {
    if (v.value.phase !== 'start') return
    const count = wall.value.length
    const seat = me.value?.seat ?? 1
    startChoice.value = v.value.pick ?? Math.floor(((seat - 1) * count) / Math.max(1, v.value.drifters.length))
  },
  { immediate: true },
)
const startSpot = computed(() => (startChoice.value === null ? null : (wall.value[startChoice.value]?.spot ?? null)))
const pickedSpot = computed(() => (v.value.pick === null ? null : (wall.value[v.value.pick]?.spot ?? null)))
const stillPicking = computed(() => v.value.drifters.filter((d) => d.lit && !d.picked).length)
function stepStart(by: number) {
  const count = wall.value.length
  startChoice.value = (((startChoice.value ?? 0) + by) % count + count) % count
}
function tapBoard(event: MouseEvent) {
  if (!picking.value) return
  const svg = event.currentTarget as SVGSVGElement
  const box = svg.getBoundingClientRect()
  const x = ((event.clientX - box.left) / box.width) * span.value
  const y = ((event.clientY - box.top) / box.height) * span.value
  let best: number | null = null
  let bestDistance = Infinity
  for (const s of wall.value) {
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
  if (picking.value && startChoice.value !== null && startChoice.value !== v.value.pick) {
    emit('move', { type: 'start', spot: startChoice.value })
  }
}
const startButton = computed(() =>
  v.value.pick === null ? 'Pick this spot' : startChoice.value === v.value.pick ? 'Picked' : 'Change to this spot',
)

// ---- Keys: , and . turn, Space or Enter places, 1 to 3 pick a piece ----
function onKey(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat && (event.key === ' ' || event.key === 'Enter')) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  if (document.querySelector('dialog[open]')) return
  const confirm = event.key === ' ' || event.key === 'Enter'
  // Leave Space and Enter alone on buttons outside the game, like Leave or End game.
  if (confirm && target?.closest('button, a') && !target.closest('.dl')) return
  let handled = true
  if (v.value.phase === 'play' && hand.value.length > 0) {
    if (event.key === ',') rotate(-1)
    else if (event.key === '.') rotate(1)
    else if (confirm) placePiece()
    else if (['1', '2', '3'].includes(event.key) && hand.value[Number(event.key) - 1]) {
      const id = hand.value[Number(event.key) - 1]!.id
      if (selected.value !== id) pick(id)
    } else handled = false
  } else if (picking.value) {
    if (event.key === ',') stepStart(-1)
    else if (event.key === '.') stepStart(1)
    else if (confirm) sendStart()
    else handled = false
  } else handled = false
  if (handled) event.preventDefault()
}

// ---- What's going on ----
const facing = computed(() => {
  if (v.value.phase !== 'play' || !v.value.turn) return null
  const spot = v.value.drifters.find((d) => d.id === v.value.turn)?.spot
  return spot ? squareXY(spot.r * v.value.size + spot.c) : null
})
const whyText: Record<OutReason, string> = { wall: 'hit the wall', crash: 'crashed', left: 'left' }
const statusLine = computed(() => {
  if (v.value.phase === 'over') return 'Game over'
  if (v.value.phase === 'start') return `Picking starting spots · ${stillPicking.value} still picking`
  const who = v.value.turn
  if (!who) return ''
  return `${myTurn.value ? 'Your turn' : `${nameOf(who)}’s turn`} · ${litCount.value} lit`
})
const litCount = computed(() => v.value.drifters.filter((d) => d.lit).length)
const roster = computed(() =>
  [...v.value.drifters].sort(
    (a, b) => Number(b.lit) - Number(a.lit) || (b.out?.move ?? 0) - (a.out?.move ?? 0) || a.seat - b.seat,
  ),
)
const rosterNote = (d: DrifterView) => {
  if (v.value.phase === 'start' && d.lit) return d.picked ? 'picked' : 'picking'
  if (d.lit) return d.id === v.value.turn ? 'playing' : ''
  return d.out ? whyText[d.out.why] : 'out'
}
const hurry = computed(
  () =>
    secondsLeft.value !== null &&
    secondsLeft.value <= 5 &&
    (myTurn.value || (v.value.phase === 'start' && picking.value && v.value.pick === null)),
)
const skipLabel = computed(() =>
  v.value.phase === 'start' ? 'Hand out spots now' : `Play for ${v.value.turn ? nameOf(v.value.turn) : 'them'}`,
)
</script>

<template>
  <div class="dl" :class="{ animate }">
    <div class="main">
      <header class="top">
        <p class="eyebrow">{{ statusLine }}</p>
        <p v-if="secondsLeft !== null && v.phase !== 'over'" class="clock" :class="{ hurry }">{{ secondsLeft }}s</p>
      </header>
      <div class="timebar" :class="{ hidden: v.turnEndsAt === null || v.phase === 'over' }" aria-hidden="true">
        <span :style="{ transform: `scaleX(${timeShare})` }" />
      </div>

      <svg
        class="board"
        :class="{ picking }"
        :viewBox="`0 0 ${span} ${span}`"
        role="img"
        :aria-label="`Canal board, ${v.size} by ${v.size}`"
        @click="tapBoard"
      >
        <g ref="measure" class="measure" />
        <rect :x="PAD - 10" :y="PAD - 10" :width="v.size * SQUARE + 20" :height="v.size * SQUARE + 20" rx="16" class="wall" />
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
        <g v-for="cell in placed" :key="`p${cell.sq}`" class="placed" :class="{ newest: newestSq === cell.sq }">
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
            :style="{ stroke: t.color, ...(s.fresh ? freshStyle(t.id, s.i) : {}) }"
            pathLength="1"
          />
        </g>

        <g v-if="ghost" class="ghost">
          <rect :x="ghost.x + 2" :y="ghost.y + 2" :width="SQUARE - 4" :height="SQUARE - 4" rx="8" class="face" />
          <path v-for="c in ghost.paths" :key="c.key" :d="c.d" class="water" />
          <g v-for="o in ghost.others" :key="`go${o.id}`">
            <path
              v-for="(d, i) in o.trail"
              :key="i"
              :d="d"
              class="ghost-trail other"
              :class="{ bad: o.out }"
              :style="{ stroke: o.out ? undefined : o.color }"
            />
          </g>
          <path
            v-for="(d, i) in ghost.trail"
            :key="`gt${i}`"
            :d="d"
            class="ghost-trail"
            :class="{ bad: ghost.out }"
            :style="{ stroke: ghost.out || !me ? undefined : colorOf(me) }"
          />
        </g>

        <g v-if="picking">
          <circle
            v-for="s in wall"
            :key="`f${s.index}`"
            :cx="spotXY(s.spot)[0]"
            :cy="spotXY(s.spot)[1]"
            r="6"
            class="free"
          />
          <circle
            v-if="pickedSpot"
            :cx="spotXY(pickedSpot)[0]"
            :cy="spotXY(pickedSpot)[1]"
            :r="lanternSize + 6"
            class="locked"
            :style="{ stroke: me ? colorOf(me) : undefined }"
          />
          <circle
            v-if="startSpot"
            :cx="spotXY(startSpot)[0]"
            :cy="spotXY(startSpot)[1]"
            :r="lanternSize"
            class="chosen"
            :style="{ fill: me ? colorOf(me) : undefined }"
          />
        </g>

        <g
          v-for="l in lanterns"
          :key="`l${l.d.id}`"
          class="lantern"
          :class="{ out: !l.glowing, mine: l.d.id === you, current: l.d.id === v.turn }"
          :transform="`translate(${l.at[0]} ${l.at[1]})`"
        >
          <circle v-if="l.glowing" :r="lanternSize * 1.7" class="halo" :style="{ fill: colorOf(l.d) }" />
          <circle
            :r="lanternSize"
            class="body"
            :style="{ fill: l.glowing ? colorOf(l.d) : 'none', stroke: colorOf(l.d) }"
          />
          <text
            :y="lanternSize * 0.36"
            class="seat"
            :style="{
              fill: l.glowing ? swatchOf(l.d).text : colorOf(l.d),
              fontSize: `${lanternSize * (l.d.seat >= 10 ? 0.85 : 1.05)}px`,
            }"
          >
            {{ l.d.seat }}
          </text>
        </g>
      </svg>
    </div>

    <div class="side">
      <!-- Your pieces stay put between turns, so you can line up your next move. -->
      <section v-if="v.phase === 'play' && hand.length" class="panel controls">
        <p class="label">{{ myTurn ? 'Your turn. Pick a piece and turn it.' : 'Your pieces' }}</p>
        <div class="hand">
          <button
            v-for="(p, i) in hand"
            :key="p.id"
            class="piece-button"
            :class="{ chosen: p.id === selected, risky: !isSafe(p.id) }"
            :aria-pressed="p.id === selected"
            :aria-label="`Piece ${i + 1}${p.id === selected ? ', picked' : ''}${noSafeTurn(p.id) ? ', no safe turn' : ''}`"
            @click="pick(p.id)"
          >
            <PieceArt :pattern="p.pattern" :turns="turnsFor(p.id)" />
            <span v-if="noSafeTurn(p.id)" class="badge">No safe turn</span>
          </button>
        </div>
        <div class="row actions">
          <button aria-label="Turn left" title="Turn left (,)" @click="rotate(-1)">⟲</button>
          <button aria-label="Turn right" title="Turn right (.)" @click="rotate(1)">⟳</button>
          <button class="primary place" :disabled="!canPlace" @click="placePiece">Place</button>
        </div>
        <p class="ghost-line" :class="{ warn: myTurn && ghost?.out }" role="status">
          {{ bumpedLine }}
          <template v-if="myTurn">
            {{ ghostLine }}
            <template v-if="blocked"> Try another piece or turn it.</template>
            <template v-else-if="ghost?.out"> Every move does, so you can play it.</template>
          </template>
          <template v-else>{{ waitLine }}</template>
        </p>
        <p class="keys muted">Keys: <kbd>,</kbd> <kbd>.</kbd> turn · <kbd>Space</kbd> or <kbd>Enter</kbd> places · <kbd>1</kbd>–<kbd>3</kbd> pick</p>
      </section>

      <section v-else-if="picking" class="panel controls">
        <p class="label">Pick where your lantern starts.</p>
        <p class="small muted">
          Tap the wall or step along it. Picks are secret. If someone earlier in turn order picks the same spot, you
          start at the nearest free one.
        </p>
        <div class="row actions">
          <button aria-label="Previous spot" title="Previous spot (,)" @click="stepStart(-1)">◀</button>
          <button aria-label="Next spot" title="Next spot (.)" @click="stepStart(1)">▶</button>
          <button class="primary" :disabled="startChoice === null || startChoice === v.pick" @click="sendStart">
            {{ startButton }}
          </button>
        </div>
        <p class="ghost-line" role="status">
          {{ v.pick === null ? '' : `Waiting for ${stillPicking} more to pick. You can still change.` }}
        </p>
        <p class="keys muted">Keys: <kbd>,</kbd> <kbd>.</kbd> step · <kbd>Space</kbd> or <kbd>Enter</kbd> picks</p>
      </section>

      <section v-else-if="v.phase !== 'over'" class="panel controls quiet">
        <p class="muted">
          {{
            me && !me.lit
              ? 'Your lantern is out. Watch the rest drift.'
              : v.phase === 'start' && me
                ? 'Waiting for everyone to pick.'
                : 'You’re watching this game.'
          }}
        </p>
      </section>

      <section class="panel roster">
        <ul>
          <li v-for="d in roster" :key="d.id" :class="{ out: !d.lit, current: d.id === v.turn }">
            <span
              class="seat-badge"
              :style="{
                background: d.lit ? colorOf(d) : 'transparent',
                borderColor: colorOf(d),
                color: d.lit ? swatchOf(d).text : colorOf(d),
              }"
              >{{ d.seat }}</span
            >
            <span class="name">{{ youOr(d.id) }}</span>
            <span class="muted small">{{ rosterNote(d) }}</span>
          </li>
        </ul>
        <button
          v-if="isHost && v.phase !== 'over' && (v.phase === 'start' || !myTurn)"
          class="skip"
          @click="emit('move', { type: 'skip' })"
        >
          {{ skipLabel }}
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dl {
  --dl-canal: color-mix(in srgb, var(--ink) 7%, var(--paper));
  --dl-wall: color-mix(in srgb, var(--ink) 42%, var(--paper));
  --dl-piece: var(--surface);
  --dl-edge: var(--line);
  --dl-water: color-mix(in srgb, var(--muted) 45%, var(--surface));
  display: grid;
  gap: 0.75rem;
  max-width: 36rem;
  margin: 0 auto;
}

:global(:root[data-theme='dark']) .dl {
  --dl-wall: color-mix(in srgb, var(--ink) 26%, var(--paper));
}

.main,
.side {
  display: grid;
  gap: 0.75rem;
  align-content: start;
  min-width: 0;
}

@media (min-width: 60rem) {
  .dl {
    grid-template-columns: minmax(0, 1fr) 19rem;
    align-items: start;
    max-width: 60rem;
  }
}

.top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 1.5rem;
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

.timebar.hidden {
  visibility: hidden;
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

.measure {
  visibility: hidden;
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
  animation: draw linear forwards;
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

.ghost-trail.other {
  stroke-width: 6;
  stroke-dasharray: 8 10;
}

.ghost-trail.bad {
  stroke: var(--accent);
}

.free {
  fill: var(--muted);
  opacity: 0.6;
}

.chosen {
  stroke: var(--ink);
  stroke-width: 4;
}

.locked {
  fill: none;
  stroke-width: 4;
  stroke-dasharray: 6 5;
}

.lantern {
  pointer-events: none;
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

.seat {
  font-weight: 800;
  text-anchor: middle;
}

.controls {
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
}

.controls.quiet {
  padding: 0.75rem 1rem;
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
  position: relative;
  padding: 0.35rem;
  border-width: 2px;
}

.piece-button.chosen {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.piece-button.risky :deep(svg) {
  opacity: 0.55;
}

.badge {
  position: absolute;
  right: 0.2rem;
  bottom: 0.2rem;
  left: 0.2rem;
  padding: 0.05rem 0.2rem;
  border-radius: 0.3rem;
  background: var(--ink);
  color: var(--paper);
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.3;
}

.actions button:not(.primary) {
  min-width: 3rem;
  font-size: 1.1rem;
}

.ghost-line {
  min-height: 3em;
  font-size: 0.95rem;
}

.ghost-line.warn {
  color: var(--accent);
}

.keys {
  font-size: 0.8rem;
}

@media (hover: none) {
  .keys {
    display: none;
  }
}

kbd {
  padding: 0 0.3rem;
  border: 1px solid var(--line);
  border-radius: 0.25rem;
  background: var(--paper);
  font: inherit;
  font-size: 0.75rem;
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

.seat-badge {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 800;
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
