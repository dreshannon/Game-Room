<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  cardName,
  scoreHand,
  type Card,
  type LogEntry,
  type StreakMove,
  type StreakView,
  type TableCard,
} from '../../games/lucky-streak/engine'
import type { PublicPlayer } from '../../shared/protocol'
import PlayingCard from './PlayingCard.vue'
import CardBack from './lucky-streak/CardBack.vue'
import DecoDeck from './lucky-streak/DecoDeck.vue'
import { useTableReplay } from './lucky-streak/useTableReplay'

const props = defineProps<{
  view: StreakView
  you: string
  players: PublicPlayer[]
}>()

const emit = defineEmits<{ move: [move: StreakMove] }>()

interface Pick {
  ownerId: string
  cardId: number
}

const swapPick = ref<Pick | null>(null)
const root = ref<HTMLElement | null>(null)

const replay = useTableReplay(() => props.view, root)
const { busy, hidden, statusOverride, fliers, setFlierEl, shaking, clashing, frosting, celebrating, shuffling, tally } =
  replay

/**
 * The table as it should look right now. Cards land one at a time, so while they're
 * flying the turn, any choice, the phase and the scores stay as they were.
 */
const table = computed<StreakView>(() => {
  const view = props.view
  if (!busy.value) return view
  const shown = replay.shown.value
  return {
    ...view,
    turnPlayerId: shown.turnPlayerId,
    choice: shown.choice,
    phase: shown.phase,
    scores: shown.scores,
    roundScores: shown.roundScores,
    flip7PlayerId: shown.flip7PlayerId,
  }
})

const statusOf = (id: string) => statusOverride.get(id) ?? props.view.hands[id]?.status

/** You clicked the deck and the server hasn't answered yet. */
const drawing = ref(false)
watch(
  () => props.view,
  () => (drawing.value = false),
)
function draw() {
  if (!isYourTurn.value || drawing.value) return
  drawing.value = true
  emit('move', { type: 'hit' })
}

const nameOf = (id: string) => props.players.find((player) => player.id === id)?.name ?? 'Someone'
const yourName = (id: string) => (id === props.you ? 'you' : nameOf(id))

const choice = computed(() => table.value.choice)
const yourChoice = computed(() => (choice.value?.playerId === props.you ? choice.value : null))
const isYourTurn = computed(
  () => !busy.value && table.value.phase === 'playing' && !choice.value && table.value.turnPlayerId === props.you,
)
const yourHand = computed(() => props.view.hands[props.you])
const holdsZero = computed(() => !!yourHand.value?.numbers.some((card) => card.special === 'zero'))
const isRoundOver = computed(() => table.value.phase === 'roundOver')
const isGameOver = computed(
  () =>
    isRoundOver.value &&
    Object.values(table.value.scores).some((score) => score >= table.value.targetScore),
)

const choiceCardName = computed(() => (choice.value ? cardName(choice.value.card) : ''))

const status = computed(() => {
  const { phase, turnPlayerId, flip7PlayerId } = table.value
  if (phase === 'roundOver') {
    return flip7PlayerId ? `${nameOf(flip7PlayerId)} flipped 7! Round over.` : 'Round over'
  }
  if (busy.value && !turnPlayerId && phase === 'playing') return 'Dealing…'
  const current = choice.value
  if (current) {
    // The choice was just made, and its cards are still landing.
    if (busy.value) return current.playerId === props.you ? `You played ${cardName(current.card)}` : `${nameOf(current.playerId)} played ${cardName(current.card)}`
    if (current.playerId === props.you) return 'Your choice'
    return `${nameOf(current.playerId)} is playing ${cardName(current.card)}`
  }
  if (turnPlayerId === props.you) return 'Your turn: flip or stay'
  return turnPlayerId ? `${nameOf(turnPlayerId)}’s turn` : ''
})

const choicePrompt = computed(() => {
  const current = yourChoice.value
  if (!current) return null
  switch (current.kind) {
    case 'target':
      return current.card.kind === 'modifier'
        ? `Who gets your ${choiceCardName.value} card?`
        : `Who do you play ${choiceCardName.value} on?`
    case 'steal':
      return 'Steal: tap a card in front of another player.'
    case 'discard':
      return 'Discard: tap any card to throw it away.'
    case 'swap':
      return swapPick.value
        ? 'Swap: now tap a card belonging to a different player.'
        : 'Swap: tap the first of two cards from different players.'
  }
})

