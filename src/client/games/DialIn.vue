<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  DIAL_MAX,
  MAX_CLUE_LENGTH,
  SCORE_BANDS,
  TEAM_NAMES,
  pointsFor,
  type DialInMove,
  type DialInView,
  type Side,
} from '../../games/dial-in/logic'
import type { PublicPlayer } from '../../shared/protocol'

const props = defineProps<{
  view: DialInView
  you: string
  players: PublicPlayer[]
}>()

const emit = defineEmits<{ move: [move: DialInMove] }>()

const nameOf = (id: string) => props.players.find((player) => player.id === id)?.name ?? 'Someone'

const isTeams = computed(() => props.view.mode === 'teams')
const isPsychic = computed(() => props.view.psychicId === props.you)
const isGuesser = computed(() => props.view.guesserIds.includes(props.you))
const isSideGuesser = computed(() => props.view.sideTeamIds.includes(props.you))
const activeTeamName = computed(() => TEAM_NAMES[props.view.activeTeam])
const yourTeam = computed(() => props.view.teams.findIndex((team) => team.includes(props.you)))
const lastRecord = computed(() => props.view.history.at(-1))

const isGameOver = computed(() => {
  const { phase, mode, scores, targetScore, round, totalRounds } = props.view
  if (phase !== 'reveal') return false
  if (mode === 'coop') return round >= totalRounds
  const top = Math.max(...scores)
  return top >= targetScore && scores.filter((score) => score === top).length === 1
})

// --- The dial picture

const CX = 200
const CY = 200
const R = 175

/** A point on the dial for a position from 0 (left) to DIAL_MAX (right). */
function point(position: number, radius = R) {
  const angle = (Math.PI * position) / DIAL_MAX
  return { x: CX - radius * Math.cos(angle), y: CY - radius * Math.sin(angle) }
}

function wedge(from: number, to: number) {
  const start = point(Math.max(0, from))
  const end = point(Math.min(DIAL_MAX, to))
  if (Math.min(DIAL_MAX, to) <= Math.max(0, from)) return ''
  return `M ${CX} ${CY} L ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y} Z`
}

/** The scoring bands around the target, outermost first so the bullseye draws on top. */
const bands = computed(() => {
  const target = props.view.target
  if (target === null) return []
  return [...SCORE_BANDS].reverse().map((band) => ({
    points: band.points,
    path: wedge(target - band.within, target + band.within),
    label: point(target, R - 22),
  }))
})

// The dial moves instantly for whoever is dragging it, and is sent along a few times a second.
const localDial = ref(props.view.dial)
const dragging = ref(false)
const svg = ref<SVGSVGElement | null>(null)
let sendTimer: ReturnType<typeof setTimeout> | undefined
let lastSent = props.view.dial

watch(
  () => props.view.dial,
  (dial) => {
    if (!dragging.value) localDial.value = dial
  },
)

const shownDial = computed(() => (isGuesser.value ? localDial.value : props.view.dial))
const needle = computed(() => point(shownDial.value, R - 8))
const canTurn = computed(() => isGuesser.value && props.view.phase === 'guess')

function sendDial(force = false) {
  const value = Math.round(localDial.value)
  if (value === lastSent && !force) return
  lastSent = value
  emit('move', { type: 'dial', value })
}

function scheduleSend() {
  if (sendTimer) return
  sendTimer = setTimeout(() => {
    sendTimer = undefined
    sendDial()
  }, 150)
}

function positionFromPointer(event: PointerEvent) {
  const box = svg.value
  const matrix = box?.getScreenCTM()
  if (!box || !matrix) return null
  const at = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  const dx = at.x - CX
  const dy = Math.max(0, CY - at.y)
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI
  return Math.min(DIAL_MAX, Math.max(0, DIAL_MAX - degrees))
}

function onPointerDown(event: PointerEvent) {
  if (!canTurn.value) return
  dragging.value = true
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  onPointerMove(event)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  const position = positionFromPointer(event)
  if (position === null) return
  localDial.value = position
  scheduleSend()
}

function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  clearTimeout(sendTimer)
  sendTimer = undefined
  sendDial()
}

function nudge(amount: number) {
  if (!canTurn.value) return
  localDial.value = Math.min(DIAL_MAX, Math.max(0, Math.round(localDial.value) + amount))
  sendDial()
}

onBeforeUnmount(() => clearTimeout(sendTimer))

// --- Clue and ready controls

const clueText = ref('')
const youAreReady = computed(() => props.view.ready.includes(props.you))
const youAreSideReady = computed(() => props.view.sideReady.includes(props.you))

function submitClue() {
  if (clueText.value.trim()) emit('move', { type: 'clue', text: clueText.value })
}

function chooseSide(side: Side) {
  emit('move', { type: 'side', side: props.view.side === side ? null : side })
}

