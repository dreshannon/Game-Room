<script setup lang="ts">
import { computed, ref } from 'vue'
import { games, getGame } from '../../games'
import { optionIsShown, type GameOption } from '../../games/types'
import { MAX_NAME_LENGTH, type ClosedReason, type PublicPlayer } from '../../shared/protocol'
import { gameViews } from '../games'
import { useRoom } from '../useRoom'
import { useTurnAlert } from '../useTurnAlert'
import GamePicker from './GamePicker.vue'
import RulesDialog from './RulesDialog.vue'
import SoundMenu from './SoundMenu.vue'
import ThemeToggle from './ThemeToggle.vue'

const props = defineProps<{ code: string }>()

const { state, connected, closedReason, toast, join, rename, send } = useRoom(props.code)

const name = ref('')
const copied = ref(false)
const renaming = ref(false)
const newName = ref('')
const rulesDialog = ref<InstanceType<typeof RulesDialog> | null>(null)

const CLOSED_MESSAGES: Record<ClosedReason, string> = {
  not_found: 'This room does not exist or has closed.',
  full: 'This room has too many people connected.',
  replaced: 'You opened this room in another tab.',
  left: 'You left the room.',
  removed: 'The host removed you from the room. You’re welcome to rejoin.',
}

const isHost = computed(() => !!state.value?.you && state.value.you === state.value.hostId)
const selectedGame = computed(() => getGame(state.value?.selectedGameId ?? ''))

const shownOptions = computed(() =>
  (selectedGame.value?.options ?? []).filter((option) => optionIsShown(option, state.value?.options ?? {})),
)
const optionLabel = (option: GameOption, value: number | undefined) =>
  option.choices?.find((choice) => choice.value === value)?.label ?? value

const teamSettings = computed(() => {
  const settings = selectedGame.value?.teams
  return settings && state.value && settings.when(state.value.options) ? settings : null
})
const teamMembers = (team: number) => state.value?.players.filter((player) => player.team === team) ?? []
const unassigned = computed(() => {
  const count = teamSettings.value?.names.length ?? 0
  return (state.value?.players ?? []).filter((player) => player.team === null || player.team >= count)
})
const pickedPlayers = computed(() =>
  (state.value?.pickedIds ?? [])
    .map((id) => state.value?.players.find((player) => player.id === id))
    .filter((player): player is PublicPlayer => !!player),
)
const isPicked = (id: string) => !!state.value?.pickedIds.includes(id)

const yourLobbyTeam = computed(
  () => state.value?.players.find((player) => player.id === state.value?.you)?.team ?? null,
)
const connectedCount = computed(() => state.value?.players.filter((p) => p.connected).length ?? 0)
const canStart = computed(() => {
  const game = selectedGame.value
  // Games with seats only need enough people for the seats, since anyone else watches.
  if (game?.seats) return connectedCount.value >= game.seats
  return !!game && connectedCount.value >= game.minPlayers && connectedCount.value <= game.maxPlayers
})
const activeView = computed(() =>
  state.value?.game ? gameViews[state.value.game.gameId]?.component : null,
)

// The rules shown are for the game being played, or otherwise the one picked in the lobby.
const rulesGame = computed(() => getGame(state.value?.game?.gameId ?? state.value?.selectedGameId ?? ''))
const rules = computed(() => (rulesGame.value ? gameViews[rulesGame.value.id]?.rules : undefined))

// Colors belong to the game being played, or otherwise the one picked in the lobby.
const palette = computed(() => rulesGame.value?.playerColors ?? null)
const swatchOf = (player: PublicPlayer) =>
  player.color !== null ? (palette.value?.[player.color] ?? null) : null
const yourColor = computed(
  () => state.value?.players.find((player) => player.id === state.value?.you)?.color ?? null,
)
const colorHolder = (color: number) =>
  state.value?.players.find((player) => player.color === color && player.id !== state.value?.you) ?? null

const isYourTurn = computed(() => {
  const game = state.value?.game
  return !!game && !game.result && !!state.value?.you && game.waitingOn.includes(state.value.you)
})
useTurnAlert(isYourTurn)

function startRename(current: string) {
  newName.value = current
  renaming.value = true
}

function submitRename() {
  const trimmed = newName.value.trim()
  if (trimmed) rename(trimmed)
  renaming.value = false
}

