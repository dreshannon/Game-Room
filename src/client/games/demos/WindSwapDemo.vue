<script setup lang="ts">
// Practice for the lobby: a two-ship duel against a bot, to learn how winds move ships and change hands.
import { computed, onBeforeUnmount, ref } from 'vue'
import { HOME_PORT, SIZE, targetsFor, windById, WINDS, type Seat, type Ship } from '../../../games/wind-swap/logic'
import type { PublicPlayer } from '../../../shared/protocol'
import WindCard from '../wind-swap/WindCard.vue'
import DemoFrame from './DemoFrame.vue'

defineProps<{ you: string; players: PublicPlayer[] }>()

const YOU: Seat = 0
const BOT: Seat = 1
const BOT_DELAY_MS = 1100

const board = ref<(Ship | null)[]>([])
const hands = ref<[string[], string[]]>([[], []])
const middle = ref('')
const turn = ref<Seat>(YOU)
const picked = ref<number | null>(null)
const last = ref<number[]>([])
const note = ref('')
const outcome = ref<'won' | 'lost' | null>(null)
let botTimer: ReturnType<typeof setTimeout> | undefined

const windName = (id: string) => windById(id)?.name ?? id

/** Every move a fleet has: which wind takes which ship where. */
function movesFor(seat: Seat) {
  const moves: { wind: string; from: number; to: number }[] = []
  for (const wind of hands.value[seat])
    board.value.forEach((ship, from) => {
      if (ship?.seat !== seat) return
      for (const to of targetsFor(board.value, seat, from, wind)) moves.push({ wind, from, to })
    })
  return moves
}

/** Where the picked ship can go, and the wind that takes it there. */
const reach = computed(() => {
  const squares = new Map<number, string>()
  if (picked.value === null || turn.value !== YOU || outcome.value) return squares
  for (const move of movesFor(YOU)) if (move.from === picked.value && !squares.has(move.to)) squares.set(move.to, move.wind)
  return squares
})

const status = computed(() => {
  if (outcome.value) return outcome.value === 'won' ? 'You win!' : 'The bot wins.'
  if (turn.value === BOT) return 'The bot is thinking…'
  return picked.value === null ? 'Your turn: pick a ship' : 'Pick a lit square'
})

const overLine = computed(() => {
  if (!outcome.value) return ''
  return outcome.value === 'won' ? 'Nicely sailed.' : 'Watch which winds you hand over.'
})

/** Uses a wind, then swaps it with the one drifting in the middle. */
function swap(seat: Seat, wind: string) {
  const hand = hands.value[seat]
  hand[hand.indexOf(wind)] = middle.value
  middle.value = wind
}

function sail(seat: Seat, move: { wind: string; from: number; to: number }) {
  const ship = board.value[move.from]!
  const sunk = board.value[move.to]
  board.value[move.to] = ship
  board.value[move.from] = null
  last.value = [move.from, move.to]
  swap(seat, move.wind)
  const who = seat === YOU ? 'You' : 'The bot'
  note.value = `${who} used ${windName(move.wind)}${sunk ? ' and sank a ship' : ''}. It drifts to the middle.`
  if (sunk?.captain || (ship.captain && move.to === HOME_PORT[seat === YOU ? BOT : YOU])) {
    outcome.value = seat === YOU ? 'won' : 'lost'
    return
  }
  startTurn(seat === YOU ? BOT : YOU)
}

function startTurn(seat: Seat) {
  turn.value = seat
  picked.value = null
  const moves = movesFor(seat)
  if (seat === BOT) {
    botTimer = setTimeout(() => botMove(moves), BOT_DELAY_MS)
    return
  }
  if (!moves.length) {
    // Nowhere to sail: a wind is given away instead.
    const wind = hands.value[YOU][0]!
    swap(YOU, wind)
    note.value = `You had no move, so ${windName(wind)} drifts to the middle.`
    startTurn(BOT)
  }
}

/** The bot sinks a ship when it can, your captain first. Otherwise it sails anywhere. */
function botMove(moves: { wind: string; from: number; to: number }[]) {
  if (!moves.length) {
    swap(BOT, hands.value[BOT][0]!)
    note.value = 'The bot had no move and gave a wind away.'
    startTurn(YOU)
    return
  }
  const move =
    moves.find((m) => board.value[m.to]?.captain) ??
    moves.find((m) => board.value[m.to]) ??
    moves[Math.floor(Math.random() * moves.length)]!
  sail(BOT, move)
}

