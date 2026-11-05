<script setup lang="ts">
import { computed, ref } from 'vue'
import { games, getGame } from '../../games'
import { MAX_NAME_LENGTH, type ClosedReason, type PublicPlayer } from '../../shared/protocol'
import { gameViews } from '../games'
import { useRoom } from '../useRoom'

const props = defineProps<{ code: string }>()

const { state, connected, closedReason, toast, join, send } = useRoom(props.code)

const name = ref('')
const copied = ref(false)

const CLOSED_MESSAGES: Record<ClosedReason, string> = {
  not_found: 'This room does not exist or has closed.',
  full: 'This room has too many people connected.',
  replaced: 'You opened this room in another tab.',
  left: 'You left the room.',
  removed: 'The host removed you from the room. You’re welcome to rejoin.',
}

const isHost = computed(() => !!state.value?.you && state.value.you === state.value.hostId)
const selectedGame = computed(() => getGame(state.value?.selectedGameId ?? ''))
const connectedCount = computed(() => state.value?.players.filter((p) => p.connected).length ?? 0)
const canStart = computed(() => {
  const game = selectedGame.value
  return !!game && connectedCount.value >= game.minPlayers && connectedCount.value <= game.maxPlayers
})
const activeView = computed(() => (state.value?.game ? gameViews[state.value.game.gameId] : null))

const resultText = computed(() => {
  const result = state.value?.game?.result
  if (!result) return null
  if (result.winnerIds.length === 0) return 'It’s a draw!'
  if (result.winnerIds.includes(state.value?.you ?? '')) return 'You win!'
  const winners = result.winnerIds.map(
    (id) => state.value?.players.find((player) => player.id === id)?.name ?? 'Someone',
  )
  return `${winners.join(' and ')} won!`
})

function submitName() {
  const trimmed = name.value.trim()
  if (trimmed) join(trimmed)
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    window.prompt('Copy this link:', location.href)
  }
}

const sendMove = (move: unknown) => send({ type: 'move', move })

function removePlayer(player: PublicPlayer) {
  if (window.confirm(`Remove ${player.name} from the room? They can rejoin with the link.`)) {
    send({ type: 'removePlayer', playerId: player.id })
  }
}

function endGame() {
  if (window.confirm('End this game for everyone?')) send({ type: 'endGame' })
}
</script>

