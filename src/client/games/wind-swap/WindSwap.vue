<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { canAnimate } from '../../motion'
import {
  HOME_PORT,
  hasAnyMove,
  targetsFor,
  windById,
  type Seat,
  type WindSwapMove,
  type WindSwapView,
} from '../../../games/wind-swap/logic'
import type { PublicPlayer } from '../../../shared/protocol'
import WindCard from './WindCard.vue'

const props = defineProps<{
  view: WindSwapView
  you: string
  players: PublicPlayer[]
}>()

const emit = defineEmits<{ move: [move: WindSwapMove] }>()

const nameOf = (id: string) => props.players.find((player) => player.id === id)?.name ?? 'Someone'
const seatName = (seat: Seat) => (props.view.seats[seat] === props.you ? 'You' : nameOf(props.view.seats[seat]))

const yourSeat = computed<Seat | null>(() => {
  const index = props.view.seats.indexOf(props.you)
  return index === -1 ? null : (index as Seat)
})
/** The fleet drawn at the bottom: yours, or the first fleet if you're watching. */
const bottom = computed<Seat>(() => yourSeat.value ?? 0)
const top = computed<Seat>(() => (bottom.value === 0 ? 1 : 0))

const isOver = computed(() => props.view.outcome !== null)
const isYourTurn = computed(() => !isOver.value && yourSeat.value === props.view.turn)
const mustPass = computed(() => isYourTurn.value && !hasAnyMove(props.view, props.view.turn))

/** Board squares in the order they're drawn, turned around for the top seat. */
const order = computed(() => {
  const squares = Array.from({ length: 25 }, (_, i) => i)
  return bottom.value === 0 ? squares : squares.reverse()
})

const pickedWind = ref<string | null>(null)
const pickedShip = ref<number | null>(null)
/** A square both winds reach, waiting for the player to say which wind. */
const pendingTarget = ref<number | null>(null)

const reset = () => {
  pickedWind.value = null
  pickedShip.value = null
  pendingTarget.value = null
}
watch(
  () => [props.view.turn, props.view.turns, props.view.game],
  reset,
)

const yourWinds = computed(() => (yourSeat.value === null ? [] : props.view.hands[yourSeat.value]))

/** Each square the picked ship can reach, with the winds that get it there. */
const reach = computed(() => {
  const map = new Map<number, string[]>()
  if (!isYourTurn.value || pickedShip.value === null) return map
  const winds = pickedWind.value ? [pickedWind.value] : yourWinds.value
  for (const wind of winds) {
    for (const square of targetsFor(props.view.board, props.view.turn, pickedShip.value, wind)) {
      map.set(square, [...(map.get(square) ?? []), wind])
    }
  }
  return map
})

function sail(wind: string, to: number) {
  emit('move', { type: 'sail', wind, from: pickedShip.value!, to })
  reset()
}

function clickSquare(square: number) {
  if (!isYourTurn.value) return
  const ship = props.view.board[square]
  if (ship?.seat === props.view.turn) {
    pendingTarget.value = null
    pickedShip.value = pickedShip.value === square ? null : square
    return
  }
  const winds = reach.value.get(square)
  if (!winds) return
  if (winds.length === 1) sail(winds[0]!, square)
  else pendingTarget.value = square
}

function clickWind(wind: string) {
  if (!isYourTurn.value) return
  if (mustPass.value) {
    emit('move', { type: 'pass', wind })
    reset()
    return
  }
  if (pendingTarget.value !== null) {
    sail(wind, pendingTarget.value)
    return
  }
  pickedWind.value = pickedWind.value === wind ? null : wind
}

