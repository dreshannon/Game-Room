<script setup lang="ts">
import { computed } from 'vue'
import { MASCOTS } from '../../../games/mascot-mayhem/data'
import type { RaceCard } from '../../../games/mascot-mayhem/race'
import { describeCard } from './describe'
import MascotSprite from './MascotSprite.vue'

const props = defineProps<{
  card: RaceCard
  size?: 'small' | 'big'
  selected?: boolean
  /** Shows as a button, for picking cards from your hand. */
  pickable?: boolean
}>()

defineEmits<{ click: [] }>()

const mascot = computed(() => (props.card.mascot === null ? null : MASCOTS[props.card.mascot]!))

const face = computed(() => describeCard(props.card))
</script>

<template>
  <component
    :is="pickable ? 'button' : 'div'"
    :type="pickable ? 'button' : undefined"
    class="race-card"
    :class="[size ?? 'normal', { everyone: !mascot, selected, starter: card.starter }]"
    :style="mascot ? { '--card': mascot.color } : undefined"
    :aria-pressed="pickable ? selected : undefined"
    :aria-label="face.text"
    @click="$emit('click')"
  >
    <span class="band">
      <svg v-if="mascot" viewBox="-26 -30 56 54" class="face" aria-hidden="true">
        <MascotSprite :animal="mascot.animal" :color="mascot.color" />
      </svg>
      <span v-else class="all">ALL</span>
    </span>
    <span class="symbol">{{ face.symbol }}</span>
    <span class="text">{{ face.text }}</span>
  </component>
</template>

<style scoped>
.race-card {
  --card: #8d6bd6;
  display: grid;
  grid-template-rows: auto 1fr auto;
  justify-items: center;
  width: 5.4rem;
  min-height: 7.6rem;
  padding: 0 0 0.4rem;
  overflow: hidden;
  border: 3px solid var(--card);
  border-radius: 0.7rem;
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.18);
  font: inherit;
  text-align: center;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}

button.race-card {
  cursor: pointer;
}

.everyone {
  border-image: linear-gradient(135deg, #e4572e, #f2b705, #2fbf71, #4d7cfe) 1;
  border-radius: 0;
}

.starter {
  outline: 2px dashed var(--card);
  outline-offset: 2px;
}

.selected {
  transform: translateY(-0.4rem);
  box-shadow:
    0 0 0 3px var(--accent),
    0 8px 14px rgba(0, 0, 0, 0.25);
}

.band {
  display: grid;
  place-items: center;
  width: 100%;
  height: 2.4rem;
  background: var(--card);
}

.everyone .band {
  background: linear-gradient(90deg, #e4572e, #f2b705, #2fbf71, #4d7cfe);
}

.face {
  width: 2.6rem;
  height: 2.6rem;
  margin-top: 0.2rem;
}

.all {
  color: #fff;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.symbol {
  align-self: center;
  font-size: 1.9rem;
  font-weight: 900;
  line-height: 1;
}

.text {
  padding: 0 0.3rem;
  font-size: 0.66rem;
  line-height: 1.2;
  color: var(--muted);
}

.small {
  width: 4.2rem;
  min-height: 6rem;
}

.small .band {
  height: 1.9rem;
}

.small .face {
  width: 2rem;
  height: 2rem;
}

.small .symbol {
  font-size: 1.45rem;
}

.small .text {
  font-size: 0.58rem;
}

.big {
  width: 9rem;
  min-height: 12.5rem;
  border-width: 4px;
  animation: flip 0.55s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.big .band {
  height: 4rem;
}

.big .face {
  width: 4.2rem;
  height: 4.2rem;
}

.big .symbol {
  font-size: 3.6rem;
}

.big .text {
  font-size: 0.85rem;
  color: var(--ink);
}

@keyframes flip {
  from {
    transform: perspective(600px) rotateY(100deg) scale(0.85);
    opacity: 0.2;
  }
  to {
    transform: perspective(600px) rotateY(0) scale(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .big {
    animation: none;
  }
}
</style>
