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

const nameOf = (id: string) => props.players.find((player) => player.id === id)?.name ?? 'Someone'
const yourName = (id: string) => (id === props.you ? 'you' : nameOf(id))

const choice = computed(() => props.view.choice)
const yourChoice = computed(() => (choice.value?.playerId === props.you ? choice.value : null))
const isYourTurn = computed(
  () => props.view.phase === 'playing' && !choice.value && props.view.turnPlayerId === props.you,
)
const yourHand = computed(() => props.view.hands[props.you])
const holdsZero = computed(() => !!yourHand.value?.numbers.some((card) => card.special === 'zero'))
const isRoundOver = computed(() => props.view.phase === 'roundOver')
const isGameOver = computed(
  () =>
    isRoundOver.value &&
    Object.values(props.view.scores).some((score) => score >= props.view.targetScore),
)

const choiceCardName = computed(() => (choice.value ? cardName(choice.value.card) : ''))

const status = computed(() => {
  const { phase, turnPlayerId, flip7PlayerId } = props.view
  if (phase === 'roundOver') {
    return flip7PlayerId ? `${nameOf(flip7PlayerId)} flipped 7! Round over.` : 'Round over'
  }
  const current = choice.value
  if (current) {
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
  if (props.view.hands[ownerId]?.status === 'busted') return false
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

const livePoints = (id: string) => scoreHand(props.view.variant, props.view.hands[id]!, false)

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

const standings = computed(() =>
  [...props.view.order].sort((a, b) => (props.view.scores[b] ?? 0) - (props.view.scores[a] ?? 0)),
)

const heldCard = (card: Card | null): card is Card => card !== null
</script>

<template>
  <div class="streak">
    <header class="round-bar">
      <div>
        <p class="eyebrow">
          Round {{ view.round }} · {{ nameOf(view.dealerId) }} dealt · first to {{ view.targetScore }}
        </p>
        <p class="status" aria-live="polite">{{ status }}</p>
      </div>
      <p class="muted deck">{{ view.deckCount }} cards left in the deck</p>
    </header>

    <div v-if="isYourTurn" class="controls">
      <button class="primary" @click="emit('move', { type: 'hit' })">Flip a card</button>
      <button :disabled="holdsZero" @click="emit('move', { type: 'stay' })">Stay</button>
      <span v-if="holdsZero" class="muted">You hold the Zero, so you must keep flipping.</span>
    </div>

    <div v-if="yourChoice" class="controls choice" role="group" :aria-label="choicePrompt ?? ''">
      <PlayingCard :card="yourChoice.card" small />
      <span class="choice-prompt">{{ choicePrompt }}</span>
      <template v-if="yourChoice.kind === 'target'">
        <button
          v-for="id in yourChoice.options"
          :key="id"
          class="primary"
          @click="emit('move', { type: 'target', playerId: id })"
        >
          {{ id === you ? 'Me' : nameOf(id) }}
        </button>
      </template>
      <button v-if="swapPick" @click="swapPick = null">Pick again</button>
    </div>

    <div class="table">
      <section
        v-for="id in view.order"
        :key="id"
        class="seat"
        :class="{
          current: view.turnPlayerId === id && !isRoundOver,
          busted: view.hands[id]?.status === 'busted',
          you: id === you,
        }"
      >
        <header class="seat-header">
          <strong class="seat-name">{{ nameOf(id) }}<template v-if="id === you"> (you)</template></strong>
          <span v-if="view.hands[id]?.status === 'stayed'" class="tag">stayed</span>
          <span v-else-if="view.hands[id]?.status === 'busted'" class="tag bust">busted</span>
          <span v-else-if="view.turnPlayerId === id && !isRoundOver" class="tag turn">turn</span>
          <span class="seat-score">
            <template v-if="isRoundOver">+{{ view.roundScores?.[id] ?? 0 }} · </template>
            <template v-else-if="view.hands[id]?.status !== 'busted'">{{ livePoints(id) }} this round · </template>
            {{ view.scores[id] ?? 0 }} total
          </span>
        </header>
        <div class="cards">
          <PlayingCard
            v-for="card in view.hands[id]?.numbers ?? []"
            :key="card.id"
            :card="card"
            :selectable="canPick(id)"
            :selected="isSwapPicked(id, card)"
            @select="pickCard(id, card)"
          />
          <PlayingCard
            v-for="card in view.hands[id]?.modifiers ?? []"
            :key="card.id"
            :card="card"
            :selectable="canPick(id)"
            :selected="isSwapPicked(id, card)"
            @select="pickCard(id, card)"
          />
          <PlayingCard
            v-if="heldCard(view.hands[id]?.secondChance ?? null)"
            :card="view.hands[id]!.secondChance!"
          />
          <span v-if="!view.hands[id]?.numbers.length && !view.hands[id]?.modifiers.length" class="muted empty">
            No cards
          </span>
        </div>
      </section>
    </div>

    <div class="lower">
      <section class="log" aria-label="What just happened">
        <h2>What just happened</h2>
        <ol>
          <li v-for="entry in [...view.log].reverse()" :key="entry.id">{{ describe(entry) }}</li>
        </ol>
      </section>

      <section class="standings">
        <h2>Scores</h2>
        <ol>
          <li v-for="id in standings" :key="id">
            <span>{{ nameOf(id) }}</span>
            <strong>{{ view.scores[id] ?? 0 }}</strong>
          </li>
        </ol>
        <button
          v-if="isRoundOver && !isGameOver"
          class="primary next-round"
          @click="emit('move', { type: 'nextRound', round: view.round })"
        >
          Next round
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.streak {
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

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem;
  border-radius: var(--radius);
  background: var(--accent-soft);
}

.choice-prompt {
  font-weight: 700;
}

.table {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
  gap: 0.75rem;
}

.seat {
  display: grid;
  gap: 0.6rem;
  align-content: start;
  padding: 0.75rem;
  border: 2px solid var(--line);
  border-radius: var(--radius);
}

.seat.current {
  border-color: var(--accent);
}

.seat.you {
  background: var(--paper);
}

.seat.busted .cards {
  opacity: 0.4;
  filter: grayscale(1);
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
}

.log li {
  color: var(--muted);
}

.standings li {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.next-round {
  width: 100%;
  margin-top: 0.75rem;
}

.empty {
  font-size: 0.85rem;
}

@media (max-width: 700px) {
  .lower {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
