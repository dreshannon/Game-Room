<script setup lang="ts">
import { computed } from 'vue'
import { windById } from '../../../games/wind-swap/logic'

const props = defineProps<{
  wind: string
  /** Draw it as the player across the table sees it. */
  flipped?: boolean
  selected?: boolean
  disabled?: boolean
  label?: string
}>()

defineEmits<{ pick: [] }>()

const info = computed(() => windById(props.wind))

/** Which of the 25 little squares light up. The middle one is the ship. */
const marks = computed(() => {
  const cells = new Set<number>()
  for (const [right, forward] of info.value?.steps ?? []) {
    const row = props.flipped ? 2 + forward : 2 - forward
    const col = props.flipped ? 2 - right : 2 + right
    cells.add(row * 5 + col)
  }
  return cells
})
</script>

<template>
  <button
    class="wind-card"
    :class="{ selected, flipped }"
    :disabled="disabled"
    :aria-pressed="selected"
    :aria-label="`${info?.name ?? wind}${label ? `, ${label}` : ''}`"
    @click="$emit('pick')"
  >
    <span class="grid" aria-hidden="true">
      <span
        v-for="cell in 25"
        :key="cell"
        class="dot"
        :class="{ ship: cell - 1 === 12, move: marks.has(cell - 1) }"
      />
    </span>
    <span class="name">{{ info?.name ?? wind }}</span>
    <span v-if="label" class="label">{{ label }}</span>
  </button>
</template>

<style scoped>
.wind-card {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  width: 5.6rem;
  padding: 0.45rem 0.4rem 0.4rem;
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--ink);
}

.wind-card.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
  outline: 2px solid var(--accent);
}

.wind-card:disabled {
  opacity: 1;
  cursor: default;
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 2px;
  width: 3.6rem;
}

.dot {
  aspect-ratio: 1;
  border-radius: 2px;
  background: var(--line);
}

.dot.ship {
  background: var(--ink);
}

.dot.move {
  background: var(--accent);
}

.name {
  font-size: 0.85rem;
  font-weight: 700;
}

.label {
  font-size: 0.7rem;
  color: var(--muted);
}

/* Smaller cards on phones, so the board and both hands fit on one screen. */
@media (max-width: 40rem) {
  .wind-card {
    width: 4.6rem;
    gap: 0.15rem;
    padding: 0.35rem 0.3rem 0.3rem;
  }

  .grid {
    width: 2.8rem;
    gap: 1.5px;
  }

  .name {
    font-size: 0.78rem;
  }

  .label {
    font-size: 0.65rem;
    line-height: 1.1;
    text-align: center;
  }
}
</style>
