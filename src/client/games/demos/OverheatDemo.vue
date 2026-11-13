<script setup lang="ts">
// Practice for the lobby: one car, one short road, two corners. Speed costs Heat in the corners.
import { computed, ref } from 'vue'
import type { Card } from '../../../games/overheat/logic'
import type { PublicPlayer } from '../../../shared/protocol'
import RaceCard from '../overheat/RaceCard.vue'
import DemoFrame from './DemoFrame.vue'

defineProps<{ you: string; players: PublicPlayer[] }>()

const FINISH = 18
const HAND_SIZE = 5
const MAX_CARDS = 4
const MAX_HEAT = 3
/** A corner's line sits just past the space `after`. Crossing it faster than `limit` costs Heat. */
const CORNERS = [
  { after: 5, limit: 3 },
  { after: 11, limit: 4 },
]

let nextId = 0
const draw = (): Card => ({ id: nextId++, kind: 'speed', value: 1 + Math.floor(Math.random() * 4) })

const hand = ref<Card[]>([])
const chosen = ref<number[]>([])
const position = ref(0)
const heat = ref(MAX_HEAT)
const rounds = ref(0)
const note = ref('')

const speed = computed(() => hand.value.filter((card) => chosen.value.includes(card.id)).reduce((sum, card) => sum + card.value, 0))
const finished = computed(() => position.value >= FINISH)

/** Works out a move at this speed: where the car ends up, the Heat left and what happened on the way. */
function drive(moved: number, cardCount: number) {
  const lines: string[] = []
  let left = heat.value
  let paid = 0
  let spun = false
  // Easing off with a single card lets the engine cool.
  if (cardCount === 1 && left < MAX_HEAT) {
    left++
    lines.push('Cooled 1 Heat.')
  }
  let end = position.value + moved
  for (const corner of CORNERS) {
    if (position.value > corner.after || end <= corner.after) continue
    const over = Math.max(0, moved - corner.limit)
    if (over === 0) {
      lines.push(`Through the ${corner.limit} corner cleanly.`)
    } else if (over <= left) {
      left -= over
      paid += over
      lines.push(`${over} over the ${corner.limit} corner: paid ${over} Heat.`)
    } else {
      left = 0
      end = corner.after
      spun = true
      lines.push(`${over} over the ${corner.limit} corner without the Heat to pay. You spin out before it and lose your Heat.`)
      break
    }
  }
  return { end: Math.min(FINISH, end), heat: left, paid, spun, lines }
}

/** What the chosen cards would do, before you commit. */
const plan = computed(() => drive(speed.value, chosen.value.length))

const preview = computed(() => {
  if (!chosen.value.length) return 'Pick 1 to 4 cards. Your speed is their total.'
  if (plan.value.spun) return `Speed ${speed.value}: too fast for the corner. You’d spin out.`
  const cool = chosen.value.length === 1 && heat.value < MAX_HEAT ? ' One card cools 1 Heat.' : ''
  if (plan.value.paid) return `Speed ${speed.value}: the corner costs ${plan.value.paid} Heat.${cool}`
  return `Speed ${speed.value}.${cool}`
})

function toggle(id: number) {
  if (finished.value) return
  if (chosen.value.includes(id)) chosen.value = chosen.value.filter((other) => other !== id)
  else if (chosen.value.length < MAX_CARDS) chosen.value = [...chosen.value, id]
}

function go() {
  const result = plan.value
  rounds.value++
  note.value = [`Speed ${speed.value}.`, ...result.lines].join(' ')
  position.value = result.end
  heat.value = result.heat
  hand.value = hand.value.filter((card) => !chosen.value.includes(card.id))
  while (hand.value.length < HAND_SIZE) hand.value.push(draw())
  chosen.value = []
}

function restart() {
  hand.value = Array.from({ length: HAND_SIZE }, draw)
  chosen.value = []
  position.value = 0
  heat.value = MAX_HEAT
  rounds.value = 0
  note.value = ''
}

restart()
</script>

<template>
  <DemoFrame
    label="take the corners"
    :over="finished ? `Over the line in ${rounds} rounds. Can you do it in fewer?` : ''"
    @restart="restart"
  >
    <div class="gauges">
      <span>Round {{ rounds + 1 }}</span>
      <span class="heat" :aria-label="`${heat} Heat left`">
        Heat
        <span v-for="n in MAX_HEAT" :key="n" class="pip" :class="{ spent: n > heat }" aria-hidden="true"></span>
      </span>
    </div>

    <div class="road" :style="{ '--spaces': FINISH + 1 }" role="img" :aria-label="`Your car is on space ${position} of ${FINISH}`">
      <span
        v-for="corner in CORNERS"
        :key="corner.after"
        class="limit"
        :style="{ gridColumn: `${corner.after + 1} / span 2` }"
      >
        {{ corner.limit }}
      </span>
      <span
        v-for="space in FINISH + 1"
        :key="space"
        class="space"
        :class="{
          corner: CORNERS.some((c) => c.after === space - 1),
          finish: space - 1 === FINISH,
          reach: !finished && chosen.length > 0 && space - 1 === plan.end,
        }"
      >
        <span v-if="space - 1 === position" class="car"></span>
      </span>
    </div>
    <p class="muted key">The numbers are corner speed limits. Each point over costs 1 Heat.</p>

    <template v-if="!finished">
      <div class="hand">
        <RaceCard
          v-for="card in hand"
          :key="card.id"
          :card="card"
          small
          :selected="chosen.includes(card.id)"
          @click="toggle(card.id)"
        />
      </div>
      <p class="preview">{{ preview }}</p>
      <button class="primary" :disabled="!chosen.length" @click="go">Go</button>
    </template>
    <p v-if="note" class="note muted" aria-live="polite">{{ note }}</p>
  </DemoFrame>
</template>

<style scoped>
.gauges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  font-weight: 700;
}

.heat {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.pip {
  width: 0.9rem;
  height: 0.9rem;
  border: 2px solid var(--accent);
  border-radius: 50%;
  background: var(--accent);
}

.pip.spent {
  background: transparent;
}

.road {
  display: grid;
  grid-template-columns: repeat(var(--spaces), 1fr);
  row-gap: 0.2rem;
  width: 100%;
  max-width: 30rem;
}

.limit {
  grid-row: 1;
  justify-self: center;
  min-width: 1.4rem;
  border-radius: 999px;
  background: var(--ink);
  color: var(--paper);
  font-size: 0.8rem;
  font-weight: 800;
}

.space {
  grid-row: 2;
  display: grid;
  place-items: center;
  min-width: 0;
  height: 1.8rem;
  border: 1px solid var(--line);
  border-left-width: 0;
  background: var(--surface);
}

.space:first-of-type {
  border-left-width: 1px;
}

.space.corner {
  border-right: 3px solid var(--ink);
}

.space.finish {
  background: repeating-conic-gradient(var(--ink) 0 25%, var(--surface) 0 50%) 0 0 / 8px 8px;
}

.space.reach {
  background: var(--accent-soft);
}

.car {
  width: 80%;
  max-width: 1rem;
  height: 1.1rem;
  border-radius: 0.3rem;
  background: var(--accent);
}

.key {
  font-size: 0.9rem;
}

.hand {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
}

.preview {
  font-weight: 700;
}

.note {
  font-size: 0.9rem;
}
</style>