const status = computed(() => {
  const outcome = props.view.outcome
  if (outcome) {
    if (outcome.winner === null) {
      return outcome.how === 'repeat' ? 'Draw: the same position came up three times' : 'Draw: out of turns'
    }
    const winner = props.view.seats[outcome.winner]
    const who = winner === props.you ? 'You win' : `${nameOf(winner)} wins`
    if (outcome.how === 'sunk') return `${who}: the captain was sunk!`
    if (outcome.how === 'port') return `${who}: the captain reached port!`
    return `${who}: the other player left`
  }
  if (mustPass.value) return 'No moves. Pick a wind to give away.'
  if (pendingTarget.value !== null) return 'Both winds go there. Pick one.'
  if (isYourTurn.value) return pickedShip.value === null ? 'Your turn: pick a ship' : 'Pick where to sail'
  return `${nameOf(props.view.seats[props.view.turn])}’s turn`
})

const lastMoveText = computed(() => {
  const last = props.view.lastMove
  if (!last || isOver.value) return ''
  const who = seatName(last.seat)
  const wind = windById(last.wind)?.name ?? last.wind
  if (last.from === undefined) return `${who} had no move and gave away ${wind}.`
  return `${who} used ${wind}${last.sank ? ' and sank a ship' : ''}.`
})

// When a wind is used, it slides from the hand to the middle (turning to face the other
// player), and the drifting wind slides into the hand. Card positions are measured just
// before the board changes, then each card is played back from where it was.
const root = ref<HTMLElement | null>(null)
let before = new Map<string, { rect: DOMRect; flipped: boolean; drifting: boolean }>()
/** A copy of the ship about to be sunk, so it can be shown going down after it's gone. */
let sinking: SVGElement | null = null

const measure = () =>
  new Map(
    [...(root.value?.querySelectorAll<HTMLElement>('[data-wind]') ?? [])].map((card) => [
      card.dataset.wind!,
      {
        rect: card.getBoundingClientRect(),
        flipped: card.classList.contains('flipped'),
        drifting: !!card.closest('.drift'),
      },
    ]),
  )

watch(
  () => `${props.view.game}:${props.view.turns}`,
  () => {
    before = canAnimate() ? measure() : new Map()
    const to = props.view.lastMove?.sank ? props.view.lastMove.to : undefined
    sinking =
      to === undefined || !before.size
        ? null
        : ((root.value?.querySelector(`[data-square="${to}"] .ship`)?.cloneNode(true) as SVGElement | undefined) ?? null)
  },
  { flush: 'pre' },
)