/** Whether a card on the table can be tapped for the choice being made. */
function canPick(ownerId: string) {
  const current = yourChoice.value
  if (!current || current.kind === 'target') return false
  if (statusOf(ownerId) === 'busted') return false
  if (current.kind === 'steal') return ownerId !== props.you
  if (current.kind === 'swap' && swapPick.value) return ownerId !== swapPick.value.ownerId
  return true
}

function pickCard(ownerId: string, card: TableCard) {
  const current = yourChoice.value
  if (!current || !canPick(ownerId)) return
  if (current.kind === 'steal') return emit('move', { type: 'steal', ownerId, cardId: card.id })
  if (current.kind === 'discard') return emit('move', { type: 'discard', ownerId, cardId: card.id })
  if (current.kind === 'swap') {
    if (!swapPick.value) {
      swapPick.value = { ownerId, cardId: card.id }
      return
    }
    emit('move', { type: 'swap', first: swapPick.value, second: { ownerId, cardId: card.id } })
    swapPick.value = null
  }
}

watch(choice, () => {
  swapPick.value = null
})

const isSwapPicked = (ownerId: string, card: TableCard) =>
  swapPick.value?.ownerId === ownerId && swapPick.value.cardId === card.id

const livePoints = (id: string) => {
  const hand = props.view.hands[id]!
  // Cards still flying in don't count yet.
  const landed = {
    ...hand,
    status: statusOf(id)!,
    numbers: hand.numbers.filter((card) => !hidden.has(card.id)),
    modifiers: hand.modifiers.filter((card) => !hidden.has(card.id)),
  }
  return scoreHand(props.view.variant, landed, false)
}

/** The round's points and running totals, counting up when a round ends. */
const roundPoints = (id: string) => Math.round((table.value.roundScores?.[id] ?? 0) * tally.value)
const totalShown = (id: string) => {
  const total = table.value.scores[id] ?? 0
  const round = table.value.roundScores?.[id] ?? 0
  return isRoundOver.value ? total - round + roundPoints(id) : total
}

/** The log so far, holding back lines whose cards haven't landed yet. */
const logShown = computed(() =>
  props.view.log
    .filter((entry) => entry.id <= replay.shownLogId.value)
    .slice(-10)
    .reverse(),
)

/** Cards spread out when someone flips 7. */
const fan = (id: string, index: number, count: number) =>
  celebrating.value === id ? { '--fan': index - (count - 1) / 2 } : undefined

const allCards = (id: string) => {
  const hand = props.view.hands[id]
  return hand ? [...hand.numbers, ...hand.modifiers] : []
}

const playPrompt = computed(() => {
  const current = table.value.choice
  if (!current || current.playerId === props.you) return null
  return `${nameOf(current.playerId)} is choosing`
})

function describe(entry: LogEntry) {
  switch (entry.type) {
    case 'deal':
      return `${nameOf(entry.playerId)} was dealt ${cardName(entry.card)}`
    case 'draw':
      return `${nameOf(entry.playerId)} flipped ${cardName(entry.card)}`
    case 'bust':
      return `${nameOf(entry.playerId)} busted!`
    case 'saved':
      return `${nameOf(entry.playerId)} used Second Chance`
    case 'stay':
      return `${nameOf(entry.playerId)} stayed`
    case 'forcedStay':
      return `${nameOf(entry.playerId)} has to stay`
    case 'flip7':
      return `${nameOf(entry.playerId)} flipped 7!`
    case 'unlucky':
      return `Unlucky 7 wiped out ${nameOf(entry.playerId)}’s other cards`
    case 'played':
      return entry.card.kind === 'modifier'
        ? `${nameOf(entry.playerId)} gave ${cardName(entry.card)} to ${yourName(entry.targetId)}`
        : `${nameOf(entry.playerId)} played ${cardName(entry.card)} on ${yourName(entry.targetId)}`
    case 'fizzled':
      return `${cardName(entry.card)} had no one to target and was thrown away`
    case 'stole':
      return `${nameOf(entry.playerId)} stole ${cardName(entry.card)} from ${yourName(entry.fromId)}`
    case 'swapped':
      return `${nameOf(entry.playerId)} swapped ${yourName(entry.firstOwnerId)}’s ${cardName(entry.first)} with ${yourName(entry.secondOwnerId)}’s ${cardName(entry.second)}`
    case 'discarded':
      return `${nameOf(entry.playerId)} threw away ${yourName(entry.ownerId)}’s ${cardName(entry.card)}`
    case 'reshuffled':
      return 'The discards were shuffled into a new deck'
  }
}

