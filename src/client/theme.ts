import { computed, ref, watch } from 'vue'

export type Theme = 'light' | 'dark'

// index.html applies the saved theme before the page draws, so it doesn't flash.
const KEY = 'theme'

function readSaved(): Theme | null {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

const systemQuery = window.matchMedia('(prefers-color-scheme: dark)')
const systemTheme = ref<Theme>(systemQuery.matches ? 'dark' : 'light')
systemQuery.addEventListener('change', (event) => {
  systemTheme.value = event.matches ? 'dark' : 'light'
})

/** The theme the player picked, or null to follow their device. */
const chosen = ref<Theme | null>(readSaved())

export const theme = computed<Theme>(() => chosen.value ?? systemTheme.value)

watch(
  theme,
  (value) => {
    document.documentElement.dataset.theme = value
  },
  { immediate: true },
)

export function toggleTheme() {
  chosen.value = theme.value === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(KEY, chosen.value)
  } catch {
    // The choice just won't be remembered.
  }
}
