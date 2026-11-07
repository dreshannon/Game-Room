<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MASCOTS, MASCOT_TICKETS, sideTicketValues } from '../../../games/mascot-mayhem/data'
import {
  NO_PILE,
  POTS,
  RACES,
  YES_PILE,
  lifeOutcome,
  type MayhemMove,
  type MayhemView,
  type Side,
} from '../../../games/mascot-mayhem/logic'
import type { PublicPlayer } from '../../../shared/protocol'
import { commentary, describeCard, ordinal, pileName } from './describe'
import MascotSprite from './MascotSprite.vue'
import RaceCardFace from './RaceCardFace.vue'
import RaceTrack from './RaceTrack.vue'

const props = defineProps<{
  view: MayhemView
  you: string
  players: PublicPlayer[]
  hostId?: string | null
}>()

const emit = defineEmits<{ move: [move: MayhemMove] }>()

const nameOf = (id: string) => props.players.find((p) => p.id === id)?.name ?? 'Someone'
const youOr = (id: string) => (id === props.you ? 'You' : nameOf(id))
const isHost = computed(() => props.hostId === props.you)
const me = computed(() => props.view.players.find((p) => p.id === props.you) ?? null)
const phase = computed(() => props.view.phase)
const pots = computed(() => props.view.mode === 'pots')

const mascotOf = (pile: number): (typeof MASCOTS)[number] => MASCOTS[pile]!
const pileColor = (pile: number) => (pile < MASCOTS.length ? MASCOTS[pile]!.color : pile === YES_PILE ? '#1b998b' : '#6c757d')

// ---- The race ----

const latest = computed(() => props.view.revealed.at(-1) ?? null)
const latestCard = computed(() => [...props.view.revealed].reverse().find((r) => r.card)?.card ?? null)
const latestCardSeq = computed(() => [...props.view.revealed].reverse().find((r) => r.card)?.seq ?? 0)

const callLines = computed(() => {
  const lines: { key: string; text: string; big: boolean }[] = []
  for (const reveal of [...props.view.revealed].reverse()) {
    for (const [i, event] of reveal.events.entries()) {
      const text = commentary(event)
      if (text) lines.push({ key: `${reveal.seq}-${i}`, text, big: ['collide', 'out', 'finish', 'fold'].includes(event.kind) })
    }
    if (reveal.card && !reveal.events.some((e) => commentary(e))) {
      lines.push({ key: `${reveal.seq}-card`, text: describeCard(reveal.card).text + '.', big: false })
    }
    if (lines.length >= 6) break
  }
  return lines.slice(0, 6)
})

const SPEEDS = ['Slow', 'Normal', 'Fast']

// ---- Tickets ----

const ticketSummary = (ticket: { pile: number; side: Side }) => `${pileName(ticket.pile)} · ${ticket.side}`

/** What a held ticket pays, in words. */
function ticketPays(ticket: { pile: number; rank: number; side: Side; doubled: boolean }) {
  const times = ticket.doubled ? ' (doubled)' : ''
  if (ticket.pile < MASCOTS.length) {
    const values = MASCOT_TICKETS[ticket.rank]!
    return ticket.side === 'risky'
      ? `Win: $${values.risky}${times}`
      : `1st $${values.safe[0]} · 2nd $${values.safe[1]} · 3rd $${values.safe[2]}${times}`
  }
  const chance = ticket.pile === YES_PILE ? props.view.sideBet.chance : 1 - props.view.sideBet.chance
  const values = sideTicketValues(chance, ticket.rank)
  return ticket.side === 'risky'
    ? `Right: $${values.risky} · wrong: −$${values.riskyLoss}${times}`
    : `Right: $${values.safe}${times}`
}

const yourPick = computed(() => phase.value === 'draft' && props.view.draftOrder[props.view.draftIndex] === props.you)
const picker = computed(() => (phase.value === 'draft' ? props.view.draftOrder[props.view.draftIndex] ?? null : null))
const upcoming = computed(() => props.view.draftOrder.slice(props.view.draftIndex, props.view.draftIndex + 8))