const standings = computed(() => [...props.view.order].sort((a, b) => totalShown(b) - totalShown(a)))
const progress = (id: string) => `${Math.min(100, (totalShown(id) / table.value.targetScore) * 100)}%`

const heldCard = (card: Card | null): card is Card => card !== null
</script>

<template>
  <div ref="root" class="streak">
    <header class="round-bar">
      <div>
        <p class="eyebrow">
          Round {{ view.round }} · {{ nameOf(view.dealerId) }} dealt · first to {{ view.targetScore }}
        </p>
        <p class="status" aria-live="polite">{{ status }}</p>
      </div>
    </header>

    <section class="center" aria-label="Deck and cards in play">
      <DecoDeck :count="replay.deckCount.value" :active="isYourTurn && !drawing" :shuffling="shuffling" @draw="draw" />

      <div class="spot">
        <div class="play-spot" data-anchor="play" :class="{ filled: !!replay.playCard.value }">
          <PlayingCard v-if="replay.playCard.value" :card="replay.playCard.value" large />
          <span v-else class="spot-label" aria-hidden="true">In play</span>
        </div>
        <span class="caption">{{ replay.playCard.value ? 'To play' : ' ' }}</span>
      </div>

      <div class="spot">
        <div class="discard-pile" data-anchor="discard">
          <span v-if="replay.discardCount.value > 1" class="discard-under" aria-hidden="true"></span>
          <PlayingCard v-if="replay.lastDiscard.value && replay.discardCount.value" :card="replay.lastDiscard.value" />
          <span v-else-if="replay.discardCount.value" class="discard-under solo" aria-hidden="true"></span>
        </div>
        <span class="caption">Discard · {{ replay.discardCount.value }}</span>
      </div>

      <div class="turn-panel">
        <template v-if="isYourTurn">
          <p class="hint">Tap the deck to flip, or stay with what you have.</p>
          <div class="row">
            <button class="primary" :disabled="drawing" @click="draw">Flip a card</button>
            <button :disabled="holdsZero || drawing" @click="emit('move', { type: 'stay' })">Stay</button>
          </div>
          <span v-if="holdsZero" class="muted small-text">You hold the Zero, so you must keep flipping.</span>
        </template>

        <template v-else-if="yourChoice">
          <p class="hint strong">{{ choicePrompt }}</p>
          <div v-if="yourChoice.kind === 'target'" class="row">
            <button
              v-for="id in yourChoice.options"
              :key="id"
              class="primary"
              @click="emit('move', { type: 'target', playerId: id })"
            >
              {{ id === you ? 'Me' : nameOf(id) }}
            </button>
          </div>
          <button v-if="swapPick" @click="swapPick = null">Pick again</button>
        </template>

        <p v-else-if="playPrompt" class="hint">{{ playPrompt }}…</p>

        <button
          v-else-if="isRoundOver && !isGameOver && !busy && tally === 1"
          class="primary"
          @click="emit('move', { type: 'nextRound', round: view.round })"
        >
          Next round
        </button>
      </div>
    </section>

    <div class="table">
      <section
        v-for="id in view.order"
        :key="id"
        class="seat"
        :data-seat="id"
        :class="{
          current: table.turnPlayerId === id && !isRoundOver,
          busted: statusOf(id) === 'busted',
          frozen: statusOf(id) === 'stayed' && view.hands[id]?.frozen,
          freezing: frosting.has(id),
          shake: shaking.has(id),
          lucky: !busy && table.flip7PlayerId === id,
          celebrate: celebrating === id,
          you: id === you,
        }"
      >
        <header class="seat-header">
          <strong class="seat-name">{{ nameOf(id) }}<template v-if="id === you"> (you)</template></strong>
          <span v-if="statusOf(id) === 'stayed'" class="tag" :class="{ ice: view.hands[id]?.frozen }">
            {{ view.hands[id]?.frozen ? 'frozen' : 'stayed' }}
          </span>
          <span v-else-if="statusOf(id) === 'busted'" class="tag bust">busted</span>
          <span v-else-if="table.turnPlayerId === id && !isRoundOver" class="tag turn">turn</span>
          <span class="seat-score">
            <template v-if="isRoundOver">
              <strong class="round-points" :class="{ none: !(table.roundScores?.[id] ?? 0) }">+{{ roundPoints(id) }}</strong> ·
            </template>
            <template v-else-if="statusOf(id) !== 'busted'">{{ livePoints(id) }} this round · </template>
            {{ totalShown(id) }} total
          </span>
        </header>
        <div class="cards">
          <PlayingCard
            v-for="(card, index) in allCards(id)"
            :key="card.id"
            :data-card-id="card.id"
            :card="card"
            :class="{ hidden: hidden.has(card.id), clash: clashing.has(card.id) }"
            :style="fan(id, index, allCards(id).length)"
            :selectable="canPick(id) && !hidden.has(card.id)"
            :selected="isSwapPicked(id, card)"
            @select="pickCard(id, card)"
          />
          <PlayingCard
            v-if="heldCard(view.hands[id]?.secondChance ?? null)"
            :data-card-id="view.hands[id]!.secondChance!.id"
            :card="view.hands[id]!.secondChance!"
            :class="{ hidden: hidden.has(view.hands[id]!.secondChance!.id) }"
          />
          <span v-if="!allCards(id).length && !view.hands[id]?.secondChance" class="muted empty">No cards</span>
        </div>
        <div v-if="celebrating === id" class="banner" aria-hidden="true">Flip 7!</div>
      </section>
    </div>

    <div class="lower">
      <section class="log" aria-label="What just happened">
        <h2>What just happened</h2>
        <ol>
          <li v-for="entry in logShown" :key="entry.id">{{ describe(entry) }}</li>
        </ol>
      </section>

      <section class="standings">
        <h2>Scores</h2>
        <ol>
          <li v-for="id in standings" :key="id">
            <div class="standing-row">
              <span>{{ nameOf(id) }}</span>
              <strong>{{ totalShown(id) }}</strong>
            </div>
            <div class="bar" aria-hidden="true"><span :style="{ width: progress(id) }"></span></div>
          </li>
        </ol>
      </section>
    </div>

    <Teleport to="body">
      <div class="fliers" aria-hidden="true">
        <div
          v-for="flier in fliers"
          :key="flier.key"
          :ref="(el) => setFlierEl(flier.key, el)"
          class="flier"
          :style="{ left: `${flier.left}px`, top: `${flier.top}px`, width: `${flier.width}px`, height: `${flier.height}px` }"
        >
          <div class="flier-inner">
            <div class="face front">
              <PlayingCard
                :card="flier.card"
                :large="flier.height > 80"
                :style="{ '--w': `${flier.width}px`, '--h': `${flier.height}px` }"
              />
            </div>
            <div class="face back"><CardBack /></div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.streak {
  --big-card-w: 4.4rem;
  --big-card-h: 6.16rem;
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

/* ---- The middle of the table: deck, card in play, discards ---- */

.center {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 1rem 1.5rem;
  padding: 1rem 1.25rem 0.85rem;
  border: 2px solid var(--line);
  border-radius: var(--radius);
  background:
    repeating-linear-gradient(
      135deg,
      transparent 0 14px,
      color-mix(in srgb, var(--accent) 5%, transparent) 14px 15px
    ),
    var(--surface);
}

.spot {
  display: grid;
  justify-items: center;
  gap: 0.35rem;
}

.play-spot,
.discard-pile {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--big-card-w);
  height: var(--big-card-h);
  border: 2px dashed var(--line);
  border-radius: 0.55rem;
}

