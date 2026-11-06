<script setup lang="ts">
import { computed } from 'vue'
import { ACTION_NAMES, cardName, type Card } from '../../games/lucky-streak/engine'

const props = defineProps<{
  card: Card
  selectable?: boolean
  selected?: boolean
  small?: boolean
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
</script>

<template>
  <button
    v-if="selectable"
    type="button"
    class="playing-card"
    :class="[card.kind, card.kind === 'number' ? card.special : null, { selected, small }]"
    :style="style"
    :aria-pressed="selected"
    :aria-label="cardName(card)"
    @click="$emit('select')"
  >
    <span class="label">{{ label }}</span>
    <span v-if="caption" class="caption">{{ caption }}</span>
  </button>
  <span
    v-else
    class="playing-card"
    :class="[card.kind, card.kind === 'number' ? card.special : null, { small }]"
    :style="style"
    role="img"
    :aria-label="cardName(card)"
  >
    <span class="label">{{ label }}</span>
    <span v-if="caption" class="caption">{{ caption }}</span>
  </span>
</template>

<style scoped>
.playing-card {
  --card-hue: 220;
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 3.1rem;
  height: 4.3rem;
  padding: 0.2rem;
  border: 2px solid hsl(var(--card-hue) 55% 38%);
  border-radius: 0.45rem;
  background: hsl(var(--card-hue) 80% 94%);
  color: hsl(var(--card-hue) 70% 25%);
  font: inherit;
  line-height: 1.1;
  text-align: center;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
}

.playing-card.small {
  width: 2.3rem;
  height: 3.2rem;
}

.label {
  font-size: 1.4rem;
  font-weight: 800;
}

.small .label {
  font-size: 1.05rem;
}

.caption {
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
}

.modifier,
.action {
  border-color: #222222;
  background: #2b2b2b;
  color: #ffffff;
}

.modifier .label {
  font-size: 1.15rem;
}

.action .label {
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
}

.zero,
.unlucky7 {
  border-color: #111111;
  background: #3a3a3a;
  color: #ffd84d;
}

.lucky13 {
  border-color: #a07800;
  background: #ffe680;
  color: #4a3600;
}

button.playing-card {
  cursor: pointer;
  outline: 3px dashed var(--accent);
  outline-offset: 2px;
}

button.playing-card.selected {
  outline-style: solid;
  transform: translateY(-4px);
}

@media (prefers-color-scheme: dark) {
  .playing-card:not(.modifier, .action, .zero, .unlucky7, .lucky13) {
    background: hsl(var(--card-hue) 45% 22%);
    color: hsl(var(--card-hue) 90% 88%);
    border-color: hsl(var(--card-hue) 60% 60%);
  }
}
</style>