const resultText = computed(() => {
  const result = state.value?.game?.result
  if (!result) return null
  if (result.message) return result.message
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
          <button v-if="rules" @click="rulesDialog?.open()">How to play</button>
          <SoundMenu />
          <ThemeToggle />
          <button @click="copyLink">{{ copied ? 'Copied!' : 'Copy invite link' }}</button>
          <button @click="send({ type: 'leave' })">Leave</button>
        </div>
      </header>

      <RulesDialog v-if="rules && rulesGame" ref="rulesDialog" :title="rulesGame.name" :rules="rules" />

      <p v-if="!connected" class="banner" role="status">Connection lost. Reconnecting…</p>

      <div class="layout">
        <section class="panel stage">
          <template v-if="state.game && activeView">
            <component
              :is="activeView"
              :view="state.game.view"
              :you="state.you"
              :players="state.players"
              :host-id="state.hostId"
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
            <p class="muted">
              <template v-if="isHost">Pick a game.</template>
              <template v-else>The host picks the game. Next up: <strong>{{ selectedGame?.name }}</strong></template>
            </p>
            <GamePicker
              :games="games"
              :selected-id="state.selectedGameId"
              :can-pick="isHost"
              :connected-count="connectedCount"
              @select="send({ type: 'selectGame', gameId: $event })"
            />

            <template v-for="option in shownOptions" :key="option.key">
              <label v-if="isHost" class="field">
                {{ option.label }}
                <select
                  v-if="option.choices"
                  :value="state.options[option.key]"
                  @change="
                    send({
                      type: 'setOption',
                      key: option.key,
                      value: Number(($event.target as HTMLSelectElement).value),
                    })
                  "
                >
                  <option v-for="choice in option.choices" :key="choice.value" :value="choice.value">
                    {{ choice.label }}
                  </option>
                </select>
                <input
                  v-else
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
              <p v-else>
                {{ option.label }}:
                <strong>{{ optionLabel(option, state.options[option.key]) }}</strong>
              </p>
            </template>

            <div v-if="selectedGame?.seats" class="seat-picker">
              <h3>Who plays?</h3>
              <ul v-if="isHost" class="seat-list">
                <li v-for="player in state.players" :key="player.id">
                  <label>
                    <input
                      type="checkbox"
                      :checked="isPicked(player.id)"
                      :disabled="!isPicked(player.id) && pickedPlayers.length >= selectedGame.seats"
                      @change="
                        send({
                          type: 'pickPlayer',
                          playerId: player.id,
                          picked: ($event.target as HTMLInputElement).checked,
                        })
                      "
                    />
                    {{ player.name }}<template v-if="player.id === state.you"> (you)</template>
                  </label>
                </li>
              </ul>
              <p v-else-if="pickedPlayers.length">
                Playing: <strong>{{ pickedPlayers.map((player) => player.name).join(' and ') }}</strong>
              </p>
              <p class="muted">
                {{ selectedGame.seats }} play and everyone else watches.
                <template v-if="pickedPlayers.length < selectedGame.seats">
                  Open seats go to whoever joined the room first.
                </template>
              </p>
            </div>

            <div v-if="teamSettings" class="team-picker">
              <div
                v-for="(teamName, team) in teamSettings.names"
                :key="teamName"
                class="team-column"
                :class="`team-${team}`"
              >
                <h3>Team {{ teamName }}</h3>
                <ul>
                  <li v-for="player in teamMembers(team)" :key="player.id">
                    {{ player.name }}<template v-if="player.id === state.you"> (you)</template>
                  </li>
                </ul>
                <button
                  v-if="yourLobbyTeam !== team"
                  class="small-button"
                  @click="send({ type: 'setTeam', team })"
                >
                  Join Team {{ teamName }}
                </button>
              </div>
              <p v-if="unassigned.length" class="muted team-note">
                Not on a team yet: {{ unassigned.map((player) => player.name).join(', ') }}. They’ll be
                put on the smaller team when the game starts.
              </p>
              <button v-if="isHost" class="team-shuffle" @click="send({ type: 'shuffleTeams' })">
                Shuffle teams
              </button>
            </div>

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
                <template v-else-if="!canStart && selectedGame.seats">
                  {{ selectedGame.name }} needs {{ selectedGame.seats }} connected players.
                  {{ connectedCount }} here now.
                </template>
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
              <form
                v-if="player.id === state.you && renaming"
                class="rename-form"
                @submit.prevent="submitRename"
              >
                <input
                  v-model="newName"
                  :maxlength="MAX_NAME_LENGTH"
                  aria-label="New name"
                  autocomplete="off"
                  autofocus
                  @keydown.esc="renaming = false"
                />
                <button class="primary small-button" type="submit" :disabled="!newName.trim()">Save</button>
                <button class="small-button" type="button" @click="renaming = false">Cancel</button>
              </form>
              <span
                v-if="palette && !(player.id === state.you && renaming)"
                class="color-dot"
                :class="{ unset: !swatchOf(player) }"
                :style="swatchOf(player) ? { background: swatchOf(player)!.fill } : undefined"
                :title="swatchOf(player)?.name ?? 'No color yet'"
              ></span>
              <span v-if="!(player.id === state.you && renaming)" class="player-name">{{ player.name }}</span>
              <span v-if="player.id === state.you" class="tag">you</span>
              <button
                v-if="player.id === state.you && !renaming"
                class="small-button"
                @click="startRename(player.name)"
              >
                Rename
              </button>
              <span v-if="player.id === state.hostId" class="tag">host</span>
              <span v-if="!player.connected" class="tag">away</span>
              <button
                v-if="isHost && player.id !== state.you"
                class="small-button"
                :aria-label="`Remove ${player.name}`"
                @click="removePlayer(player)"
              >
                Remove
              </button>
            </li>
          </ul>

          <fieldset v-if="palette" class="color-picker">
            <legend>Your color</legend>
            <div class="swatches">
              <button
                v-for="(swatch, index) in palette"
                :key="swatch.name"
                type="button"
                class="swatch"
                :class="{ chosen: yourColor === index }"
                :style="{ background: swatch.fill, color: swatch.text }"
                :disabled="!!colorHolder(index)"
                :aria-pressed="yourColor === index"
                :aria-label="colorHolder(index) ? `${swatch.name}, taken by ${colorHolder(index)!.name}` : swatch.name"
                :title="colorHolder(index) ? `${swatch.name} (${colorHolder(index)!.name})` : swatch.name"
                @click="send({ type: 'setColor', color: index })"
              >
                <span v-if="yourColor === index" aria-hidden="true">✓</span>
                <span v-else-if="colorHolder(index)" aria-hidden="true">{{ Array.from(colorHolder(index)!.name)[0]?.toUpperCase() }}</span>
              </button>
            </div>
            <p v-if="yourColor === null" class="muted small-note">Pick one, or you’ll get a free one when the game starts.</p>
          </fieldset>
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

.seat-picker {
  display: grid;
  gap: 0.4rem;
}

.seat-picker h3 {
  margin: 0;
  font-size: 1rem;
}

.seat-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.seat-list label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.team-picker {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  width: 100%;
}

.team-column {
  display: grid;
  gap: 0.4rem;
  align-content: start;
  padding: 0.6rem 0.8rem;
  border-left: 4px solid var(--team);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--team) 12%, transparent);
}