.play-spot.filled {
  border-color: transparent;
}

.play-spot.filled :deep(.playing-card) {
  animation: glow 1.6s ease-in-out infinite;
}

.spot-label {
  color: var(--muted);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.discard-pile {
  width: 3.1rem;
  height: 4.3rem;
  margin-top: calc((var(--big-card-h) - 4.3rem) / 2);
  margin-bottom: calc((var(--big-card-h) - 4.3rem) / 2);
}

.discard-pile :deep(.playing-card) {
  position: relative;
  transform: rotate(4deg);
  filter: saturate(0.6);
}

.discard-under {
  position: absolute;
  inset: 0;
  border: 2px solid var(--line);
  border-radius: 0.45rem;
  background: var(--paper);
  transform: rotate(-5deg);
}

.discard-under.solo {
  transform: none;
}

.caption {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.turn-panel {
  display: grid;
  flex: 1 1 14rem;
  align-content: center;
  justify-items: start;
  gap: 0.5rem;
  min-height: var(--big-card-h);
}

.turn-panel .row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.hint {
  color: var(--muted);
}

.hint.strong {
  color: var(--ink);
  font-weight: 700;
}

.small-text {
  font-size: 0.85rem;
}

/* ---- Seats ---- */

.table {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
  gap: 0.75rem;
}

.seat {
  position: relative;
  display: grid;
  gap: 0.6rem;
  align-content: start;
  padding: 0.75rem;
  border: 2px solid var(--line);
  border-radius: var(--radius);
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease,
    background-color 0.4s ease;
}

.seat.current {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.seat.you {
  background: var(--paper);
}

.seat .cards :deep(.playing-card) {
  transition:
    transform 0.45s cubic-bezier(0.3, 1.4, 0.5, 1),
    filter 0.5s ease,
    opacity 0.5s ease;
}

.seat.busted .cards {
  opacity: 0.45;
  filter: grayscale(1);
  transition:
    opacity 0.5s ease,
    filter 0.5s ease;
}

.seat.shake {
  animation: shake 0.55s cubic-bezier(0.36, 0.07, 0.19, 0.97);
  border-color: #c62828;
}

.cards :deep(.clash) {
  animation: clash 0.35s ease-in-out 3;
}

.seat.frozen {
  border-color: #7fb6d8;
  background:
    linear-gradient(160deg, rgb(173 216 240 / 0.35), rgb(255 255 255 / 0) 60%),
    var(--surface);
}

.seat.you.frozen {
  background:
    linear-gradient(160deg, rgb(173 216 240 / 0.35), rgb(255 255 255 / 0) 60%),
    var(--paper);
}

.seat.frozen .cards :deep(.playing-card) {
  filter: saturate(0.55) brightness(1.04);
}

.seat.freezing {
  animation: frost 0.6s ease-out;
}

.seat.lucky {
  border-color: #d6a84a;
  box-shadow: 0 0 0 3px rgb(214 168 74 / 0.3);
}

.seat.celebrate {
  border-color: #d6a84a;
  animation: shine 1.9s ease-in-out;
}

.seat.celebrate .cards :deep(.playing-card) {
  transform: translateY(calc(max(var(--fan, 0), -1 * var(--fan, 0)) * 3px - 10px)) rotate(calc(var(--fan, 0) * 7deg));
  box-shadow:
    inset 0 0 0 2px var(--face),
    inset 0 0 0 3px var(--trim),
    0 0 14px rgb(214 168 74 / 0.8);
}

.banner {
  position: absolute;
  top: 50%;
  left: 50%;
  padding: 0.25rem 1.1rem;
  border: 3px double #8a6418;
  background: linear-gradient(180deg, #ffe08a, #d6a84a);
  color: #3b2a05;
  font-family: Futura, 'Century Gothic', 'Avenir Next', 'Trebuchet MS', sans-serif;
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
  clip-path: polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0 50%);
  animation: banner 1.9s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}

.cards :deep(.hidden) {
  visibility: hidden;
}

.seat-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.seat-name {
  overflow-wrap: anywhere;
}

.seat-score {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.85rem;
}

.round-points {
  color: var(--accent);
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.round-points.none {
  color: var(--muted);
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-height: 4.3rem;
  align-items: center;
}

.tag {
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--accent-soft);
  font-size: 0.75rem;
  font-weight: 600;
}

.tag.turn {
  background: var(--accent);
  color: var(--accent-ink);
}

.tag.bust {
  background: var(--ink);
  color: var(--paper);
}

.tag.ice {
  background: #cfe6f4;
  color: #1d4e6e;
}

/* ---- Log and scores ---- */

.lower {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 14rem;
  gap: 1rem;
  align-items: start;
}

.log ol,
.standings ol {
  display: grid;
  gap: 0.3rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.log li:first-child {
  font-weight: 700;
  animation: fade-in 0.3s ease;
}

.log li {
  color: var(--muted);
}

.standings ol {
  gap: 0.5rem;
}

.standing-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-variant-numeric: tabular-nums;
}

.bar {
  height: 0.35rem;
  margin-top: 0.2rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--line);
}

.bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.empty {
  font-size: 0.85rem;
}

/* ---- Cards in flight ---- */

.fliers {
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: none;
}

.flier {
  position: fixed;
  transform-origin: 0 0;
  perspective: 600px;
  will-change: transform;
}

.flier-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}

.face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
}

