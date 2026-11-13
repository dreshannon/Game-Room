<script setup lang="ts">
// Practice for the lobby: flip or stay on your own, with number cards only.
import { computed, ref } from 'vue'
import { buildDeck, FLIP_7_BONUS, shuffle, type NumberCard } from '../../../games/lucky-streak/engine'
import type { PublicPlayer } from '../../../shared/protocol'
import PlayingCard from '../PlayingCard.vue'
import DemoFrame from './DemoFrame.vue'

defineProps<{ you: string; players: PublicPlayer[] }>()

const ROUNDS = 3
const STREAK = 7

const freshDeck = () =>
  shuffle(buildDeck('classic').filter((card): card is NumberCard => card.kind === 'number' && card.value > 0))

let deck: NumberCard[] = []
const cards = ref<NumberCard[]>([])
const round = ref(1)
const banked = ref(0)
/** How the round ended, or null while you're still flipping. */
const ended = ref<'stayed' | 'bust' | 'streak' | null>(null)

const total = computed(() => cards.value.reduce((sum, card) => sum + card.value, 0))
const duplicate = computed(() => (ended.value === 'bust' ? cards.value.at(-1)!.value : null))
const over = computed(() => ended.value !== null && round.value === ROUNDS)

const status = computed(() => {
  if (ended.value === 'bust') return `Bust! A second ${duplicate.value}. Nothing this round.`
  if (ended.value === 'streak') return `Seven different numbers! ${total.value} + ${FLIP_7_BONUS} bonus.`
  if (ended.value === 'stayed') return `You kept ${total.value}.`
  return `Holding ${total.value}. Flip again or keep it?`
})

function deal() {
  cards.value = [deck.pop()!]
  ended.value = null
}

function restart() {
  deck = freshDeck()
  round.value = 1
  banked.value = 0
  deal()
}

function flip() {
  if (ended.value) return
  const card = deck.pop()!
  const bust = cards.value.some((held) => held.value === card.value)
  cards.value = [...cards.value, card]
  if (bust) ended.value = 'bust'
  else if (cards.value.length === STREAK) {
    ended.value = 'streak'
    banked.value += total.value + FLIP_7_BONUS
  }
}

function stay() {
  if (ended.value) return
  ended.value = 'stayed'
  banked.value += total.value
}

function nextRound() {
  round.value++
  deal()
}

restart()
</script>

<template>
  <DemoFrame label="flip or stay" :over="over ? `You banked ${banked} in ${ROUNDS} rounds.` : ''" @restart="restart">
    <p class="muted">Round {{ round }} of {{ ROUNDS }} · banked {{ banked }}</p>
    <div class="cards" :class="{ bust: ended === 'bust' }">
      <PlayingCard v-for="card in cards" :key="card.id" :card="card" :class="{ clash: card.value === duplicate }" />
    </div>
    <p class="status" aria-live="polite">{{ status }}</p>
    <div v-if="!ended" class="row">
      <button class="primary" @click="flip">Flip</button>
      <button @click="stay">Stay</button>
    </div>
    <button v-else-if="!over" class="primary" @click="nextRound">Next round</button>
  </DemoFrame>
</template>

<style scoped>
.cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
  min-height: 4.3rem;
}

.cards.bust :deep(.playing-card:not(.clash)) {
  opacity: 0.45;
}

.clash {
  outline: 3px solid var(--accent);
  outline-offset: 1px;
}

.status {
  font-weight: 700;
}

.row {
  justify-content: center;
}
</style>
