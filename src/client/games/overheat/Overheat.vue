<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  type Card,
  type OverheatMove,
  type OverheatView,
  type RaceEvent,
} from '../../../games/overheat/logic'
import { cornersOf, getTrack } from '../../../games/overheat/tracks'
import { canAnimate } from '../../motion'
import type { PublicPlayer } from '../../../shared/protocol'
import CardStack from './CardStack.vue'
import GearShifter from './GearShifter.vue'
import RaceCard from './RaceCard.vue'
import TrackView, { type TrackCar } from './TrackView.vue'
import TurnSteps from './TurnSteps.vue'

const props = defineProps<{
  view: OverheatView
  you: string
  players: PublicPlayer[]
}>()

const emit = defineEmits<{ move: [move: OverheatMove] }>()

const nameOf = (id: string) => props.players.find((player) => player.id === id)?.name ?? 'Someone'
function ordinal(n: number) {
  const teen = n % 100 >= 11 && n % 100 <= 13
  return `${n}${teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

const track = computed(() => getTrack(props.view.trackId))
const corners = computed(() => cornersOf(props.view.trackId))
const finishPos = computed(() => props.view.laps * props.view.spaces)
const me = computed(() => props.view.cars.find((car) => car.id === props.you) ?? null)
const hand = computed(() => props.view.you?.hand ?? [])
const lapOf = (pos: number) => Math.min(props.view.laps, Math.max(1, Math.floor(pos / props.view.spaces) + 1))

const currentId = computed(() => props.view.current?.id ?? null)
const yourStep = computed(() => (currentId.value === props.you ? props.view.current!.step : null))

// ---- Track ----

const follow = ref(typeof window !== 'undefined' && window.innerWidth < 700)
const trackCars = computed<TrackCar[]>(() =>
  props.view.cars
    .filter((car) => car.place === null)
    .map((car) => ({
      id: car.id,
      name: nameOf(car.id),
      color: car.color,
      pos: car.pos,
      spot: car.spot,
      isYou: car.id === props.you,
    })),
)

// ---- Standings ----

const standings = computed(() =>
  [...props.view.cars].sort((a, b) => {
    if (a.place !== null || b.place !== null) return (a.place ?? 99) - (b.place ?? 99)
    return b.pos - a.pos || a.spot - b.spot
  }),
)

// ---- Planning ----

const gear = ref(1)
const picked = ref<number[]>([])
const discardPicked = ref<number[]>([])

watch(
  // Separate sources, so only a new round or a gear change resets your picks. A getter
  // returning a fresh array would count every server update as a change.
  [() => props.view.round, () => me.value?.gear],
  () => {
    gear.value = me.value?.gear ?? 1
    picked.value = []
    discardPicked.value = []
  },
  { immediate: true },
)

const playable = computed(() => hand.value.filter((card) => card.kind !== 'heat'))
const needed = computed(() => Math.min(gear.value, playable.value.length))
const clogged = computed(() => playable.value.length < gear.value)
const canPlan = computed(
  () => props.view.phase === 'plan' && !!me.value && me.value.place === null && !props.view.you?.plan,
)

function chooseGear(target: number) {
  gear.value = target
  picked.value = picked.value.slice(0, needed.value)
}

function toggleCard(card: Card) {
  if (canPlan.value) {
    if (card.kind === 'heat') return
    const i = picked.value.indexOf(card.id)
    if (i !== -1) picked.value.splice(i, 1)
    else if (picked.value.length < needed.value) picked.value.push(card.id)
    else if (needed.value === 1) picked.value = [card.id]
    return
  }
  if (me.value?.needsDiscard && (card.kind === 'speed' || card.kind === 'upgrade')) {
    const i = discardPicked.value.indexOf(card.id)
    if (i !== -1) discardPicked.value.splice(i, 1)
    else discardPicked.value.push(card.id)
  }
}

const preview = computed(() => {
  const cards = picked.value.map((id) => hand.value.find((card) => card.id === id)).filter(Boolean) as Card[]
  const total = cards.reduce((sum, card) => sum + card.value, 0)
  const stress = cards.filter((card) => card.kind === 'stress').length
  return stress ? `${total} + ${stress} × ?` : `${total}`
})

function lockIn() {
  emit('move', { type: 'plan', gear: gear.value, cards: [...picked.value] })
}

// ---- Dealing ----

const deckPile = ref<InstanceType<typeof CardStack> | null>(null)
const handRow = ref<HTMLElement | null>(null)

/** New cards fly in from the deck face down and turn over as they land. */
watch(
  () => hand.value.map((card) => card.id),
  async (ids, old) => {
    if (!old || !canAnimate()) return
    const added = new Set(ids.filter((id) => !old.includes(id)))
    if (added.size === 0) return
    await nextTick()
    const deck = (deckPile.value?.$el as HTMLElement | undefined)?.getBoundingClientRect()
    const cards = [...(handRow.value?.querySelectorAll<HTMLElement>('[data-card-id]') ?? [])].filter((el) =>
      added.has(Number(el.dataset.cardId)),
    )
    cards.forEach((el, index) => {
      const box = el.getBoundingClientRect()
      const dx = deck ? deck.left + deck.width / 2 - (box.left + box.width / 2) : 0
      const dy = deck ? deck.top + deck.height / 2 - (box.top + box.height / 2) : -20
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) perspective(500px) rotateY(180deg) scale(0.75)` },
          { transform: 'translate(0, 0) perspective(500px) rotateY(0) scale(1)' },
        ],
        { duration: 560, delay: index * 110, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' },
      )
    })
  },
)

