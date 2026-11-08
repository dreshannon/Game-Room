<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { allMuted, gameSoundsOn, toggleMuteAll, turnAlertsOn } from '../soundSettings'

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const label = computed(() => {
  if (allMuted.value) return 'Muted'
  if (!gameSoundsOn.value) return 'Sound: alerts only'
  if (!turnAlertsOn.value) return 'Sound: game only'
  return 'Sound on'
})

function onOutside(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('pointerdown', onOutside)
    document.removeEventListener('keydown', onKey)
  }
})

onBeforeUnmount(() => (open.value = false))
</script>

<template>
  <div ref="root" class="sound-menu">
    <button
      type="button"
      aria-haspopup="true"
      :aria-expanded="open"
      aria-controls="sound-settings"
      @click="open = !open"
    >
      {{ label }} <span aria-hidden="true">▾</span>
    </button>
    <div v-if="open" id="sound-settings" class="panel-pop" role="group" aria-label="Sound settings">
      <label class="toggle">
        <input v-model="turnAlertsOn" type="checkbox" />
        <span>
          <strong>Turn alerts</strong>
          <span class="muted">A chime when it’s your turn</span>
        </span>
      </label>
      <label class="toggle">
        <input v-model="gameSoundsOn" type="checkbox" />
        <span>
          <strong>Game sounds</strong>
          <span class="muted">Effects like cards flipping</span>
        </span>
      </label>
      <button type="button" class="mute-all" @click="toggleMuteAll">
        {{ allMuted ? 'Unmute all' : 'Mute all' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sound-menu {
  position: relative;
}

.panel-pop {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  z-index: 20;
  display: grid;
  gap: 0.6rem;
  width: max-content;
  max-width: min(17rem, calc(100vw - 2rem));
  padding: 0.75rem;
  border: 2px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.15);
}

.toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  cursor: pointer;
}

.toggle input {
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
  accent-color: var(--accent);
}

.toggle > span {
  display: grid;
}

.toggle .muted {
  font-size: 0.8rem;
}

.mute-all {
  width: 100%;
}
</style>
