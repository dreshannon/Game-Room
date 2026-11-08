<script setup lang="ts">
import { computed } from 'vue'
import { ACTION_NAMES, cardName, type Card } from '../../games/lucky-streak/engine'

const props = defineProps<{
  card: Card
  selectable?: boolean
  selected?: boolean
  small?: boolean
  large?: boolean
}>()

defineEmits<{ select: [] }>()

// Each number gets its own color, so duplicates are easy to spot.
const style = computed(() => {
  const card = props.card
  if (card.kind !== 'number') return undefined
  const hue = (card.value * 29) % 360
  return { '--card-hue': hue }
})

const label = computed(() => {
  const card = props.card
  if (card.kind === 'number') return String(card.value)
  if (card.kind === 'modifier') return cardName(card)
  return ACTION_NAMES[card.action]
})

const caption = computed(() => {
  const card = props.card
  if (card.kind !== 'number' || !card.special) return null
  return { zero: 'The Zero', unlucky7: 'Unlucky', lucky13: 'Lucky' }[card.special]
})

const classes = computed(() => [
  props.card.kind,
  props.card.kind === 'number' ? props.card.special : null,
  { small: props.small, large: props.large },
])
</script>

<template>
  <button
    v-if="selectable"
    type="button"
    class="playing-card"
    :class="[classes, { selected }]"
    :style="style"
    :aria-pressed="selected"
    :aria-label="cardName(card)"
    @click="$emit('select')"
  >
    <span class="deco top" aria-hidden="true"></span>
    <span class="label">{{ label }}</span>
    <span v-if="caption" class="caption">{{ caption }}</span>
    <span class="deco bottom" aria-hidden="true"></span>
  </button>
  <span v-else class="playing-card" :class="classes" :style="style" role="img" :aria-label="cardName(card)">
    <span class="deco top" aria-hidden="true"></span>
    <span class="label">{{ label }}</span>
    <span v-if="caption" class="caption">{{ caption }}</span>
    <span class="deco bottom" aria-hidden="true"></span>
  </span>
</template>

<style scoped>
.playing-card {
  --card-hue: 220;
  /* Number cards: a cream face with lines and numeral in the number's own color. */
  --face: hsl(var(--card-hue) 60% 97%);
  --trim: hsl(var(--card-hue) 55% 40%);
  --text: hsl(var(--card-hue) 70% 26%);
  --w: 3.1rem;
  --h: 4.3rem;
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--w);
  height: var(--h);
  padding: 0.2rem;
  border: 2px solid var(--trim);
  border-radius: 0.45rem;
  background: var(--face);
  color: var(--text);
  font: inherit;
  font-family: Futura, 'Century Gothic', 'Avenir Next', 'Trebuchet MS', sans-serif;
  line-height: 1.05;
  text-align: center;
  /* A second, thinner border inside the first. */
  box-shadow:
    inset 0 0 0 2px var(--face),
    inset 0 0 0 3px var(--trim),
    0 1px 3px rgb(0 0 0 / 0.18);
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease,
    filter 0.4s ease;
}

.playing-card.small {
  --w: 2.3rem;
  --h: 3.2rem;
}

.playing-card.large {
  --w: var(--big-card-w, 4.4rem);
  --h: var(--big-card-h, 6.16rem);
  border-radius: 0.55rem;
}

/* Stepped trapezoids at the top and bottom, like the back of the deck. */
.deco {
  position: absolute;
  left: 50%;
  width: 58%;
  height: 13%;
  background: var(--trim);
  transform: translateX(-50%);
  clip-path: polygon(0 0, 100% 0, 80% 100%, 20% 100%);
}

.deco::after {
  content: '';
  position: absolute;
  inset: 0 26% -60%;
  background: var(--trim);
  opacity: 0.55;
  clip-path: polygon(0 0, 100% 0, 75% 100%, 25% 100%);
}

.deco.top {
  top: 4px;
}

.deco.bottom {
  bottom: 4px;
  transform: translateX(-50%) rotate(180deg);
}

.label {
  position: relative;
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.small .label {
  font-size: 1.05rem;
}

.large .label {
  font-size: 2rem;
}

.small .deco {
  height: 11%;
}

.caption {
  position: relative;
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.large .caption {
  font-size: 0.62rem;
}

/* Modifiers are gold on ink, actions are terracotta on ink. */
.modifier {
  --face: #221f1a;
  --trim: #d6a84a;
  --text: #f3d48a;
}

.action {
  --face: #221f1a;
  --trim: #e0603a;
  --text: #fbe9dc;
}

.modifier .label {
  font-size: 1.15rem;
}

.large.modifier .label {
  font-size: 1.6rem;
}

.action .label {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.large.action .label {
  font-size: 0.78rem;
}

.small.action .label {
  font-size: 0.46rem;
}

.zero,
.unlucky7 {
  --face: #2b2823;
  --trim: #ffd84d;
  --text: #ffd84d;
}

.lucky13 {
  --face: #fff1b8;
  --trim: #a07800;
  --text: #4a3600;
}

button.playing-card {
  cursor: pointer;
  outline: 3px dashed var(--accent);
  outline-offset: 2px;
}

button.playing-card:hover {
  transform: translateY(-2px);
}

button.playing-card.selected {
  outline-style: solid;
  transform: translateY(-4px);
}

:root[data-theme='dark'] .playing-card.number:not(.zero, .unlucky7, .lucky13) {
  --face: hsl(var(--card-hue) 35% 16%);
  --trim: hsl(var(--card-hue) 60% 62%);
  --text: hsl(var(--card-hue) 90% 86%);
}

:root[data-theme='dark'] .modifier,
:root[data-theme='dark'] .action {
  --face: #0f0e0c;
}
</style>