<template>
  <main class="page room" :class="{ 'in-game': state?.game }">
    <section v-if="closedReason" class="panel center">
      <h1>{{ closedReason === 'removed' ? 'You were removed' : 'Room closed' }}</h1>
      <p>{{ CLOSED_MESSAGES[closedReason] }}</p>
      <div class="closed-actions">
        <a v-if="closedReason === 'removed'" class="button primary" :href="`/room/${code}`">Rejoin</a>
        <a class="button" :class="{ primary: closedReason !== 'removed' }" href="/">Back to home</a>
      </div>
    </section>

    <p v-else-if="!state" class="center muted">Connecting…</p>

    <section v-else-if="!state.you" class="panel join-panel">
      <p class="eyebrow">Room {{ code }}</p>
      <h1>What’s your name?</h1>
      <form class="row" @submit.prevent="submitName">
        <input
          v-model="name"
          :maxlength="MAX_NAME_LENGTH"
          aria-label="Your name"
          autocomplete="off"
          autofocus
          placeholder="Your name"
        />
        <button class="primary" type="submit" :disabled="!name.trim() || !connected">Join</button>
      </form>
      <p v-if="state.players.length" class="muted">
        Already here: {{ state.players.map((player) => player.name).join(', ') }}
      </p>
    </section>

    <template v-else>
      <header class="room-header">
        <div>
          <p class="eyebrow">Room code</p>
          <p class="room-code">{{ code }}</p>
        </div>
        <div class="row">
          <button @click="copyLink">{{ copied ? 'Copied!' : 'Copy invite link' }}</button>
          <button @click="send({ type: 'leave' })">Leave</button>
        </div>
      </header>

      <p v-if="!connected" class="banner" role="status">Connection lost. Reconnecting…</p>

      <div class="layout">
        <section class="panel stage">
          <template v-if="state.game && activeView">
            <component
              :is="activeView"
              :view="state.game.view"
              :you="state.you"
              :players="state.players"
              @move="sendMove"
            />
            <div v-if="state.game.result" class="result">
              <p class="result-text">{{ resultText }}</p>
              <div v-if="isHost" class="row">
                <button class="primary" :disabled="!canStart" @click="send({ type: 'start' })">
                  Play again
                </button>
                <button @click="send({ type: 'endGame' })">Back to lobby</button>
              </div>
              <p v-else class="muted">Waiting for the host…</p>
            </div>
            <button v-else-if="isHost" class="end-game" @click="endGame">End game</button>
          </template>

          <template v-else>
            <h2>Lobby</h2>
            <label v-if="isHost" class="field">
              Game
              <select
                :value="state.selectedGameId"
                @change="
                  send({ type: 'selectGame', gameId: ($event.target as HTMLSelectElement).value })
                "
              >
                <option v-for="game in games" :key="game.id" :value="game.id">{{ game.name }}</option>
              </select>
            </label>
            <p v-else>Next up: <strong>{{ selectedGame?.name }}</strong></p>

            <template v-for="option in selectedGame?.options ?? []" :key="option.key">
              <label v-if="isHost" class="field">
                {{ option.label }}
                <input
                  type="number"
                  class="option-input"
                  :min="option.min"
                  :max="option.max"
                  :value="state.options[option.key]"
                  @change="
                    send({
                      type: 'setOption',
                      key: option.key,
                      value: ($event.target as HTMLInputElement).valueAsNumber,
                    })
                  "
                />
              </label>
              <p v-else>{{ option.label }}: <strong>{{ state.options[option.key] }}</strong></p>
            </template>

            <template v-if="selectedGame">
              <button
                v-if="isHost"
                class="primary"
                :disabled="!canStart"
                @click="send({ type: 'start' })"
              >
                Start game
              </button>
              <p class="muted">
                <template v-if="canStart && !isHost">Waiting for the host to start…</template>
                <template v-else-if="!canStart">
                  {{ selectedGame.name }} needs
                  {{
                    selectedGame.minPlayers === selectedGame.maxPlayers
                      ? selectedGame.minPlayers
                      : `${selectedGame.minPlayers} to ${selectedGame.maxPlayers}`
                  }}
                  connected players. {{ connectedCount }} here now.
                </template>
              </p>
            </template>
          </template>
        </section>

        <aside class="panel">
          <h2>Players</h2>
          <ul class="players">
            <li v-for="player in state.players" :key="player.id" :class="{ away: !player.connected }">
              <span class="player-name">{{ player.name }}</span>
              <span v-if="player.id === state.you" class="tag">you</span>
              <span v-if="player.id === state.hostId" class="tag">host</span>
              <span v-if="!player.connected" class="tag">away</span>
              <button
                v-if="isHost && player.id !== state.you"
                class="remove-player"
                :aria-label="`Remove ${player.name}`"
                @click="removePlayer(player)"
              >
                Remove
              </button>
            </li>
          </ul>
        </aside>
      </div>
    </template>

    <p v-if="toast" class="toast" role="alert">{{ toast }}</p>
  </main>
</template>

<style scoped>
.center {
  margin-top: 18vh;
  text-align: center;
}

.join-panel {
  max-width: 26rem;
  margin: 18vh auto 0;
  display: grid;
  gap: 1rem;
}

.join-panel input {
  flex: 1;
  min-width: 0;
}

.closed-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.room-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.room-code {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1.1;
}

.banner {
  margin-bottom: 1rem;
  padding: 0.6rem 1rem;
  border-radius: var(--radius);
  background: var(--accent-soft);
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16rem;
  gap: 1rem;
  align-items: start;
}

.stage {
  display: grid;
  gap: 1rem;
  justify-items: start;
}

.field {
  display: grid;
  gap: 0.35rem;
  font-weight: 600;
}

.option-input {
  width: 7rem;
}

.end-game {
  justify-self: end;
}

/* Games get the full width, and the player list moves underneath. */
.in-game {
  max-width: 84rem;
}

.in-game .layout {
  grid-template-columns: minmax(0, 1fr);
}

.in-game .players {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
}

.result {
  display: grid;
  gap: 0.75rem;
  justify-items: center;
  width: 100%;
  text-align: center;
}

.result-text {
  font-size: 1.5rem;
  font-weight: 800;
}

.players {
  display: grid;
  gap: 0.6rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
}

.players li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.player-name {
  overflow-wrap: anywhere;
}

.away .player-name {
  opacity: 0.55;
}

.remove-player {
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
}

.tag {
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--accent-soft);
  font-size: 0.75rem;
  font-weight: 600;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  width: max-content;
  max-width: calc(100vw - 2rem);
  padding: 0.7rem 1.1rem;
  border-radius: var(--radius);
  background: var(--ink);
  color: var(--paper);
  transform: translateX(-50%);
}

@media (max-width: 700px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
