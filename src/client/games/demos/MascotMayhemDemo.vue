<script setup lang="ts">
// Practice for the lobby: back a mascot, slip one card into the deck and watch a short race.
import { computed, onBeforeUnmount, ref } from 'vue'
import { allCards, MASCOTS } from '../../../games/mascot-mayhem/data'
import type { RevealedCard } from '../../../games/mascot-mayhem/logic'
import { playNext, shuffle, startRace, type Mascot, type RaceCard, type RaceState } from '../../../games/mascot-mayhem/race'
import type { PublicPlayer } from '../../../shared/protocol'
import { ordinal } from '../mascot-mayhem/describe'
import MascotSprite from '../mascot-mayhem/MascotSprite.vue'
import RaceCardFace from '../mascot-mayhem/RaceCardFace.vue'
import RaceTrack from '../mascot-mayhem/RaceTrack.vue'
import DemoFrame from './DemoFrame.vue'

defineProps<{ you: string; players: PublicPlayer[] }>()

const CARD_DELAY_MS = 1000
const EXTRA_CARDS = 9
const HAND_SIZE = 3

type Step = 'back' | 'stack' | 'race' | 'done'

const step = ref<Step>('back')
const backed = ref<number | null>(null)
const hand = ref<RaceCard[]>([])
const mascots = ref<Mascot[]>([])
const back = ref(0)
const latest = ref<RevealedCard | null>(null)
const shownCard = ref<RaceCard | null>(null)
const cardsLeft = ref(0)
let pool: RaceCard[] = []
let race: RaceState | undefined
let timer: ReturnType<typeof setInterval> | undefined
let seq = 0

const backedName = computed(() => (backed.value === null ? '' : MASCOTS[backed.value]!.name))

const overLine = computed(() => {
  if (step.value !== 'done' || backed.value === null) return ''
  const mascot = mascots.value[backed.value]!
  if (mascot.status === 'out') return `${backedName.value} went out of the race. No payout.`
  if (mascot.place === 1) return `${backedName.value} won! Any ticket on them pays.`
  if (mascot.place !== null && mascot.place <= 3)
    return `${backedName.value} came ${ordinal(mascot.place)}. A safe ticket pays, a risky one doesn’t.`
  return `${backedName.value} came last. No payout.`
})

function restart() {
  clearInterval(timer)
  const cards = shuffle(allCards().filter((card) => !card.starter))
  hand.value = cards.slice(0, HAND_SIZE)
  pool = cards.slice(HAND_SIZE, HAND_SIZE + EXTRA_CARDS)
  backed.value = null
  mascots.value = []
  latest.value = null
  shownCard.value = null
  step.value = 'back'
}

function backMascot(index: number) {
  backed.value = index
  step.value = 'stack'
}

function show() {
  mascots.value = race!.mascots.map((mascot) => ({ ...mascot }))
  back.value = race!.back
  cardsLeft.value = race!.deck.length
}

function slip(card: RaceCard) {
  race = startRace([...allCards().filter((c) => c.starter), ...pool, card])
  show()
  step.value = 'race'
  timer = setInterval(flip, CARD_DELAY_MS)
}

function flip() {
  const { card, events } = playNext(race!)
  latest.value = { seq: ++seq, card, events }
  if (card) shownCard.value = card
  show()
  if (race!.over) {
    clearInterval(timer)
    step.value = 'done'
  }
}

restart()
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <DemoFrame label="bet and meddle" :over="overLine" @restart="restart">
    <template v-if="step === 'back'">
      <p class="ask">Who’s your money on?</p>
      <div class="picks">
        <button v-for="(mascot, index) in MASCOTS" :key="mascot.name" class="pick" @click="backMascot(index)">
          <svg viewBox="-26 -30 56 54" aria-hidden="true">
            <MascotSprite :animal="mascot.animal" :color="mascot.color" />
          </svg>
          {{ mascot.name }}
        </button>
      </div>
      <p class="muted">Nobody drives the mascots. Cards flipped from a shuffled deck move them.</p>
    </template>

    <template v-else-if="step === 'stack'">
      <p class="ask">You’re backing {{ backedName }}. Slip one card into the race deck.</p>
      <div class="picks">
        <RaceCardFace v-for="card in hand" :key="card.id" :card="card" pickable @click="slip(card)" />
      </div>
      <p class="muted">Help your pick or trip up a rival. A few cards are set aside unseen, so yours might not show up.</p>
    </template>

    <template v-else>
      <p class="ask">Your money’s on {{ backedName }}.</p>
      <div class="track">
        <RaceTrack :mascots="mascots" :back="back" :latest="latest" :countdown="0" />
      </div>
      <div class="now">
        <RaceCardFace v-if="shownCard" :key="shownCard.id" :card="shownCard" />
        <p class="muted">{{ step === 'race' ? `${cardsLeft} card${cardsLeft === 1 ? '' : 's'} left in the deck` : 'Race over' }}</p>
      </div>
    </template>
  </DemoFrame>
</template>

<style scoped>
.ask {
  font-weight: 700;
}

.picks {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.pick {
  display: grid;
  justify-items: center;
  width: 5rem;
  padding: 0.4rem 0.2rem;
}

.pick svg {
  width: 3rem;
}

.track {
  width: 100%;
  min-width: 0;
}

.now {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-height: 6rem;
}
</style>