watch(
  () => `${props.view.game}:${props.view.turns}`,
  () => {
    const last = props.view.lastMove
    if (!before.size || !last) return
    animateShip(last.from, last.to)
    for (const card of root.value?.querySelectorAll<HTMLElement>('[data-wind]') ?? []) {
      const wind = card.dataset.wind!
      const old = before.get(wind)
      // Only the two winds that swapped places move.
      if (!old || old.drifting === !!card.closest('.drift')) continue
      const now = card.getBoundingClientRect()
      const dx = old.rect.left - now.left
      const dy = old.rect.top - now.top
      const turned = old.flipped !== card.classList.contains('flipped')
      if (!dx && !dy && !turned) continue
      card.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) rotate(${turned ? 180 : 0}deg)`, zIndex: 2 },
          { transform: 'none', zIndex: 2 },
        ],
        { duration: 550, easing: EASE },
      )
    }
    before = new Map()
  },
  { flush: 'post' },
)

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

/** Glides the ship that moved from its old square, and sinks any ship it landed on. */
function animateShip(from: number | undefined, to: number | undefined) {
  const board = root.value?.querySelector<HTMLElement>('.board')
  const start = board?.querySelector(`[data-square="${from}"]`)
  const end = board?.querySelector(`[data-square="${to}"]`)
  const ship = end?.querySelector('.ship')
  if (!board || !start || !end || !ship) return
  const a = start.getBoundingClientRect()
  const b = end.getBoundingClientRect()

  if (sinking) {
    const area = board.getBoundingClientRect()
    const ghost = sinking
    ghost.classList.add('ghost')
    Object.assign(ghost.style, {
      left: `${b.left - area.left + b.width * 0.09}px`,
      top: `${b.top - area.top + b.height * 0.09}px`,
      width: `${b.width * 0.82}px`,
      height: `${b.height * 0.82}px`,
    })
    board.append(ghost)
    const fade = ghost.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(30%) rotate(-12deg) scale(0.8)' },
      ],
      { duration: 450, delay: 300, easing: 'ease-in', fill: 'both' },
    )
    fade.onfinish = fade.oncancel = () => ghost.remove()
    sinking = null
  }

  ship.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], {
    duration: 450,
    easing: EASE,
  })
}

const turnsLeft = computed(() => (props.view.drawAfter ? props.view.drawAfter - props.view.turns : null))

const seriesLabel = computed(() =>
  props.view.bestOf === 1 ? 'One game' : `Game ${props.view.game} · best of ${props.view.bestOf}`,
)

const isPort = (square: number) => square === HOME_PORT[0] || square === HOME_PORT[1]
const isLast = (square: number) => props.view.lastMove?.from === square || props.view.lastMove?.to === square
</script>

<template>
  <div ref="root" class="wind-swap">
    <p class="eyebrow">{{ seriesLabel }}</p>

    <div v-if="view.bestOf > 1" class="series" aria-label="Series score">
      <span v-for="(seat, index) in view.seats" :key="seat" class="seat-score" :class="{ you: seat === you }">
        <span class="swatch" :class="`fleet-${index}`" />
        {{ nameOf(seat) }} <strong>{{ view.wins[index] }}</strong>
      </span>
      <span v-if="view.draws" class="muted">{{ view.draws }} draw{{ view.draws === 1 ? '' : 's' }}</span>
      <span class="muted">first to {{ view.winsNeeded }}</span>
    </div>

    <p class="status" aria-live="polite">{{ status }}</p>

    <div class="table">
      <div class="hand top-hand" :aria-label="`${seatName(top)}’s winds`">
        <span class="who"><span class="swatch" :class="`fleet-${top}`" />{{ seatName(top) }}</span>
        <WindCard v-for="wind in view.hands[top]" :key="wind" :wind="wind" :data-wind="wind" flipped disabled />
      </div>

      <div class="board" role="grid" aria-label="The bay">
        <button
          v-for="square in order"
          :key="square"
          :data-square="square"
          class="square"
          :class="{
            port: isPort(square),
            last: isLast(square),
            picked: pickedShip === square,
            target: reach.has(square),
            pending: pendingTarget === square,
            mine: isYourTurn && view.board[square]?.seat === view.turn,
          }"
          :aria-label="`Row ${Math.floor(square / 5) + 1}, column ${(square % 5) + 1}: ${
            view.board[square]
              ? `${seatName(view.board[square]!.seat)} ${view.board[square]!.captain ? 'captain' : 'ship'}`
              : isPort(square)
                ? 'port'
                : 'open water'
          }`"
          @click="clickSquare(square)"
        >
          <svg v-if="view.board[square]" viewBox="0 0 40 40" class="ship" :class="`fleet-${view.board[square]!.seat}`">
            <path class="sail" d="M20 6 L20 26 L9 26 Z" />
            <path v-if="view.board[square]!.captain" class="sail" d="M22 9 L22 26 L31 26 Z" />
            <path class="hull" d="M5 28 H35 L30 35 H10 Z" />
            <path v-if="view.board[square]!.captain" class="flag" d="M20 3 L27 5 L20 7 Z" />
          </svg>
          <span v-else-if="reach.has(square)" class="ring" />
        </button>
      </div>

      <div class="drift">
        <WindCard
          :wind="view.drifting"
          :data-wind="view.drifting"
          :flipped="view.turn !== bottom"
          :label="isOver ? 'drifting' : `next to ${seatName(view.turn)}`"
          disabled
        />
      </div>

      <div class="hand bottom-hand" :aria-label="`${seatName(bottom)}’s winds`">
        <span class="who"><span class="swatch" :class="`fleet-${bottom}`" />{{ seatName(bottom) }}</span>
        <WindCard
          v-for="wind in view.hands[bottom]"
          :key="wind"
          :wind="wind"
          :data-wind="wind"
          :selected="pickedWind === wind || (pendingTarget !== null && !!reach.get(pendingTarget)?.includes(wind))"
          :disabled="!isYourTurn || (pendingTarget !== null && !reach.get(pendingTarget)?.includes(wind))"
          @pick="clickWind(wind)"
        />
      </div>
    </div>

    <p v-if="lastMoveText" class="muted">{{ lastMoveText }}</p>
    <p v-if="turnsLeft !== null && !isOver && turnsLeft <= 20" class="muted">
      {{ turnsLeft }} turn{{ turnsLeft === 1 ? '' : 's' }} until a draw
    </p>
    <p v-if="yourSeat === null" class="muted">You’re watching this game.</p>

    <button
      v-if="isOver && !view.seriesOver && yourSeat !== null"
      class="primary"
      @click="emit('move', { type: 'nextGame', game: view.game })"
    >
      Next game
    </button>
    <p v-else-if="isOver && !view.seriesOver" class="muted">Waiting for the next game…</p>
  </div>
</template>

<style scoped>
.wind-swap {
  display: grid;
  gap: 0.75rem;
  justify-items: center;
  width: 100%;
}

.series {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.seat-score {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
  background: var(--accent-soft);
}

.seat-score strong {
  font-size: 1.2rem;
}

.seat-score.you {
  outline: 2px solid var(--accent);
}

.status {
  font-size: 1.15rem;
  font-weight: 700;
  text-align: center;
}

.hand {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.who {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  justify-content: center;
  font-size: 0.85rem;
  color: var(--muted);
}

.swatch {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
}

.swatch.fleet-0 {
  background: var(--accent);
}

.swatch.fleet-1 {
  background: var(--ink);
}

/*
 * Wide screens: the board in the middle column, a hand above and below it, and the drifting
 * wind beside it. Phones: the drifting wind sits next to your hand so everything fits.
 */
.table {
  display: grid;
  grid-template-columns: 1fr minmax(0, 21rem) 1fr;
  grid-template-areas:
    '. top .'
    '. board drift'
    '. bottom .';
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

.top-hand {
  grid-area: top;
}

.bottom-hand {
  grid-area: bottom;
}

.table .board {
  grid-area: board;
  width: 100%;
}

.drift {
  grid-area: drift;
  justify-self: start;
}

@media (max-width: 40rem) {
  .wind-swap {
    gap: 0.5rem;
  }

  .table {
    grid-template-columns: 1fr auto auto 1fr;
    grid-template-areas:
      'top top top top'
      'board board board board'
      '. bottom drift .';
    gap: 0.5rem;
  }

  .table .board {
    justify-self: center;
    width: min(100%, 21rem);
  }

  .hand {
    gap: 0.35rem;
  }

  .who {
    font-size: 0.75rem;
  }

  .drift {
    align-self: end;
    padding-left: 0.5rem;
    border-left: 1px solid var(--line);
  }
}

.board {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 3px;
  width: min(100%, 21rem);
  padding: 3px;
  border-radius: var(--radius);
  background: var(--line);
}

.square {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1;
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

.square.pending {
  outline: 3px dashed var(--accent);
  outline-offset: -3px;
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

.ship .hull {
  fill: var(--fleet);
}

.ship .sail {
  fill: var(--fleet);
  opacity: 0.55;
}

.ship .flag {
  fill: var(--fleet);
}

.fleet-0 {
  --fleet: var(--accent);
}

.fleet-1 {
  --fleet: var(--ink);
}

.drift {
  display: grid;
  justify-items: center;
}

.ship.ghost {
  position: absolute;
  z-index: 0;
  pointer-events: none;
}
</style>