const sortedHand = computed(() => {
  const rank = { speed: 0, upgrade: 1, stress: 2, heat: 3 }
  return [...hand.value].sort((a, b) => rank[a.kind] - rank[b.kind] || a.value - b.value)
})

// ---- Corners ----

/** Corner lines ahead of a position, with how far away they are. */
function cornersAhead(pos: number, within: number) {
  const out: { distance: number; limit: number; space: number }[] = []
  for (let d = 1; d <= within && pos + d < finishPos.value; d++) {
    const space = (((pos + d) % props.view.spaces) + props.view.spaces) % props.view.spaces
    const corner = corners.value.find((c) => c.space === space)
    if (corner) out.push({ distance: d, limit: corner.limit, space })
  }
  return out
}

const upcoming = computed(() =>
  me.value && me.value.place === null ? cornersAhead(me.value.pos, props.view.spaces).slice(0, 2) : [],
)

/** The Heat this turn's corners will cost at the current speed. */
const cornerCost = computed(() => {
  const car = me.value
  if (!car || car.startPos === null || car.speed === null) return null
  const crossed = cornersAhead(car.startPos, car.pos - car.startPos)
  if (!crossed.length) return null
  const cost = crossed.reduce((sum, corner) => sum + Math.max(0, car.speed! - corner.limit), 0)
  return { crossed, cost, spin: cost > car.engine }
})

const stepDriver = computed(() => {
  const car = props.view.cars.find((c) => c.id === currentId.value)
  return car ? { name: car.id === props.you ? 'You' : nameOf(car.id), color: car.color } : null
})

// ---- Status ----

const status = computed(() => {
  const view = props.view
  if (view.phase === 'over') return 'The race is over.'
  if (me.value?.place) return `You finished ${ordinal(me.value.place)}! Watching the rest of the race.`
  if (view.phase === 'plan') {
    if (!me.value) return 'Drivers are choosing their gears.'
    if (view.you?.plan) {
      const waiting = view.cars.filter((car) => car.place === null && !car.planned).map((car) => nameOf(car.id))
      return `Locked in. Waiting for ${waiting.join(', ')}.`
    }
    return 'Pick a gear, then that many cards.'
  }
  if (yourStep.value === 'react') return 'Your car moved. Boost, or carry on.'
  if (yourStep.value === 'slipstream') return 'You’re right behind a car. Take the slipstream?'
  if (me.value?.needsDiscard) return 'Discard any cards you don’t want, then draw back up to 7.'
  if (currentId.value) return `${nameOf(currentId.value)} is driving…`
  return 'Waiting for drivers to discard…'
})