function take(pile: number, side: Side) {
  emit('move', { type: 'take', pile, side })
}

// ---- Adding a card to the deck ----

const picked = ref<number[]>([])
watch(
  () => [props.view.race, phase.value].join(':'),
  () => {
    picked.value = []
    potPicks.value = []
    potDouble.value = null
  },
)

function toggleCard(id: number) {
  const i = picked.value.indexOf(id)
  if (i !== -1) picked.value.splice(i, 1)
  else if (picked.value.length < props.view.stackCount) picked.value.push(id)
  else if (props.view.stackCount === 1) picked.value = [id]
}

// ---- Pots mode bets ----

const potPicks = ref<number[]>([])
const potDouble = ref<number | null>(null)
const lastRace = computed(() => props.view.race === RACES)

function addPotPick(pile: number) {
  if (potPicks.value.length < 2) potPicks.value.push(pile)
}

function placeBets() {
  emit('move', {
    type: 'bets',
    piles: [...potPicks.value],
    ...(lastRace.value ? { double: potDouble.value ?? 0 } : {}),
  })
}

// ---- Status ----

const status = computed(() => {
  const view = props.view
  switch (phase.value) {
    case 'draft':
      return yourPick.value ? 'Your pick! Take a ticket, safe or risky.' : `${nameOf(picker.value!)} is picking a ticket…`
    case 'double':
      return me.value?.doubled ? 'Waiting for everyone to double a ticket…' : 'Last race! Pick one ticket to double.'
    case 'bets':
      return me.value?.betPlaced
        ? `Bets are in. Waiting for ${view.players.filter((p) => !p.betPlaced).length} more…`
        : 'Pick two bets. You can pick the same one twice.'
    case 'stack':
      return me.value?.stacked
        ? 'Your card is in. Waiting for the others…'
        : `Secretly slip ${view.stackCount === 1 ? 'a card' : `${view.stackCount} cards`} into the race deck.`
    case 'race':
      if (view.countdown > 0) return 'On your marks…'
      return view.paused ? 'The race is paused.' : 'They’re off!'
    case 'results':
      return 'Race over! Here’s how the bets paid out.'
    case 'over':
      return 'That’s the last race. Final standings:'
  }
  return ''
})

const placesInOrder = computed(() => {
  const places = props.view.places
  if (!places) return []
  return places
    .map((place, index) => ({ place, index, mascot: props.view.mascots[index]! }))
    .sort((a, b) => a.place - b.place)
})

const standings = computed(() => [...props.view.players].sort((a, b) => b.money - a.money))

const lineText = (line: { pile: number; side: Side | null; doubled: boolean; amount: number }) =>
  `${pileName(line.pile)}${line.side ? ` (${line.side})` : ''}${line.doubled ? ' ×2' : ''}`

const money = (n: number) => (n < 0 ? `−$${Math.abs(n)}` : `$${n}`)
</script>

