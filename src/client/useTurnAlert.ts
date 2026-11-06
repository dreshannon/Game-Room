import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

const SOUND_KEY = 'turnSound'

function readSoundSetting() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * Tells a player when it becomes their turn: a chime if sound is on, and a flashing tab
 * title (plus a buzz on phones that support it) while they're looking at another tab.
 */
export function useTurnAlert(isYourTurn: Ref<boolean>) {
  const soundOn = ref(readSoundSetting())
  const baseTitle = document.title
  let audio: AudioContext | null = null
  let flashTimer: ReturnType<typeof setInterval> | undefined

  // Browsers only allow sound after the person has interacted with the page.
  const unlockAudio = () => {
    audio ??= new AudioContext()
    void audio.resume()
  }
  window.addEventListener('pointerdown', unlockAudio, { once: true })

  function chime() {
    if (!soundOn.value || !audio || audio.state !== 'running') return
    const now = audio.currentTime
    for (const [offset, frequency] of [
      [0, 660],
      [0.14, 880],
    ] as const) {
      const tone = audio.createOscillator()
      const volume = audio.createGain()
      tone.frequency.value = frequency
      volume.gain.setValueAtTime(0.0001, now + offset)
      volume.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02)
      volume.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.3)
      tone.connect(volume).connect(audio.destination)
      tone.start(now + offset)
      tone.stop(now + offset + 0.32)
    }
  }

  function stopFlashing() {
    clearInterval(flashTimer)
    flashTimer = undefined
    document.title = baseTitle
  }

  function startFlashing() {
    if (flashTimer) return
    let on = true
    document.title = '● Your turn!'
    flashTimer = setInterval(() => {
      on = !on
      document.title = on ? '● Your turn!' : baseTitle
    }, 1000)
  }

  const onVisibilityChange = () => {
    if (!document.hidden) stopFlashing()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  watch(isYourTurn, (yourTurn, wasYourTurn) => {
    if (!yourTurn) return stopFlashing()
    if (wasYourTurn) return
    chime()
    if (document.hidden) {
      startFlashing()
      navigator.vibrate?.(200)
    }
  })

  function toggleSound() {
    soundOn.value = !soundOn.value
    unlockAudio()
    try {
      localStorage.setItem(SOUND_KEY, soundOn.value ? 'on' : 'off')
    } catch {
      // The setting just won't be remembered.
    }
  }

  onBeforeUnmount(() => {
    stopFlashing()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pointerdown', unlockAudio)
    void audio?.close()
  })

  return { soundOn, toggleSound }
}
