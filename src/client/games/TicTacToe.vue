<script setup lang="ts">
import { computed } from 'vue'
import type { Mark, TicTacToeMove, TicTacToeView } from '../../games/tic-tac-toe/logic'
import type { PublicPlayer } from '../../shared/protocol'

const props = defineProps<{
  view: TicTacToeView
  you: string
  players: PublicPlayer[]
}>()

const emit = defineEmits<{ move: [move: TicTacToeMove] }>()

const nameOf = (id: string) => props.players.find((player) => player.id === id)?.name ?? 'Someone'
const markName = (mark: Mark) => nameOf(props.view.players[mark])

const isPlaying = computed(() => props.view.seats.includes(props.you))
const isOver = computed(() => props.view.gameResult !== null)
const yourMark = computed<Mark | null>(() => {
  if (props.view.players.X === props.you) return 'X'
  if (props.view.players.O === props.you) return 'O'
  return null
})
const isYourTurn = computed(() => !isOver.value && yourMark.value === props.view.turn)

const status = computed(() => {
  const result = props.view.gameResult
  if (result === 'draw') return 'It’s a draw'
  if (result) return result === props.you ? 'You won this game!' : `${nameOf(result)} won this game`
  if (isYourTurn.value) return `Your turn (${props.view.turn})`
  return `${markName(props.view.turn)}’s turn (${props.view.turn})`
})

const seriesLabel = computed(() =>
  props.view.bestOf === 1 ? 'One game' : `Game ${props.view.game} · best of ${props.view.bestOf}`,
)
</script>

<template>
  <div class="tic-tac-toe">
    <p class="eyebrow">{{ seriesLabel }}</p>

    <div v-if="view.bestOf > 1" class="series" aria-label="Series score">
      <span v-for="(seat, index) in view.seats" :key="seat" class="seat-score" :class="{ you: seat === you }">
        {{ nameOf(seat) }} <strong>{{ view.wins[index] }}</strong>
      </span>
      <span v-if="view.draws" class="muted">{{ view.draws }} draw{{ view.draws === 1 ? '' : 's' }}</span>
      <span class="muted">first to {{ view.winsNeeded }}</span>
    </div>

    <p class="status" aria-live="polite">{{ status }}</p>
    <div class="board">
      <button
        v-for="(cell, index) in view.board"
        :key="index"
        class="cell"
        :class="{ winning: view.winningLine?.includes(index), o: cell === 'O' }"
        :disabled="!isYourTurn || cell !== null"
        :aria-label="`Square ${index + 1}: ${cell ?? 'empty'}`"
        @click="emit('move', { type: 'place', cell: index })"
      >
        {{ cell }}
      </button>
    </div>
    <p class="muted">X: {{ markName('X') }} · O: {{ markName('O') }}</p>
    <p v-if="!isPlaying" class="muted">You’re watching this game.</p>

    <button
      v-if="isOver && !view.seriesOver && isPlaying"
      class="primary"
      @click="emit('move', { type: 'nextGame', game: view.game })"
    >
      Next game
    </button>
    <p v-else-if="isOver && !view.seriesOver" class="muted">Waiting for the next game…</p>
  </div>
</template>

<style scoped>
.tic-tac-toe {
  display: grid;
  gap: 0.9rem;
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
  font-size: 1.2rem;
  font-weight: 700;
}

.board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  width: min(100%, 22rem);
}

.cell {
  aspect-ratio: 1;
  padding: 0;
  font-size: clamp(2rem, 11vw, 3.5rem);
  font-weight: 800;
  color: var(--accent);
}

.cell.o {
  color: var(--ink);
}

.cell:disabled {
  opacity: 1;
  cursor: default;
}

.cell.winning {
  background: var(--accent-soft);
  border-color: var(--accent);
}
</style>