.team-column h3 {
  margin: 0;
  font-size: 1rem;
}

.team-column ul {
  display: grid;
  gap: 0.2rem;
  min-height: 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.team-column button {
  justify-self: start;
}

.team-0 {
  --team: #e4572e;
}

.team-1 {
  --team: #1b998b;
}

.team-note,
.team-shuffle {
  grid-column: 1 / -1;
}

.team-shuffle {
  justify-self: start;
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

.color-dot {
  flex: none;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  box-shadow:
    0 0 0 1.5px var(--surface),
    0 0 0 3px var(--line);
}

.color-dot.unset {
  background: transparent;
  box-shadow: inset 0 0 0 2px var(--line);
}

.color-picker {
  margin: 1.1rem 0 0;
  padding: 0;
  border: 0;
}

.color-picker legend {
  margin-bottom: 0.5rem;
  font-weight: 700;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 2px solid var(--line);
  border-radius: 50%;
  font-size: 0.8rem;
  font-weight: 800;
}

.swatch.chosen {
  box-shadow:
    0 0 0 2px var(--surface),
    0 0 0 4px var(--ink);
}

.swatch:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.small-note {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
}

.small-button {
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
}

.rename-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.rename-form input {
  width: 10rem;
  padding: 0.2rem 0.5rem;
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