.face.front :deep(.playing-card) {
  box-shadow:
    inset 0 0 0 2px var(--face),
    inset 0 0 0 3px var(--trim),
    0 8px 18px rgb(0 0 0 / 0.28);
}

.face.back {
  transform: rotateY(180deg);
  border-radius: 0.5rem;
  box-shadow: 0 8px 18px rgb(0 0 0 / 0.28);
}

@keyframes glow {
  0%,
  100% {
    box-shadow:
      inset 0 0 0 2px var(--face),
      inset 0 0 0 3px var(--trim),
      0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent);
  }
  50% {
    box-shadow:
      inset 0 0 0 2px var(--face),
      inset 0 0 0 3px var(--trim),
      0 0 0 7px color-mix(in srgb, var(--accent) 0%, transparent);
  }
}

@keyframes shake {
  10%,
  90% {
    transform: translateX(-2px);
  }
  20%,
  80% {
    transform: translateX(4px);
  }
  30%,
  50%,
  70% {
    transform: translateX(-7px) rotate(-0.6deg);
  }
  40%,
  60% {
    transform: translateX(7px) rotate(0.6deg);
  }
}

@keyframes clash {
  50% {
    transform: scale(1.12);
    border-color: #c62828;
    box-shadow:
      inset 0 0 0 2px var(--face),
      inset 0 0 0 3px #c62828,
      0 0 0 4px rgb(198 40 40 / 0.55);
  }
}