watch(
  () => props.view.round,
  () => {
    clueText.value = ''
    localDial.value = props.view.dial
    lastSent = props.view.dial
  },
)

const status = computed(() => {
  const { phase } = props.view
  const psychic = nameOf(props.view.psychicId)
  const team = isTeams.value ? `Team ${activeTeamName.value}` : 'Your team'
  if (phase === 'clue') {
    return isPsychic.value ? 'You’re the Psychic: give a clue for the target' : `${psychic} is thinking of a clue`
  }
  if (phase === 'guess') {
    if (isGuesser.value) return 'Turn the dial to where you think the target is'
    if (isPsychic.value) return 'Your team is turning the dial. No hints!'
    return `${team} is turning the dial`
  }
  if (phase === 'side') {
    return isSideGuesser.value
      ? 'Is the target to the left or right of their dial?'
      : `Team ${TEAM_NAMES[1 - props.view.activeTeam]} is guessing left or right`
  }
  const record = lastRecord.value
  if (!record) return ''
  const sideNote = record.sidePoint ? ` Team ${TEAM_NAMES[1 - record.team]} got the left/right point.` : ''
  return `${record.points} point${record.points === 1 ? '' : 's'} for ${isTeams.value ? `Team ${TEAM_NAMES[record.team]}` : 'the team'}.${sideNote}`
})

const previewPoints = computed(() =>
  props.view.target === null ? null : pointsFor(Math.round(shownDial.value), props.view.target),
)
</script>

<template>
  <div class="dial-in">
    <header class="round-bar">
      <div>
        <p class="eyebrow">
          Round {{ view.round }}<template v-if="!isTeams"> of {{ view.totalRounds }}</template> ·
          {{ nameOf(view.psychicId) }} is the Psychic
          <template v-if="isTeams"> for Team {{ activeTeamName }}</template>
        </p>
        <p class="status" aria-live="polite">{{ status }}</p>
      </div>
      <div v-if="isTeams" class="scoreboard" aria-label="Scores">
        <span v-for="(name, team) in TEAM_NAMES" :key="name" class="team-score" :class="[`team-${team}`, { active: view.activeTeam === team }]">
          {{ name }} <strong>{{ view.scores[team] }}</strong>
        </span>
        <span class="muted">first to {{ view.targetScore }}</span>
      </div>
      <p v-else class="team-score">
        Team score <strong>{{ view.scores[0] }}</strong>
      </p>
    </header>

    <div class="dial-area">
      <div class="spectrum">
        <span class="end left">← {{ view.spectrum[0] }}</span>
        <span class="end right">{{ view.spectrum[1] }} →</span>
      </div>

      <svg
        ref="svg"
        class="dial"
        :class="{ turnable: canTurn }"
        viewBox="0 0 400 215"
        role="slider"
        :aria-label="`Dial between ${view.spectrum[0]} and ${view.spectrum[1]}`"
        :aria-valuemin="0"
        :aria-valuemax="DIAL_MAX"
        :aria-valuenow="Math.round(shownDial)"
        :aria-readonly="!canTurn"
        :tabindex="canTurn ? 0 : -1"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown.left.prevent="nudge(-2)"
        @keydown.right.prevent="nudge(2)"
      >
        <defs>
          <linearGradient id="dial-face" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stop-color="#3d5a80" />
            <stop offset="50%" stop-color="#e8e1d1" />
            <stop offset="100%" stop-color="#c8401f" />
          </linearGradient>
        </defs>
        <path :d="wedge(0, DIAL_MAX)" fill="url(#dial-face)" stroke="#222" stroke-width="2" />
        <g v-for="band in bands" :key="band.points">
          <path :d="band.path" :class="`band band-${band.points}`" />
        </g>
        <text
          v-if="bands.length"
          :x="bands[0]!.label.x"
          :y="bands[0]!.label.y"
          class="band-label"
          text-anchor="middle"
        >
          4
        </text>
        <line :x1="CX" :y1="CY" :x2="needle.x" :y2="needle.y" class="needle" />
        <circle :cx="CX" :cy="CY" r="12" class="hub" />
      </svg>

      <p v-if="isPsychic && view.phase !== 'reveal'" class="muted secret-note">
        Only you can see the target.
        <template v-if="view.phase !== 'clue' && previewPoints !== null">The dial is worth {{ previewPoints }} right now.</template>
      </p>
      <p v-if="view.clue" class="clue">
        <span class="eyebrow">Clue</span>
        <strong>{{ view.clue }}</strong>
      </p>
    </div>

    <!-- Psychic gives a clue -->
    <form v-if="view.phase === 'clue' && isPsychic" class="controls" @submit.prevent="submitClue">
      <input
        v-model="clueText"
        class="grow"
        :maxlength="MAX_CLUE_LENGTH"
        aria-label="Your clue"
        placeholder="A word or phrase that fits the target"
      />
      <button class="primary" type="submit" :disabled="!clueText.trim()">Give clue</button>
      <button type="button" @click="emit('move', { type: 'redraw' })">Different card</button>
    </form>

    <!-- Team turns the dial -->
    <div v-if="view.phase === 'guess' && isGuesser" class="controls">
      <button aria-label="Turn left" @click="nudge(-2)">◀</button>
      <button aria-label="Turn right" @click="nudge(2)">▶</button>
      <button
        :class="{ primary: !youAreReady }"
        @click="emit('move', { type: 'ready', ready: !youAreReady })"
      >
        {{ youAreReady ? 'Not ready' : 'Lock in' }}
      </button>
      <span class="muted">{{ view.ready.length }} of {{ view.guesserIds.length }} ready · moving the dial un-readies everyone</span>
    </div>

    <!-- Other team guesses left or right -->
    <div v-if="view.phase === 'side' && isSideGuesser" class="controls">
      <button :class="{ primary: view.side === 'left' }" :aria-pressed="view.side === 'left'" @click="chooseSide('left')">
        ← Left
      </button>
      <button :class="{ primary: view.side === 'right' }" :aria-pressed="view.side === 'right'" @click="chooseSide('right')">
        Right →
      </button>
      <button
        :disabled="!view.side"
        @click="emit('move', { type: 'sideReady', ready: !youAreSideReady })"
      >
        {{ youAreSideReady ? 'Not ready' : 'Lock in' }}
      </button>
      <span class="muted">{{ view.sideReady.length }} of {{ view.sideTeamIds.length }} ready</span>
    </div>
    <p v-if="view.phase === 'side' && !isSideGuesser" class="muted">
      They’re guessing:
      <strong>{{ view.side ? (view.side === 'left' ? 'left' : 'right') : 'not decided yet' }}</strong>
    </p>

    <div v-if="view.phase === 'reveal' && !isGameOver" class="controls">
      <button class="primary" @click="emit('move', { type: 'nextRound', round: view.round })">Next round</button>
    </div>

    <section class="lower">
      <div v-if="isTeams" class="teams">
        <div v-for="(team, index) in view.teams" :key="index" class="team-list" :class="`team-${index}`">
          <h2>Team {{ TEAM_NAMES[index] }}<template v-if="yourTeam === index"> (you)</template></h2>
          <ul>
            <li v-for="id in team" :key="id">
              {{ nameOf(id) }}
              <span v-if="id === view.psychicId" class="tag">Psychic</span>
            </li>
          </ul>
        </div>
      </div>

      <div v-if="view.history.length" class="history">
        <h2>Rounds so far</h2>
        <ol>
          <li v-for="(record, index) in [...view.history].reverse()" :key="index">
            <span>
              {{ nameOf(record.psychicId) }}: “{{ record.clue }}”
              <span class="muted">({{ record.spectrum[0] }} ↔ {{ record.spectrum[1] }})</span>
            </span>
            <strong>
              +{{ record.points }}<template v-if="record.sidePoint"> · +1 {{ TEAM_NAMES[1 - record.team] }}</template>
            </strong>
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dial-in {
  display: grid;
  gap: 1rem;
  width: 100%;
  min-width: 0;
}

