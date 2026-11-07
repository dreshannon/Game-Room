<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  count: number
  label: string
  /** The discard pile is drawn quieter than the deck. */
  muted?: boolean
}>()

/** Fewer cards show as a thinner stack, and an empty pile as a dashed outline. */
const layers = computed(() => Math.min(3, Math.max(1, props.count)))
const CARD = { w: 97, h: 134, r: 24, step: 12 }
</script>

<template>
  <figure class="stack" :class="{ muted, empty: count === 0 }" :aria-label="`${label}: ${count} card${count === 1 ? '' : 's'}`">
    <svg :viewBox="`-3 -3 ${CARD.w + CARD.step * 2 + 6} ${CARD.h + 6}`" aria-hidden="true">
      <rect
        v-for="i in layers"
        :key="`${layers}-${i}`"
        :x="CARD.step * (3 - layers + i - 1)"
        y="0"
        :width="CARD.w"
        :height="CARD.h"
        :rx="CARD.r"
        class="card"
      />
      <text :x="CARD.step * 2 + CARD.w / 2" :y="CARD.h / 2" class="count">{{ count }}</text>
    </svg>
    <figcaption>{{ label }}</figcaption>
  </figure>
</template>

<style scoped>
.stack {
  display: grid;
  justify-items: center;
  gap: 0.15rem;
  margin: 0;
}

svg {
  width: 3.1rem;
  height: auto;
  overflow: visible;
}

.card {
  fill: var(--surface);
  stroke: var(--accent);
  stroke-width: 5;
  transition: x 0.25s ease;
}

.muted .card {
  stroke: var(--muted);
}

.empty .card {
  fill: transparent;
  stroke: var(--line);
  stroke-dasharray: 10 8;
}

.count {
  fill: var(--ink);
  font-size: 66px;
  font-weight: 800;
  text-anchor: middle;
  dominant-baseline: central;
}

.empty .count {
  fill: var(--muted);
}

figcaption {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
</style>