// ---- Race news ----

function describe(event: RaceEvent) {
  const who = event.playerId === props.you ? 'You' : nameOf(event.playerId)
  switch (event.kind) {
    case 'move':
      return `${who} moved ${event.value}.`
    case 'clog':
      return `${who} stalled with a hand full of Heat.`
    case 'boost':
      return `${who} boosted +${event.value}.`
    case 'adrenaline':
      return `${who} used Adrenaline for +1.`
    case 'cooldown':
      return `${who} cooled down ${event.value} Heat.`
    case 'slipstream':
      return `${who} slipstreamed +2.`
    case 'corner':
      return `${who} paid ${event.value} Heat at a ${event.limit} corner.`
    case 'spin':
      return `${who} spun out at a ${event.limit} corner!`
    case 'finish':
      return `${who} finished ${ordinal(event.value ?? 0)}!`
  }
}

const news = computed(() => [...props.view.events].reverse().slice(0, 8))

const flash = ref<RaceEvent | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined
let lastSeq = props.view.events.at(-1)?.seq ?? 0
watch(
  () => props.view.events,
  (events) => {
    const fresh = events.filter((event) => event.seq > lastSeq)
    lastSeq = events.at(-1)?.seq ?? lastSeq
    const big = fresh.filter((event) => event.kind === 'spin' || event.kind === 'finish').at(-1)
    if (!big) return
    flash.value = big
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (flash.value = null), 2600)
  },
)
</script>