.round-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.5rem 1.5rem;
}

.status {
  font-size: 1.2rem;
  font-weight: 700;
}

.scoreboard {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.team-score {
  padding: 0.2rem 0.7rem;
  border: 2px solid transparent;
  border-radius: 999px;
}

.team-score strong {
  font-size: 1.25rem;
}

.team-score.active {
  border-color: var(--ink);
}

.team-0 {
  --team: #e4572e;
}

.team-1 {
  --team: #1b998b;
}

.scoreboard .team-score {
  background: color-mix(in srgb, var(--team) 22%, transparent);
}

.dial-area {
  display: grid;
  gap: 0.5rem;
  justify-items: center;
  width: 100%;
}

.spectrum {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  width: min(100%, 36rem);
  font-weight: 800;
}

.end.left {
  color: #3d5a80;
}

.end.right {
  color: #c8401f;
  text-align: right;
}

.dial {
  width: min(100%, 36rem);
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

.band-label {
  fill: #fff;
  font-size: 16px;
  font-weight: 800;
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

.secret-note {
  font-size: 0.9rem;
}

.clue {
  display: grid;
  justify-items: center;
  text-align: center;
}

.clue strong {
  font-size: 1.5rem;
  overflow-wrap: anywhere;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: var(--radius);
  background: var(--accent-soft);
}

.grow {
  flex: 1 1 14rem;
  min-width: 0;
}

.lower {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
}

.teams {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.team-list {
  padding: 0.6rem 0.8rem;
  border-left: 4px solid var(--team);
}

.team-list ul,
.history ol {
  display: grid;
  gap: 0.3rem;
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
}

.history li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.tag {
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--accent-soft);
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
