<script setup lang="ts">
import { ref } from 'vue'
import { ROOM_CODE_LENGTH } from '../../shared/protocol'

const code = ref('')
const creating = ref(false)
const error = ref<string | null>(null)

async function createRoom() {
  creating.value = true
  error.value = null
  try {
    const response = await fetch('/api/rooms', { method: 'POST' })
    if (response.status === 429) {
      error.value = 'You’ve created a lot of rooms. Wait a minute and try again.'
      creating.value = false
      return
    }
    if (!response.ok) throw new Error(`Status ${response.status}`)
    const room = (await response.json()) as { code: string }
    location.assign(`/room/${room.code}`)
  } catch {
    error.value = 'Could not create a room. Try again.'
    creating.value = false
  }
}

function joinRoom() {
  const cleaned = code.value.trim().toUpperCase()
  if (cleaned) location.assign(`/room/${encodeURIComponent(cleaned)}`)
}
</script>

<template>
  <main class="page home">
    <h1>Game Rooms</h1>
    <p class="lede">Make a room, share the link, and play together. No accounts, nothing saved.</p>

    <button class="primary large" :disabled="creating" @click="createRoom">
      {{ creating ? 'Creating…' : 'Create a room' }}
    </button>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <form class="join" @submit.prevent="joinRoom">
      <label for="room-code">Have a code?</label>
      <div class="row">
        <input
          id="room-code"
          v-model="code"
          class="code-input"
          :maxlength="ROOM_CODE_LENGTH"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          placeholder="K7PQX"
        />
        <button type="submit" :disabled="!code.trim()">Join</button>
      </div>
    </form>
  </main>
</template>

<style scoped>
.home {
  max-width: 26rem;
  padding-top: 18vh;
}

h1 {
  font-size: clamp(2.5rem, 10vw, 3.5rem);
  line-height: 1;
}

.lede {
  margin: 1rem 0 2rem;
  color: var(--muted);
}

.large {
  width: 100%;
  padding: 0.9rem;
  font-size: 1.1rem;
}

.join {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--line);
}

.join label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.code-input {
  flex: 1;
  min-width: 0;
  text-transform: uppercase;
  letter-spacing: 0.15em;
}
</style>
