<script setup lang="ts">
import { computed } from 'vue'
import type { Mark, TicTacToeView } from '../../games/tic-tac-toe/logic'
import type { PublicPlayer } from '../../shared/protocol'

const props = defineProps<{
  view: TicTacToeView
  you: string
  players: PublicPlayer[]
}>()

const emit = defineEmits<{ move: [move: { cell: number }] }>()

const nameOf = (mark: Mark) =>
  props.players.find((player) => player.id === props.view.players[mark])?.name ?? 'Someone'

const isOver = computed(
  () => !!props.view.winningLine || props.view.board.every((cell) => cell !== null),
)
const yourMark = computed<Mark | null>(() => {
  if (props.view.players.X === props.you) return 'X'
  if (props.view.players.O === props.you) return 'O'
  return null
})
const isYourTurn = computed(() => !isOver.value && yourMark.value === props.view.turn)

const status = computed(() => {
  if (isOver.value) return 'Game over'
  if (isYourTurn.value) return `Your turn (${props.view.turn})`
  return `${nameOf(props.view.turn)}’s turn (${props.view.turn})`
})
</script>

<template>
  <div class="tic-tac-toe">
    <p class="status" aria-live="polite">{{ status }}</p>
    <div class="board">
      <button
        v-for="(cell, index) in view.board"
        :key="index"
        class="cell"
        :class="{ winning: view.winningLine?.includes(index), o: cell === 'O' }"
        :disabled="!isYourTurn || cell !== null"
        :aria-label="`Square ${index + 1}: ${cell ?? 'empty'}`"
        @click="emit('move', { cell: index })"
      >
        {{ cell }}
      </button>
    </div>
    <p class="muted">X: {{ nameOf('X') }} · O: {{ nameOf('O') }}</p>
  </div>
</template>

<style scoped>
.tic-tac-toe {
  display: grid;
  gap: 0.9rem;
  justify-items: center;
  width: 100%;
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
