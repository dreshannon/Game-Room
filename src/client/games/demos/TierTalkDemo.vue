<script setup lang="ts">
// Practice for the lobby: guess how a made-up Wizard ranked four contenders.
import { computed, ref } from 'vue'
import { slotScore, TIERS, type Tier } from '../../../games/tier-talk/logic'
import type { PublicPlayer } from '../../../shared/protocol'
import DemoFrame from './DemoFrame.vue'

defineProps<{ you: string; players: PublicPlayer[] }>()

interface Round {
  category: string
  contenders: [string, Tier][]
}

const ROUNDS: Round[] = [
  { category: 'Being a pet in a small flat', contenders: [['A cat', 'S'], ['A parrot', 'B'], ['A goldfish', 'A'], ['A horse', 'D']] },
  { category: 'Lasting a week in the woods', contenders: [['A scout leader', 'S'], ['A house cat', 'A'], ['A chef', 'C'], ['A toddler', 'D']] },
  { category: 'Snacks for the cinema', contenders: [['Popcorn', 'S'], ['Chocolate', 'A'], ['Tacos', 'C'], ['Soup', 'D']] },
  { category: 'Keeping a secret', contenders: [['A lighthouse keeper', 'A'], ['A parrot', 'D'], ['A grandparent', 'B'], ['A spy', 'S']] },
]

const index = ref(Math.floor(Math.random() * ROUNDS.length))
const guesses = ref<(Tier | null)[]>([])
const revealed = ref(false)

const round = computed(() => ROUNDS[index.value]!)
const allPlaced = computed(() => guesses.value.every((tier) => tier !== null))
const scores = computed(() => round.value.contenders.map(([, actual], slot) => slotScore(guesses.value[slot]!, actual)))
const total = computed(() => scores.value.reduce((sum, points) => sum + points, 0))

function clear() {
  guesses.value = round.value.contenders.map(() => null)
  revealed.value = false
}

function restart() {
  index.value = (index.value + 1) % ROUNDS.length
  clear()
}

clear()
</script>

<template>
  <DemoFrame
    label="guess the ranking"
    :over="revealed ? `${total} of ${round.contenders.length * 2} points.` : ''"
    @restart="restart"
  >
    <p class="category">
      <span class="muted">The Wizard ranked these at</span>
      <strong>{{ round.category }}</strong>
    </p>
    <ul class="contenders">
      <li v-for="([name, actual], slot) in round.contenders" :key="name">
        <span class="name">{{ name }}</span>
        <span class="tier-buttons" role="group" :aria-label="`Your guess for ${name}`">
          <button
            v-for="tier in TIERS"
            :key="tier"
            class="tier-button"
            :class="[`tier-${tier}`, { picked: guesses[slot] === tier, actual: revealed && actual === tier }]"
            :aria-pressed="guesses[slot] === tier"
            :disabled="revealed"
            @click="guesses[slot] = tier"
          >
            {{ tier }}
          </button>
        </span>
        <span v-if="revealed" class="points">Wizard: {{ actual }} · +{{ scores[slot] }}</span>
      </li>
    </ul>
    <p v-if="!revealed" class="muted">S is best, D is worst. The exact tier scores 2, one tier off scores 1.</p>
    <button v-if="!revealed" class="primary" :disabled="!allPlaced" @click="revealed = true">Reveal the Wizard’s ranking</button>
  </DemoFrame>
</template>

<style scoped>
.category {
  display: grid;
}

.category strong {
  font-size: 1.2rem;
}

.contenders {
  display: grid;
  gap: 0.6rem;
  width: min(100%, 22rem);
  margin: 0;
  padding: 0;
  list-style: none;
}

.contenders li {
  display: grid;
  gap: 0.25rem;
  justify-items: start;
  text-align: left;
}

.name {
  font-weight: 700;
}

.tier-buttons {
  display: flex;
  gap: 0.3rem;
}

.tier-button {
  width: 2.5rem;
  padding: 0.35rem 0;
}

.tier-button:disabled {
  opacity: 0.55;
}

.tier-S {
  --tier: #ff7f7f;
}

.tier-A {
  --tier: #ffbf7f;
}

.tier-B {
  --tier: #ffdf7f;
}

.tier-C {
  --tier: #bfff7f;
}

.tier-D {
  --tier: #7fbfff;
}

.tier-button.picked {
  border-color: #222;
  background: var(--tier);
  color: #111;
}

.tier-button.picked:disabled,
.tier-button.actual:disabled {
  opacity: 1;
}

.tier-button.actual {
  outline: 3px solid var(--ink);
  outline-offset: 1px;
}

.points {
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
