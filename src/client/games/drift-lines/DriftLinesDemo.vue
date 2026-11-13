<script setup lang="ts">
// A practice game for the lobby: you against two bots, played entirely in this tab.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { LANTERN_COLORS, makeDriftLines, type DriftMove, type DriftState } from '../../../games/drift-lines/logic'
import { MoveError } from '../../../games/types'
import type { PublicPlayer } from '../../../shared/protocol'
import DriftLines from './DriftLines.vue'

const props = defineProps<{ you: string; players: PublicPlayer[] }>()

const game = makeDriftLines()
const BOTS = ['practice-bot-1', 'practice-bot-2']
const BOT_DELAY_MS = 1100

const me = computed(() => props.players.find((p) => p.id === props.you))
const myColor = computed(() => me.value?.color ?? 0)
const cast = computed<PublicPlayer[]>(() => [
  { id: props.you, name: me.value?.name ?? 'You', connected: true, team: null, color: myColor.value, ready: false },
  ...BOTS.map((id, i) => ({ id, name: `Bot ${i + 1}`, connected: true, team: null, color: null, ready: false })),
])

function newGame(): DriftState {
  // The bots take colors well away from yours.
  const colors: Record<string, number> = { [props.you]: myColor.value }
  BOTS.forEach((id, i) => (colors[id] = (myColor.value + 4 * (i + 1)) % LANTERN_COLORS.length))
  return game.setup([props.you, ...BOTS], { timer: 0, starts: 0 }, { teams: {}, colors })
}

const state = shallowRef(newGame())
const view = computed(() => game.viewFor(state.value, props.you))
const result = computed(() => game.result(state.value))
const note = ref('')
let botTimer: ReturnType<typeof setTimeout> | undefined

const endLine = computed(() => {
  if (!result.value) return ''
  return result.value.winnerIds.includes(props.you) ? 'You’d have won that one.' : 'Your lantern went out. Have another go.'
})

/** Bots play a safe move when they have one, a moment after the last move. */
function scheduleBot() {
  clearTimeout(botTimer)
  const turn = view.value.turn
  if (!turn || turn === props.you) return
  botTimer = setTimeout(() => {
    try {
      state.value = game.applyMove(state.value, turn, { type: 'skip' }, { isHost: true })
    } catch {
      return
    }
    scheduleBot()
  }, BOT_DELAY_MS)
}

function onMove(move: DriftMove) {
  note.value = ''
  try {
    state.value = game.applyMove(state.value, props.you, move, { isHost: false })
  } catch (error) {
    if (error instanceof MoveError) note.value = error.message
    return
  }
  scheduleBot()
}

function restart() {
  note.value = ''
  state.value = newGame()
  scheduleBot()
}

watch(myColor, (color) => (state.value = game.recolor!(state.value, props.you, color)))
scheduleBot()
onBeforeUnmount(() => clearTimeout(botTimer))
</script>

<template>
  <div class="demo">
    <div class="demo-head">
      <p class="eyebrow">Practice · you and two bots</p>
      <button class="restart" @click="restart">Start over</button>
    </div>
    <DriftLines :view="view" :you="you" :players="cast" :host-id="null" @move="onMove" />
    <p v-if="note" class="note" role="alert">{{ note }}</p>
    <div v-if="result" class="over">
      <p>{{ endLine }}</p>
      <button class="primary" @click="restart">Practice again</button>
    </div>
  </div>
</template>

<style scoped>
.demo {
  display: grid;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem;
  border: 2px dashed var(--line);
  border-radius: var(--radius);
}

.demo-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.restart {
  padding: 0.25rem 0.7rem;
  font-size: 0.85rem;
}

.note {
  color: var(--accent);
}

.over {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  font-weight: 600;
}
</style>