function clickSquare(square: number) {
  if (turn.value !== YOU || outcome.value) return
  const wind = reach.value.get(square)
  if (wind) sail(YOU, { wind, from: picked.value!, to: square })
  else if (board.value[square]?.seat === YOU) picked.value = picked.value === square ? null : square
}

function restart() {
  clearTimeout(botTimer)
  const fresh: (Ship | null)[] = Array.from({ length: SIZE * SIZE }, () => null)
  fresh[HOME_PORT[YOU]] = { seat: YOU, captain: true }
  fresh[HOME_PORT[YOU] - 1] = { seat: YOU, captain: false }
  fresh[HOME_PORT[BOT]] = { seat: BOT, captain: true }
  fresh[HOME_PORT[BOT] + 1] = { seat: BOT, captain: false }
  board.value = fresh
  const deal = WINDS.map((wind) => wind.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 5)
  hands.value = [deal.slice(0, 2), deal.slice(2, 4)]
  middle.value = deal[4]!
  last.value = []
  note.value = ''
  outcome.value = null
  startTurn(YOU)
}

restart()
onBeforeUnmount(() => clearTimeout(botTimer))
</script>

<template>
  <DemoFrame label="you against a bot" :over="overLine" @restart="restart">
    <div class="winds">
      <span class="muted">Bot’s winds</span>
      <WindCard v-for="wind in hands[1]" :key="wind" :wind="wind" flipped disabled />
    </div>

    <p class="status" aria-live="polite">{{ status }}</p>
    <div class="board" role="grid" aria-label="The bay">
      <button
        v-for="(ship, square) in board"
        :key="square"
        class="square"
        :class="{
          port: square === HOME_PORT[0] || square === HOME_PORT[1],
          mine: ship?.seat === 0 && turn === 0 && !outcome,
          picked: picked === square,
          target: reach.has(square),
          last: last.includes(square),
        }"
        :aria-label="`Square ${square + 1}${ship ? `: ${ship.seat === 0 ? 'your' : 'bot’s'} ${ship.captain ? 'captain' : 'ship'}` : ''}${reach.has(square) ? ', can sail here' : ''}`"
        @click="clickSquare(square)"
      >
        <svg v-if="ship" viewBox="0 0 40 40" class="ship" :class="`fleet-${ship.seat}`">
          <path class="sail" d="M20 6 L20 26 L9 26 Z" />
          <path v-if="ship.captain" class="sail" d="M22 9 L22 26 L31 26 Z" />
          <path class="hull" d="M5 28 H35 L30 35 H10 Z" />
          <path v-if="ship.captain" class="flag" d="M20 3 L27 5 L20 7 Z" />
        </svg>
        <span v-else-if="reach.has(square)" class="ring" />
      </button>
    </div>
    <p class="note muted" aria-live="polite">{{ note || 'Sink the captain (two sails), or sail yours into the dashed port.' }}</p>

    <div class="winds">
      <span class="muted">Your winds</span>
      <WindCard v-for="wind in hands[0]" :key="wind" :wind="wind" disabled />
      <WindCard :wind="middle" disabled label="Drifting" />
    </div>
  </DemoFrame>
</template>

<style scoped>
.winds {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}

.winds > .muted {
  width: 100%;
  font-size: 0.85rem;
}

.status {
  font-weight: 700;
}

.board {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 3px;
  width: min(100%, 17rem);
  padding: 3px;
  border-radius: var(--radius);
  background: var(--line);
}

.square {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--surface);
  cursor: default;
}

.square.port::before {
  content: '';
  position: absolute;
  inset: 12%;
  border: 2px dashed var(--muted);
  border-radius: 50%;
}

.square.last {
  background: var(--accent-soft);
}

.square.mine,
.square.target {
  cursor: pointer;
}

.square.picked {
  outline: 3px solid var(--accent);
  outline-offset: -3px;
}

.square.target {
  background: var(--accent-soft);
}

.ring {
  width: 34%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.6;
}

.ship {
  position: relative;
  z-index: 1;
  width: 82%;
  height: 82%;
}

.ship .hull,
.ship .flag {
  fill: var(--fleet);
}

.ship .sail {
  fill: var(--fleet);
  opacity: 0.55;
}

.fleet-0 {
  --fleet: var(--accent);
}

.fleet-1 {
  --fleet: var(--ink);
}

.note {
  min-height: 3em;
  font-size: 0.9rem;
}
</style>
