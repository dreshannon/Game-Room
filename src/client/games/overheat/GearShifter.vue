<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { COOLDOWN_BY_GEAR, MAX_GEAR } from '../../../games/overheat/logic'

const props = defineProps<{
  /** The gear the knob shows. */
  gear: number
  /** The car's gear now, which shifts are measured from. */
  current: number
  engine: number
  disabled?: boolean
}>()

const emit = defineEmits<{ shift: [gear: number] }>()

/** Top to bottom, like a real shifter: 4th at the top. */
const gears = Array.from({ length: MAX_GEAR }, (_, i) => MAX_GEAR - i)

const cost = (g: number) => {
  const shift = Math.abs(g - props.current)
  return shift > 2 ? null : shift === 2 ? 1 : 0
}
const reachable = (g: number) => !props.disabled && cost(g) !== null && !(cost(g) === 1 && props.engine === 0)

/** Where the knob sits, from 0 at the top stop to 1 at the bottom. */
const knobAt = (g: number) => (MAX_GEAR - g) / (MAX_GEAR - 1)

// While dragging, the knob follows the pointer; it snaps to a gear when let go.
const slot = ref<HTMLElement | null>(null)
const dragAt = ref<number | null>(null)
const knobPos = computed(() => dragAt.value ?? knobAt(props.gear))

// A little clunk each time the gear changes.
const clunk = ref(0)
watch(
  () => props.gear,
  (next, prev) => {
    if (prev !== undefined && next !== prev) clunk.value++
  },
)

function fractionAt(event: PointerEvent) {
  const rect = slot.value!.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
}

function nearestReachable(fraction: number) {
  const options = gears.filter(reachable)
  if (!options.length) return props.gear
  return options.reduce((best, g) =>
    Math.abs(knobAt(g) - fraction) < Math.abs(knobAt(best) - fraction) ? g : best,
  )
}

function onDown(event: PointerEvent) {
  if (props.disabled) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragAt.value = fractionAt(event)
}

function onMove(event: PointerEvent) {
  if (dragAt.value === null) return
  dragAt.value = fractionAt(event)
}

function onUp(event: PointerEvent) {
  if (dragAt.value === null) return
  const g = nearestReachable(fractionAt(event))
  dragAt.value = null
  if (g !== props.gear) emit('shift', g)
}

function pick(g: number) {
  if (reachable(g) && g !== props.gear) emit('shift', g)
}

function onKey(event: KeyboardEvent) {
  const step = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  event.preventDefault()
  for (let g = props.gear + step; g >= 1 && g <= MAX_GEAR; g += step) {
    if (reachable(g)) return pick(g)
  }
}
</script>

<template>
  <div
    class="shifter"
    :class="{ disabled, dragging: dragAt !== null }"
    role="radiogroup"
    aria-label="Gear"
    :aria-disabled="disabled"
    @keydown="onKey"
  >
    <div class="gate">
      <div ref="slot" class="slot" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">
        <span v-for="g in gears" :key="g" class="notch" :style="{ top: `${knobAt(g) * 100}%` }" />
        <div class="knob-track" :style="{ transform: `translateY(${knobPos * 100}%)` }">
          <div :key="clunk" class="knob" :class="{ clunk: clunk > 0 }">
            <span>{{ gear }}</span>
          </div>
        </div>
      </div>
    </div>

    <ol class="labels">
      <li v-for="g in gears" :key="g" :style="{ top: `${knobAt(g) * 100}%` }">
        <button
          type="button"
          role="radio"
          :aria-checked="gear === g"
          :tabindex="gear === g ? 0 : -1"
          :class="{ chosen: gear === g, now: current === g && gear !== g }"
          :disabled="!reachable(g) && gear !== g"
          @click="pick(g)"
        >
          <strong>{{ g }}</strong>
          <span class="sub">
            {{ g }} card{{ g === 1 ? '' : 's' }}
            <template v-if="COOLDOWN_BY_GEAR[g]"><br />cool {{ COOLDOWN_BY_GEAR[g] }}</template>
          </span>
          <span v-if="!disabled && cost(g) === 1" class="cost">1 Heat</span>
        </button>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.shifter {
  --slot-h: 15rem;
  display: grid;
  grid-template-columns: 2.6rem auto;
  gap: 0.5rem;
  padding: 1.5rem 0.5rem 1.5rem 0.4rem;
  border-radius: 0.8rem;
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.08), transparent 60%),
    repeating-linear-gradient(45deg, #26262b 0 3px, #222226 3px 6px);
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.6),
    0 1px 0 rgba(255, 255, 255, 0.06);
  color: #f1f1f1;
  user-select: none;
}