<template>
  <div class="mayhem">
    <div class="topline">
      <p class="eyebrow">Race {{ view.race }} of {{ RACES }}<template v-if="pots"> · Big group: shared pots</template></p>
      <p class="side-bet">
        <span class="label">Side bet</span>
        {{ view.sideBet.question }}
        <strong v-if="view.sideResult !== null" :class="view.sideResult ? 'yes' : 'no'">{{ view.sideResult ? 'Yes!' : 'No!' }}</strong>
      </p>
    </div>

    <div class="stage" :class="{ racing: phase === 'race' || phase === 'results' || phase === 'over' }">
      <RaceTrack :mascots="view.mascots" :back="view.back" :latest="latest" :countdown="view.countdown" />
      <aside v-if="phase === 'race' || latestCard" class="now-card">
        <RaceCardFace v-if="latestCard" :key="latestCardSeq" :card="latestCard" size="big" />
        <div v-else class="card-back"><span>?</span></div>
        <p class="muted small">{{ view.deckLeft }} card{{ view.deckLeft === 1 ? '' : 's' }} left<template v-if="view.folds"> · folded {{ view.folds }}×</template></p>
      </aside>
    </div>

    <div v-if="phase === 'race'" class="race-bar">
      <ul class="calls" aria-live="polite">
        <li v-for="(line, i) in callLines" :key="line.key" :class="{ big: line.big, latest: i === 0 }">{{ line.text }}</li>
        <li v-if="!callLines.length" class="muted">3… 2… 1…</li>
      </ul>
      <div v-if="isHost" class="controls row">
        <button @click="emit('move', { type: 'pause', paused: !view.paused })">{{ view.paused ? '▶ Resume' : '⏸ Pause' }}</button>
        <button
          v-for="(label, i) in SPEEDS"
          :key="label"
          class="speed"
          :class="{ chosen: view.speed === i }"
          :aria-pressed="view.speed === i"
          @click="emit('move', { type: 'speed', speed: i })"
        >
          {{ label }}
        </button>
      </div>
    </div>

    <p class="status" aria-live="polite">{{ status }}</p>

    <div class="panels">
      <section class="main-panel">
        <!-- The ticket draft -->
        <template v-if="phase === 'draft'">
          <ol class="order">
            <li v-for="(id, i) in upcoming" :key="`${i}-${id}`" :class="{ now: i === 0, you: id === you }">{{ youOr(id) }}</li>
          </ol>
          <div class="piles">
            <article v-for="offer in view.offers" :key="offer.pile" class="pile" :style="{ '--pile': pileColor(offer.pile) }" :class="{ empty: offer.left === 0 }">
              <header>
                <svg v-if="offer.pile < 4" viewBox="-26 -30 56 54" class="pile-face" aria-hidden="true">
                  <MascotSprite :animal="MASCOTS[offer.pile]!.animal" :color="MASCOTS[offer.pile]!.color" />
                </svg>
                <span v-else class="yesno">{{ offer.pile === YES_PILE ? 'YES' : 'NO' }}</span>
                <strong>{{ offer.pile < 4 ? MASCOTS[offer.pile]!.name : offer.pile === YES_PILE ? 'Yes, it will' : 'No, it won’t' }}</strong>
                <span class="left">{{ offer.left }} left</span>
              </header>
              <template v-if="offer.mascot">
                <p class="side"><span class="tag safe">Safe</span> 1st ${{ offer.mascot.safe[0] }} · 2nd ${{ offer.mascot.safe[1] }} · 3rd ${{ offer.mascot.safe[2] }}</p>
                <p class="side"><span class="tag risky">Risky</span> Win only: ${{ offer.mascot.risky }}</p>
              </template>
              <template v-else-if="offer.side">
                <p class="side"><span class="tag safe">Safe</span> Right: ${{ offer.side.safe }}</p>
                <p class="side"><span class="tag risky">Risky</span> Right: ${{ offer.side.risky }} · wrong: −${{ offer.side.riskyLoss }}</p>
              </template>
              <p v-else class="muted">All taken</p>
              <div v-if="yourPick && offer.left > 0" class="row">
                <button class="primary" @click="take(offer.pile, 'safe')">Take safe</button>
                <button @click="take(offer.pile, 'risky')">Take risky</button>
              </div>
            </article>
          </div>
        </template>

        <!-- Your tickets, to cheer on during the race -->
        <template v-if="me && me.tickets.length && ['race', 'stack', 'double'].includes(phase)">
          <h3>Your tickets</h3>
          <ul class="my-tickets">
            <li v-for="(t, i) in me.tickets" :key="i" :style="{ '--pile': pileColor(t.pile) }">
              <strong>{{ pileName(t.pile) }}</strong>
              <span class="tag" :class="t.side">{{ t.side }}</span>
              <span class="muted">{{ ticketPays(t) }}</span>
            </li>
          </ul>
        </template>
        <template v-if="me && me.bets && phase === 'race'">
          <h3>Your bets</h3>
          <ul class="my-tickets">
            <li v-for="(b, i) in me.bets" :key="i" :style="{ '--pile': pileColor(b.pile) }">
              <strong>{{ pileName(b.pile) }}</strong><span v-if="b.doubled" class="muted"> (doubled)</span>
            </li>
          </ul>
        </template>

        <!-- Doubling a ticket in the last race -->
        <template v-if="phase === 'double' && me && !me.doubled">
          <div class="row">
            <button v-for="(ticket, i) in me.tickets" :key="i" class="ticket-button" :style="{ '--pile': pileColor(ticket.pile) }" @click="emit('move', { type: 'double', index: i })">
              Double {{ ticketSummary(ticket) }}
            </button>
          </div>
        </template>

        <!-- Pots mode betting -->
        <template v-if="phase === 'bets' && me && !me.betPlaced">
          <div class="pot-choices">
            <button v-for="pile in [0, 1, 2, 3, YES_PILE, NO_PILE]" :key="pile" class="pot-button" :style="{ '--pile': pileColor(pile) }" :disabled="potPicks.length >= 2" @click="addPotPick(pile)">
              <svg v-if="pile < 4" viewBox="-26 -30 56 54" class="pile-face" aria-hidden="true">
                <MascotSprite :animal="mascotOf(pile).animal" :color="mascotOf(pile).color" />
              </svg>
              {{ pileName(pile) }}
            </button>
          </div>
          <p class="muted">Pots: 1st ${{ POTS.first }}, 2nd ${{ POTS.second }}, 3rd ${{ POTS.third }}, side bet ${{ POTS.side }}. Winners split each pot.</p>
          <div v-if="potPicks.length" class="row picks">
            <span v-for="(pile, i) in potPicks" :key="i" class="chip" :style="{ '--pile': pileColor(pile) }">
              {{ pileName(pile) }}
              <label v-if="lastRace"><input v-model="potDouble" type="radio" :value="i" name="double" /> double</label>
            </span>
            <button @click="potPicks = []">Clear</button>
            <button class="primary" :disabled="potPicks.length !== 2 || (lastRace && potDouble === null)" @click="placeBets">Place bets</button>
          </div>
        </template>
        <template v-if="phase === 'bets' && view.openDeck">
          <h3>This race’s deck, face up</h3>
          <div class="deck-row">
            <RaceCardFace v-for="card in view.openDeck" :key="card.id" :card="card" size="small" />
          </div>
        </template>

        <!-- Slipping cards into the deck -->
        <template v-if="(phase === 'stack' || phase === 'draft' || phase === 'double') && view.hand.length">
          <h3>Your hand</h3>
          <div class="hand">
            <RaceCardFace
              v-for="card in view.hand"
              :key="card.id"
              :card="card"
              :pickable="phase === 'stack' && !me?.stacked"
              :selected="picked.includes(card.id)"
              @click="phase === 'stack' && !me?.stacked && toggleCard(card.id)"
            />
          </div>
          <div v-if="phase === 'stack' && me && !me.stacked" class="row">
            <button class="primary" :disabled="picked.length !== view.stackCount" @click="emit('move', { type: 'stack', cards: [...picked] })">
              Slip {{ view.stackCount === 1 ? 'it' : 'them' }} into the deck
            </button>
          </div>
        </template>

        <!-- Results -->
        <template v-if="phase === 'results' || phase === 'over'">
          <ol class="finish-order">
            <li v-for="row in placesInOrder" :key="row.index" :style="{ '--pile': MASCOTS[row.index]!.color }">
              <span class="place">{{ ordinal(row.place) }}</span>
              <svg viewBox="-26 -30 56 54" class="pile-face" aria-hidden="true">
                <MascotSprite :animal="MASCOTS[row.index]!.animal" :color="MASCOTS[row.index]!.color" :out="row.mascot.status === 'out'" />
              </svg>
              {{ MASCOTS[row.index]!.name }}
              <span v-if="row.mascot.status === 'out'" class="muted small">out</span>
            </li>
          </ol>
          <table class="payouts">
            <thead>
              <tr><th>Player</th><th>Bets</th><th>This race</th><th>Total</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in standings" :key="p.id" :class="{ you: p.id === you }">
                <td>{{ youOr(p.id) }}</td>
                <td>
                  <span v-for="(line, i) in p.lines" :key="i" class="line" :class="{ win: line.amount > 0, loss: line.amount < 0 }">
                    {{ lineText(line) }}: {{ money(line.amount) }}
                  </span>
                </td>
                <td :class="{ win: (p.history.at(-1) ?? 0) > 0, loss: (p.history.at(-1) ?? 0) < 0 }">{{ money(p.history.at(-1) ?? 0) }}</td>
                <td><strong>${{ p.money }}</strong></td>
              </tr>
            </tbody>
          </table>
          <template v-if="phase === 'over'">
            <h3>What happens next</h3>
            <ul class="fates">
              <li v-for="p in standings" :key="p.id"><strong>{{ youOr(p.id) }}</strong> (${{ p.money }}): {{ lifeOutcome(p.money) }}</li>
            </ul>
          </template>
          <div v-if="phase === 'results'" class="row">
            <button v-if="isHost" class="primary" @click="emit('move', { type: 'nextRace', race: view.race })">Next race</button>
            <p v-else class="muted">Waiting for the host to start the next race…</p>
          </div>
        </template>
      </section>

      <section class="side-panel">
        <h2>Bettors</h2>
        <ul class="bettors">
          <li v-for="p in standings" :key="p.id" :class="{ you: p.id === you, now: p.id === picker }">
            <span class="name">{{ youOr(p.id) }}</span>
            <strong class="cash">${{ p.money }}</strong>
            <span class="tickets">
              <span v-for="(t, i) in p.tickets" :key="i" class="mini" :style="{ '--pile': pileColor(t.pile) }" :title="ticketSummary(t)">
                {{ t.pile < 4 ? MASCOTS[t.pile]!.name[0] : t.pile === YES_PILE ? 'Y' : 'N' }}{{ t.side === 'risky' ? '!' : '' }}{{ t.doubled ? '×2' : '' }}
              </span>
              <template v-if="p.bets">
                <span v-for="(b, i) in p.bets" :key="`b${i}`" class="mini" :style="{ '--pile': pileColor(b.pile) }" :title="pileName(b.pile)">
                  {{ b.pile < 4 ? MASCOTS[b.pile]!.name[0] : b.pile === YES_PILE ? 'Y' : 'N' }}{{ b.doubled ? '×2' : '' }}
                </span>
              </template>
            </span>
            <span v-if="phase === 'stack'" class="state">{{ p.stacked ? '✓' : '…' }}</span>
            <span v-if="phase === 'bets'" class="state">{{ p.betPlaced ? '✓' : '…' }}</span>
            <span v-if="phase === 'double'" class="state">{{ p.doubled ? '✓' : '…' }}</span>
          </li>
        </ul>
        <p class="muted small">A ! means a risky ticket. Y and N are side bets.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.mayhem {
  display: grid;
  gap: 0.75rem;
  width: 100%;
}