@keyframes frost {
  0% {
    box-shadow: 0 0 0 0 rgb(127 182 216 / 0.9);
  }
  100% {
    box-shadow: 0 0 0 14px rgb(127 182 216 / 0);
  }
}

@keyframes shine {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgb(214 168 74 / 0);
  }
  30% {
    box-shadow: 0 0 22px 6px rgb(214 168 74 / 0.65);
  }
}

@keyframes banner {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.3) rotate(-8deg);
  }
  25% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.1) rotate(-3deg);
  }
  80% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1) rotate(-3deg);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -80%) scale(1) rotate(-3deg);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@media (prefers-color-scheme: dark) {
  .seat.frozen,
  .seat.you.frozen {
    border-color: #4f8db3;
    background:
      linear-gradient(160deg, rgb(79 141 179 / 0.25), rgb(0 0 0 / 0) 60%),
      var(--surface);
  }

  .tag.ice {
    background: #23485f;
    color: #cfe6f4;
  }
}

@media (max-width: 700px) {
  .lower {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 480px) {
  .streak {
    --big-card-w: 3.7rem;
    --big-card-h: 5.18rem;
  }

  .center {
    gap: 0.75rem 1rem;
    padding: 0.85rem;
  }

  .turn-panel {
    flex-basis: 100%;
    min-height: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .seat.shake,
  .seat.freezing,
  .seat.celebrate,
  .banner,
  .cards :deep(.clash),
  .play-spot.filled :deep(.playing-card) {
    animation: none;
  }
}
</style>
