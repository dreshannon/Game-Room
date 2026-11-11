<script setup lang="ts">
import { computed } from 'vue'

// A die: a square with pips for 1–6, a pentagon for the 1–12 lantern, a hexagon for the 1–20.
const props = defineProps<{ sides: number; value?: number | null; off?: boolean; dashed?: boolean }>()

const PIPS: Record<number, [number, number][]> = {
  1: [[20, 20]],
  2: [[12, 12], [28, 28]],
  3: [[12, 12], [20, 20], [28, 28]],
  4: [[12, 12], [28, 12], [12, 28], [28, 28]],
  5: [[12, 12], [28, 12], [20, 20], [12, 28], [28, 28]],
  6: [[12, 11], [28, 11], [12, 20], [28, 20], [12, 29], [28, 29]],
}
const shape = computed(() => {
  if (props.sides === 12) return 'M20 3 L37 15 L31 36 L9 36 L3 15 Z'
  if (props.sides > 12) return 'M20 2 L36 11 L36 29 L20 38 L4 29 L4 11 Z'
  return null
})
const pips = computed(() => (props.sides === 6 && props.value ? PIPS[props.value] ?? [] : []))
</script>

<template>
  <svg viewBox="0 0 40 40" class="die" :class="{ off, dashed }" role="img" :aria-label="value ? `${value}` : `1 to ${sides}`">
    <rect v-if="!shape" x="2" y="2" width="36" height="36" rx="8" class="shape" />
    <path v-else :d="shape" class="shape" />
    <circle v-for="(p, i) in pips" :key="i" :cx="p[0]" :cy="p[1]" r="3.6" class="pip" />
    <text v-if="sides !== 6 && value" x="20" y="21" class="num">{{ value }}</text>
    <text v-else-if="sides !== 6" x="20" y="21" class="num small">{{ sides }}</text>
  </svg>
</template>

<style scoped>
.die {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
}

.shape {
  fill: var(--surface);
  stroke: var(--ink);
  stroke-width: 2.5;
  stroke-linejoin: round;
}

.pip {
  fill: var(--ink);
}

.num {
  fill: var(--ink);
  font-size: 15px;
  font-weight: 800;
  text-anchor: middle;
  dominant-baseline: middle;
}

.num.small {
  font-size: 12px;
}

.dashed .shape {
  stroke-dasharray: 4 3;
}

.off .shape {
  stroke: var(--line);
  fill: transparent;
}

.off .pip,
.off .num {
  fill: var(--line);
}
</style>
