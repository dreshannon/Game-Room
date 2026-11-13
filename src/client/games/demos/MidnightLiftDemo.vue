<script setup lang="ts">
// Practice for the lobby: play the Watch on a tiny map. Search for the thief's trail, then make one arrest.
import { computed, ref } from 'vue'
import type { PublicPlayer } from '../../../shared/protocol'
import DemoFrame from './DemoFrame.vue'

defineProps<{ you: string; players: PublicPlayer[] }>()

const SIZE = 5
const STEPS = 4
const SEARCHES = 6

/** Doorways one step away: up, down, left and right. */
function neighbours(cell: number) {
  const row = Math.floor(cell / SIZE)
  const column = cell % SIZE
  const out: number[] = []
  if (row > 0) out.push(cell - SIZE)
  if (row < SIZE - 1) out.push(cell + SIZE)
  if (column > 0) out.push(cell - 1)
  if (column < SIZE - 1) out.push(cell + 1)
  return out
}

/** A walk from the job that never doubles back on itself. */
function makeTrail(): number[] {
  for (;;) {
    const trail = [Math.floor(Math.random() * SIZE * SIZE)]
    while (trail.length <= STEPS) {
      const open = neighbours(trail.at(-1)!).filter((cell) => !trail.includes(cell))
      if (!open.length) break
      trail.push(open[Math.floor(Math.random() * open.length)]!)
    }
    if (trail.length === STEPS + 1) return trail
  }
}

const trail = ref<number[]>([])
const searched = ref<number[]>([])
const mode = ref<'search' | 'arrest'>('search')
const arrested = ref<number | null>(null)

const job = computed(() => trail.value[0]!)
const hideout = computed(() => trail.value.at(-1)!)
const searchesLeft = computed(() => SEARCHES - searched.value.length)
const done = computed(() => arrested.value !== null)
const caught = computed(() => arrested.value === hideout.value)

const status = computed(() => {
  if (done.value) return caught.value ? 'Got them!' : 'Wrong doorway. The thief slips away.'
  if (mode.value === 'arrest') return 'Tap the doorway where the thief is hiding.'
  return 'Tap a doorway to search it for the trail.'
})

const overLine = computed(() => {
  if (!done.value) return ''
  return caught.value ? 'A clean arrest. The numbers show the route.' : 'The numbers show the route they took.'
})

function restart() {
  trail.value = makeTrail()
  searched.value = []
  mode.value = 'search'
  arrested.value = null
}

function tap(cell: number) {
  if (done.value) return
  if (mode.value === 'arrest') {
    arrested.value = cell
    return
  }
  if (cell === job.value || searched.value.includes(cell)) return
  searched.value = [...searched.value, cell]
  if (searchesLeft.value === 0) mode.value = 'arrest'
}

/** What a doorway shows: its step number once the game is over, a lantern on a found trail. */
function mark(cell: number) {
  const step = trail.value.indexOf(cell)
  if (done.value && step > 0) return String(step)
  if (cell === job.value) return 'Job'
  return ''
}

function describe(cell: number) {
  if (cell === job.value) return 'the job'
  if (done.value && cell === hideout.value) return 'the thief was here'
  if (searched.value.includes(cell)) return trail.value.includes(cell) ? 'on the trail' : 'searched, nothing'
  return 'not searched'
}

restart()
</script>

<template>
  <DemoFrame label="track the thief" :over="overLine" @restart="restart">
    <p class="muted brief">
      The thief robbed the doorway marked Job, then took {{ STEPS }} steps and hid. A step goes up, down, left or right,
      never back onto the trail.
    </p>
    <p class="status" aria-live="polite">{{ status }}</p>
    <div class="map" :class="{ arresting: mode === 'arrest' && !done }">
      <button
        v-for="cell in SIZE * SIZE"
        :key="cell"
        class="doorway"
        :class="{
          job: cell - 1 === job,
          lit: searched.includes(cell - 1) && trail.includes(cell - 1),
          empty: searched.includes(cell - 1) && !trail.includes(cell - 1),
          route: done && trail.includes(cell - 1),
          hideout: done && cell - 1 === hideout,
          arrested: arrested === cell - 1,
        }"
        :disabled="done"
        :aria-label="`Doorway ${cell}: ${describe(cell - 1)}`"
        @click="tap(cell - 1)"
      >
        {{ mark(cell - 1) }}
      </button>
    </div>
    <div v-if="!done" class="row modes">
      <button :class="{ primary: mode === 'search' }" :aria-pressed="mode === 'search'" :disabled="searchesLeft === 0" @click="mode = 'search'">
        Search ({{ searchesLeft }} left)
      </button>
      <button :class="{ primary: mode === 'arrest' }" :aria-pressed="mode === 'arrest'" @click="mode = 'arrest'">Arrest</button>
    </div>
    <p class="muted key">
      <span class="swatch lit"></span> on the trail <span class="swatch empty"></span> nothing there
    </p>
  </DemoFrame>
</template>

<style scoped>
.brief {
  max-width: 26rem;
  font-size: 0.9rem;
}

.status {
  font-weight: 700;
}

.map {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.4rem;
  width: min(100%, 17rem);
  padding: 0.5rem;
  border-radius: var(--radius);
  background: var(--line);
}

.doorway {
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 800;
}

.doorway:disabled {
  opacity: 1;
  cursor: default;
}

.doorway.job {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--paper);
}

.doorway.route {
  border-color: var(--accent);
}

.doorway.lit,
.swatch.lit {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.doorway.empty,
.swatch.empty {
  border: 2px dashed var(--muted);
  background: var(--paper);
}

.doorway.hideout {
  outline: 3px solid var(--ink);
  outline-offset: 2px;
}

.doorway.arrested:not(.hideout) {
  outline: 3px dashed var(--muted);
  outline-offset: 2px;
}

.arresting .doorway {
  cursor: crosshair;
}

.modes {
  justify-content: center;
}

.key {
  font-size: 0.85rem;
}

.swatch {
  display: inline-block;
  width: 0.8rem;
  height: 0.8rem;
  margin-left: 0.5rem;
  border: 1px solid var(--muted);
  border-radius: 50%;
  vertical-align: middle;
}
</style>