.gate {
  display: flex;
  justify-content: center;
}

.slot {
  position: relative;
  width: 0.9rem;
  height: var(--slot-h);
  border-radius: 999px;
  background: #0d0d0f;
  box-shadow:
    inset 0 2px 4px rgba(0, 0, 0, 0.9),
    0 0 0 2px #3a3a40;
  cursor: grab;
  touch-action: none;
}

.dragging .slot {
  cursor: grabbing;
}

.disabled .slot {
  cursor: default;
}

.notch {
  position: absolute;
  left: 50%;
  width: 1.7rem;
  height: 3px;
  border-radius: 2px;
  background: #4a4a52;
  transform: translate(-50%, -50%);
}

/* The track is the slot's full height, so translateY(100%) moves the knob from top to bottom. */
.knob-track {
  position: absolute;
  inset: 0 0 auto;
  height: 100%;
  transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
}

.dragging .knob-track {
  transition: none;
}

.knob {
  position: absolute;
  top: 0;
  left: 50%;
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ff8a5c, #d62828 55%, #7a0f0f);
  box-shadow:
    0 5px 8px rgba(0, 0, 0, 0.6),
    inset 0 -3px 6px rgba(0, 0, 0, 0.35),
    inset 0 2px 3px rgba(255, 255, 255, 0.35);
  transform: translate(-50%, -50%);
  font-size: 1.15rem;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.disabled .knob {
  background: radial-gradient(circle at 35% 30%, #9a9aa3, #5c5c66 55%, #2c2c33);
}

.knob.clunk {
  animation: clunk 0.45s ease-out;
}

@keyframes clunk {
  0% {
    transform: translate(-50%, -50%) scale(1);
  }
  35% {
    transform: translate(-50%, -50%) scale(0.86) rotate(-8deg);
  }
  65% {
    transform: translate(-50%, -50%) scale(1.08) rotate(4deg);
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
}

.labels {
  position: relative;
  height: var(--slot-h);
  min-width: 4.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.labels li {
  position: absolute;
  left: 0;
  transform: translateY(-50%);
}

.labels button {
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 0.35rem;
  align-items: center;
  padding: 0.15rem 0.35rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: inherit;
  text-align: left;
}

.labels button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.labels button:disabled {
  opacity: 0.35;
}

.labels strong {
  grid-row: span 2;
  font-size: 1.3rem;
  line-height: 1;
}

.labels .chosen strong {
  color: #ff6b4a;
}

.labels .now strong {
  text-decoration: underline dotted;
}

.sub {
  font-size: 0.68rem;
  line-height: 1.15;
  opacity: 0.75;
}

.cost {
  grid-column: 2;
  color: #ff8a5c;
  font-size: 0.68rem;
  font-weight: 800;
}

/* On phones, just the numbers, so the cards keep their room. */
@media (max-width: 560px) {
  .shifter {
    --slot-h: 12rem;
    grid-template-columns: 2.4rem auto;
    gap: 0.2rem;
    padding-right: 0.3rem;
  }

  .labels {
    min-width: 1.6rem;
  }

  .sub {
    display: none;
  }

  .cost {
    grid-column: 1;
    font-size: 0.6rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .knob-track {
    transition-duration: 0.01s;
  }

  .knob.clunk {
    animation: none;
  }
}
</style>