<template>
  <div class="overheat">
    <div class="topline">
      <p class="eyebrow">
        {{ track.name }} · Round {{ view.round }}
        <template v-if="me && me.place === null"> · Lap {{ lapOf(me.pos) }} of {{ view.laps }}</template>
      </p>
      <button v-if="me && me.place === null" class="small" @click="follow = !follow">
        {{ follow ? 'Show whole track' : 'Follow my car' }}
      </button>
    </div>

    <div class="stage">
      <TrackView
        :track-id="view.trackId"
        :cars="trackCars"
        :follow-id="follow ? you : null"
        :highlight-id="currentId"
        :next-corner="upcoming[0] ?? null"
      />
      <Transition name="flash">
        <p v-if="flash" :key="flash.seq" class="flash" :class="flash.kind">{{ describe(flash) }}</p>
      </Transition>
    </div>

    <TurnSteps
      :phase="view.phase"
      :step="view.current?.step ?? null"
      :driver="stepDriver"
      :you-discarding="!!me?.needsDiscard && currentId !== you"
    />

    <p class="status" aria-live="polite">{{ status }}</p>

    <div class="panels">
      <section v-if="me && view.you && me.place === null" class="cockpit">
        <GearShifter
          :gear="canPlan ? gear : (view.you.plan?.gear ?? me.gear)"
          :current="me.gear"
          :engine="me.engine"
          :disabled="!canPlan"
          @shift="chooseGear"
        />
        <div class="controls">
        <div class="gauges">
          <div class="gauge heat">
            <span class="label">Engine Heat</span>
            <span class="pips" :aria-label="`${me.engine} Heat in the engine`">
              <span v-for="i in Math.max(me.engine, 6)" :key="i" class="pip" :class="{ full: i <= me.engine }" />
            </span>
          </div>
          <div class="piles">
            <CardStack ref="deckPile" :count="me.deck" label="Deck" />
            <CardStack :count="me.discard" label="Discard" muted />
          </div>
        </div>

        <p v-if="upcoming.length" class="muted corners-ahead">
          Next corner{{ upcoming.length > 1 ? 's' : '' }}:
          <span v-for="(corner, i) in upcoming" :key="i" class="corner-chip">
            <!-- Tiles before the corner, matching the badge on the track. -->
            limit <strong>{{ corner.limit }}</strong> in {{ corner.distance - 1 }}
          </span>
        </p>

        <!-- Choosing a gear and cards -->
        <template v-if="canPlan">
          <p v-if="clogged" class="warning">
            Your hand is clogged with Heat. You can only play {{ playable.length }}, so your car will stall and
            drop to 1st gear.
          </p>
        </template>

        <div ref="handRow" class="hand" :class="{ choosing: canPlan || me.needsDiscard }">
          <RaceCard
            v-for="card in sortedHand"
            :key="card.id"
            :card="card"
            :selected="picked.includes(card.id) || discardPicked.includes(card.id)"
            :disabled="
              canPlan
                ? card.kind === 'heat'
                : me.needsDiscard
                  ? card.kind === 'heat' || card.kind === 'stress'
                  : false
            "
            :marked="discardPicked.includes(card.id) ? 'discard' : undefined"
            @click="toggleCard(card)"
          />
        </div>

        <div v-if="canPlan" class="row actions">
          <button class="primary" :disabled="picked.length !== needed" @click="lockIn">
            Lock in gear {{ gear }}<template v-if="picked.length"> · speed {{ preview }}</template>
          </button>
          <span class="muted">{{ picked.length }} of {{ needed }} picked</span>
        </div>
        <div v-else-if="view.phase === 'plan' && view.you.plan" class="row actions">
          <button @click="emit('move', { type: 'unplan' })">Change my pick</button>
        </div>

        <!-- Your turn to react -->
        <template v-if="yourStep === 'react' && view.you.react">
          <div class="played">
            <span class="label">Played</span>
            <RaceCard v-for="(entry, i) in me.play" :key="i" :card="entry.flipped ?? entry.card!" :boost="entry.boost" :from-stress="entry.card?.kind === 'stress'" :reveal="entry.boost || entry.card?.kind === 'stress'" small />
            <strong class="speed">Speed {{ me.speed }}</strong>
          </div>
          <p v-if="cornerCost" class="warning" :class="{ danger: cornerCost.spin }">
            Corner{{ cornerCost.crossed.length > 1 ? 's' : '' }} crossed:
            {{ cornerCost.crossed.map((c) => c.limit).join(', ') }}.
            <template v-if="cornerCost.cost === 0">You’re under the limit.</template>
            <template v-else-if="cornerCost.spin">That costs {{ cornerCost.cost }} Heat and you have {{ me.engine }}, so you’ll spin out!</template>
            <template v-else>That costs {{ cornerCost.cost }} Heat.</template>
          </p>
          <div class="row actions">
            <button :disabled="!view.you.react.boost" @click="emit('move', { type: 'boost' })">Boost (1 Heat)</button>
            <button v-if="view.you.react.adrenaline" @click="emit('move', { type: 'adrenaline' })">
              Adrenaline +1
            </button>
            <button class="primary" @click="emit('move', { type: 'endReact' })">Done</button>
          </div>
        </template>

        <div v-if="yourStep === 'slipstream'" class="row actions">
          <button class="primary" @click="emit('move', { type: 'slipstream', take: true })">Slipstream +2</button>
          <button @click="emit('move', { type: 'slipstream', take: false })">No thanks</button>
        </div>

        <div v-if="me.needsDiscard" class="row actions">
          <button
            class="primary"
            @click="emit('move', { type: 'discard', cards: [...discardPicked], round: view.round })"
          >
            {{ discardPicked.length ? `Discard ${discardPicked.length} and draw` : 'Keep my hand and draw' }}
          </button>
          <span class="muted">Tap speed cards to discard them.</span>
        </div>
        </div>
      </section>

      <section class="side">
        <h2>Standings</h2>
        <ol class="standings">
          <li v-for="car in standings" :key="car.id" :class="{ you: car.id === you, active: car.id === currentId }">
            <span class="dot" :style="{ background: car.color }" />
            <span class="name">{{ nameOf(car.id) }}<template v-if="car.id === you"> (you)</template></span>
            <span v-if="car.place" class="tag gold">{{ ordinal(car.place) }}</span>
            <template v-else>
              <span class="muted small-text">Lap {{ lapOf(car.pos) }} · G{{ car.gear }} · 🔥{{ car.engine }}</span>
              <span v-if="view.phase === 'plan'" class="tag" :class="{ ready: car.planned }">
                {{ car.planned ? 'Ready' : 'Choosing' }}
              </span>
              <span v-else-if="car.id === currentId" class="tag go">Driving</span>
              <span v-else-if="car.speed !== null" class="muted small-text">moved {{ car.speed }}</span>
            </template>
          </li>
        </ol>

        <h2>Race news</h2>
        <ul class="news">
          <li v-for="event in news" :key="event.seq" :class="event.kind">{{ describe(event) }}</li>
          <li v-if="!news.length" class="muted">Lights out and away we go!</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.overheat {
  display: grid;
  gap: 0.75rem;
  width: 100%;
}

