import { computed, ref, watch, type Ref } from 'vue'

// Before turn alerts and game sounds were split, one setting covered both.
const LEGACY_KEY = 'turnSound'

function read(key: string) {
  try {
    const saved = localStorage.getItem(key)
    if (saved !== null) return saved !== 'off'
    return localStorage.getItem(LEGACY_KEY) !== 'off'
  } catch {
    return true
  }
}

function remembered(key: string) {
  const setting = ref(read(key))
  watch(setting, (on) => {
    try {
      localStorage.setItem(key, on ? 'on' : 'off')
    } catch {
      // The setting just won't be remembered.
    }
  })
  return setting
}

/** The chime when it becomes your turn. */
export const turnAlertsOn: Ref<boolean> = remembered('turnAlerts')

/** Sound effects inside the games, like cards flipping. */
export const gameSoundsOn: Ref<boolean> = remembered('gameSounds')

export const allMuted = computed(() => !turnAlertsOn.value && !gameSoundsOn.value)

/** Mutes everything, or turns everything back on when it's all muted. */
export function toggleMuteAll() {
  const on = allMuted.value
  turnAlertsOn.value = on
  gameSoundsOn.value = on
}
