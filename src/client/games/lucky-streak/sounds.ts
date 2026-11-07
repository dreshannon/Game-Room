import { soundOn } from '../../useTurnAlert'

/**
 * Small card-table sounds made with the Web Audio API, so there are no files to load.
 * They follow the room's Sound on/off button. Browsers only allow sound after the page
 * has been clicked or tapped, so anything before that stays silent.
 */

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (!soundOn.value || typeof window === 'undefined' || !('AudioContext' in window)) return null
  if (!context) {
    try {
      context = new AudioContext()
    } catch {
      return null
    }
  }
  if (context.state === 'suspended') void context.resume().catch(() => {})
  return context.state === 'running' ? context : null
}

// Wake the audio up on the first tap, so later sounds can play.
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (soundOn.value) audio()
  }
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
}

let noise: AudioBuffer | null = null
function noiseBuffer(ctx: AudioContext) {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return noise
}

/** A burst of filtered noise, like a card snapping. */
function swish(ctx: AudioContext, at: number, length: number, frequency: number, volume: number) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(frequency, at)
  filter.frequency.exponentialRampToValueAtTime(frequency * 2.2, at + length)
  filter.Q.value = 1.2
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(at)
  source.stop(at + length + 0.02)
}

function tone(
  ctx: AudioContext,
  at: number,
  length: number,
  frequency: number,
  volume: number,
  type: OscillatorType = 'sine',
  slideTo?: number,
) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, at)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + length)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  osc.connect(gain).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + length + 0.02)
}

export const sounds = {
  flip() {
    const ctx = audio()
    if (!ctx) return
    swish(ctx, ctx.currentTime, 0.09, 1800, 0.35)
  },
  land() {
    const ctx = audio()
    if (!ctx) return
    swish(ctx, ctx.currentTime, 0.05, 900, 0.18)
  },
  bust() {
    const ctx = audio()
    if (!ctx) return
    const now = ctx.currentTime
    tone(ctx, now, 0.45, 220, 0.25, 'sawtooth', 70)
    tone(ctx, now + 0.02, 0.35, 160, 0.2, 'square', 60)
    swish(ctx, now, 0.2, 300, 0.3)
  },
  flip7() {
    const ctx = audio()
    if (!ctx) return
    const now = ctx.currentTime
    ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, i) => {
      tone(ctx, now + i * 0.09, 0.5, frequency, 0.16, 'triangle')
    })
  },
  freeze() {
    const ctx = audio()
    if (!ctx) return
    const now = ctx.currentTime
    ;[1760, 2349, 2637].forEach((frequency, i) => tone(ctx, now + i * 0.06, 0.4, frequency, 0.06))
  },
  play() {
    const ctx = audio()
    if (!ctx) return
    const now = ctx.currentTime
    swish(ctx, now, 0.12, 1200, 0.3)
    tone(ctx, now, 0.15, 660, 0.06, 'triangle', 880)
  },
  shuffle() {
    const ctx = audio()
    if (!ctx) return
    const now = ctx.currentTime
    for (let i = 0; i < 9; i++) swish(ctx, now + i * 0.045, 0.05, 1400 + Math.random() * 800, 0.18)
  },
  tally() {
    const ctx = audio()
    if (!ctx) return
    tone(ctx, ctx.currentTime, 0.08, 1320, 0.05, 'triangle')
  },
}
