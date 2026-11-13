<script setup lang="ts">
import { computed } from 'vue'
import { PATTERNS, turn } from '../../../games/drift-lines/paths'
import { channels } from './art'

const props = defineProps<{ pattern: number; turns: number }>()
const paths = computed(() => channels(turn(PATTERNS[props.pattern]!, props.turns)))
</script>

<template>
  <svg viewBox="-4 -4 108 108" class="piece" aria-hidden="true">
    <rect x="0" y="0" width="100" height="100" rx="8" class="face" />
    <path v-for="c in paths" :key="c.key" :d="c.d" class="water" />
  </svg>
</template>

<style scoped>
.piece {
  display: block;
  width: 100%;
  height: auto;
}

.face {
  fill: var(--dl-piece);
  stroke: var(--dl-edge);
  stroke-width: 3;
}

.water {
  fill: none;
  stroke: var(--dl-water);
  stroke-width: 9;
  stroke-linecap: round;
}
</style>