.topline {
  display: grid;
  gap: 0.35rem;
}

.side-bet {
  font-weight: 600;
}

.side-bet .label,
h3 {
  margin: 0 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.side-bet .yes {
  color: #1b998b;
}

.side-bet .no {
  color: #e5383b;
}

.stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
}

@media (max-width: 760px) {
  .stage {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
  }
}

.now-card {
  display: grid;
  justify-items: center;
  gap: 0.4rem;
}

@media (max-width: 760px) {
  .now-card :deep(.big) {
    width: 6.5rem;
    min-height: 8.5rem;
  }

  .now-card :deep(.big .band) {
    height: 2.8rem;
  }

  .now-card :deep(.big .face) {
    width: 3rem;
    height: 3rem;
  }

  .now-card :deep(.big .symbol) {
    font-size: 2.4rem;
  }

  .card-back {
    width: 6.5rem;
    height: 8.5rem;
  }
}

.card-back {
  display: grid;
  place-items: center;
  width: 9rem;
  height: 12.5rem;
  border-radius: 0.7rem;
  background: repeating-linear-gradient(45deg, var(--accent) 0 10px, color-mix(in srgb, var(--accent) 75%, #000) 10px 20px);
  color: #fff;
  font-size: 3rem;
  font-weight: 900;
}

.race-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.controls {
  align-items: center;
}

.controls button {
  padding: 0.4rem 0.75rem;
}

.my-tickets {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-tickets li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.6rem;
  border-left: 6px solid var(--pile);
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--pile) 10%, transparent);
}