.topline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.small {
  padding: 0.35rem 0.7rem;
  font-size: 0.9rem;
}

.stage {
  position: relative;
}

.flash {
  position: absolute;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.88);
  color: #fff;
  font-size: 1.15rem;
  font-weight: 800;
  white-space: nowrap;
  pointer-events: none;
}

.flash.spin {
  background: #c1121f;
}

.flash.finish {
  background: #1b998b;
}

.flash-enter-active,
.flash-leave-active {
  transition:
    opacity 0.3s,
    transform 0.3s;
}

.flash-enter-from,
.flash-leave-to {
  opacity: 0;
  transform: translate(-50%, -0.5rem);
}

.status {
  font-size: 1.1rem;
  font-weight: 700;
}

.panels {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(16rem, 1fr);
  gap: 1rem;
  align-items: start;
}

@media (max-width: 860px) {
  .panels {
    grid-template-columns: minmax(0, 1fr);
  }
}

.cockpit {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

@media (max-width: 560px) {
  .cockpit {
    gap: 0.6rem;
    padding: 0.6rem;
  }
}

.controls,
.side {
  display: grid;
  gap: 0.75rem;
}

.side {
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.gauges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  align-items: end;
}

.piles {
  display: flex;
  gap: 0.75rem;
}

.gauge {
  display: grid;
  gap: 0.1rem;
}

.gauge strong {
  font-size: 1.4rem;
  line-height: 1;
}

.label {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  max-width: 12rem;
}

.pip {
  width: 12px;
  height: 18px;
  border-radius: 3px;
  background: var(--line);
}

.pip.full {
  background: linear-gradient(#ff8a3d, #e5383b);
}

.corners-ahead {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.corner-chip {
  padding: 0.1rem 0.55rem;
  border: 2px solid #d62828;
  border-radius: 999px;
  color: var(--ink);
}

.hand {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.played {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.speed {
  margin-left: 0.25rem;
  font-size: 1.2rem;
}

.actions {
  align-items: center;
}

.warning {
  padding: 0.5rem 0.75rem;
  border-left: 4px solid #f4a261;
  border-radius: 0.3rem;
  background: color-mix(in srgb, #f4a261 15%, transparent);
}

.warning.danger {
  border-color: #e5383b;
  background: color-mix(in srgb, #e5383b 18%, transparent);
}

.side h2 {
  font-size: 1rem;
}

.standings,
.news {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.standings li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.4rem;
  border-radius: 0.4rem;
}

.standings li.active {
  background: color-mix(in srgb, #ffd60a 22%, transparent);
}

.standings li.you .name {
  font-weight: 800;
}

.dot {
  width: 0.9rem;
  height: 0.9rem;
  border: 1px solid rgba(0, 0, 0, 0.4);
  border-radius: 50%;
}

.small-text {
  font-size: 0.85rem;
}

.tag {
  padding: 0 0.45rem;
  border-radius: 999px;
  background: var(--line);
  font-size: 0.75rem;
  font-weight: 700;
}

.tag.ready {
  background: #1b998b;
  color: #fff;
}

.tag.go {
  background: #ffd60a;
  color: #111;
}

.tag.gold {
  background: #e9c46a;
  color: #111;
}

.news li {
  font-size: 0.9rem;
}

.news .spin {
  color: #e5383b;
  font-weight: 700;
}

.news .finish {
  font-weight: 700;
}
</style>