.calls {
  display: grid;
  gap: 0.15rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.calls li {
  color: var(--muted);
}

.calls li.latest {
  color: var(--ink);
  font-size: 1.15rem;
  font-weight: 700;
}

.calls li.big.latest {
  color: var(--accent);
  font-size: 1.35rem;
  font-weight: 900;
  animation: shout 0.4s ease-out;
}

@keyframes shout {
  from {
    transform: scale(1.15);
  }
  to {
    transform: scale(1);
  }
}

.controls .chosen {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.status {
  font-size: 1.1rem;
  font-weight: 700;
}

.panels {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(15rem, 1fr);
  gap: 1rem;
  align-items: start;
}

@media (max-width: 860px) {
  .panels {
    grid-template-columns: minmax(0, 1fr);
  }
}

.main-panel,
.side-panel {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.order {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.order li {
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  background: var(--line);
  font-size: 0.85rem;
}

.order li.now {
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
}

.order li.you:not(.now) {
  outline: 2px solid var(--accent);
}

.piles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
  gap: 0.6rem;
}

.pile {
  --pile: #888;
  display: grid;
  gap: 0.35rem;
  padding: 0.6rem 0.7rem;
  border: 2px solid var(--pile);
  border-left-width: 8px;
  border-radius: 0.6rem;
}

.pile.empty {
  opacity: 0.5;
}

.pile header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.pile .left {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.8rem;
}

.pile-face {
  width: 2.2rem;
  height: 2.2rem;
  flex: none;
}

.yesno {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 1.6rem;
  border-radius: 0.3rem;
  background: var(--pile);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 900;
}

.side {
  font-size: 0.9rem;
}

.tag {
  display: inline-block;
  min-width: 3.2rem;
  margin-right: 0.3rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  text-align: center;
  text-transform: uppercase;
}

.tag.safe {
  background: #d8f3dc;
  color: #1b4332;
}

.tag.risky {
  background: #ffd6d6;
  color: #9d0208;
}

.pile .row button {
  padding: 0.4rem 0.7rem;
  font-size: 0.9rem;
}

.ticket-button,
.pot-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-color: var(--pile);
  border-left-width: 6px;
}

.pot-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.7rem;
  border: 2px solid var(--pile);
  border-radius: 999px;
}

.picks {
  align-items: center;
}

.hand,
.deck-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.finish-order {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.finish-order li {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 700;
}

.place {
  color: var(--muted);
  font-weight: 900;
}

.payouts {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.payouts th,
.payouts td {
  padding: 0.35rem 0.4rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.payouts tr.you td:first-child {
  font-weight: 800;
}

.line {
  display: block;
  color: var(--muted);
}

.win {
  color: #1b998b;
  font-weight: 700;
}

.loss {
  color: #e5383b;
  font-weight: 700;
}

.fates {
  display: grid;
  gap: 0.3rem;
  margin: 0;
  padding-left: 1.1rem;
}

.side-panel h2 {
  font-size: 1rem;
}

.bettors {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bettors li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.4rem;
  border-radius: 0.4rem;
}

.bettors li.now {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.bettors li.you .name {
  font-weight: 800;
}

.cash {
  color: #1b998b;
}

.tickets {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.2rem;
}

.mini {
  --pile: #888;
  padding: 0 0.35rem;
  border-radius: 0.3rem;
  background: var(--pile);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 900;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.45);
}

.state {
  margin-left: auto;
  color: var(--muted);
}

.small {
  font-size: 0.8rem;
}
</style>
