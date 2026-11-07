<script setup lang="ts">
import { computed } from 'vue'
import type { Card } from '../../../games/overheat/logic'

const props = defineProps<{
  card: Card | null
  selected?: boolean
  disabled?: boolean
  small?: boolean
  boost?: boolean
  fromStress?: boolean
  marked?: 'discard'
}>()

defineEmits<{ click: [] }>()

const label = computed(() => {
  const card = props.card
  if (!card) return 'No card'
  if (card.kind === 'heat') return 'Heat'
  if (card.kind === 'stress') return 'Stress'
  return `${card.kind === 'upgrade' ? 'Upgrade' : 'Speed'} ${card.value}`
})
</script>

<template>
  <button
    type="button"
    class="race-card"
    :class="[card?.kind ?? 'empty', `v${card?.value ?? 0}`, { selected, small, boost, discard: marked === 'discard' }]"
    :aria-pressed="selected"
    :aria-label="`${label}${boost ? ' from a Boost' : ''}${fromStress ? ' from a Stress card' : ''}`"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <template v-if="!card"><span class="big">0</span></template>
    <template v-else-if="card.kind === 'heat'">
      <span class="icon">🔥</span>
      <span class="name">Heat</span>
    </template>
    <template v-else-if="card.kind === 'stress'">
      <span class="big">?</span>
      <span class="name">Stress</span>
    </template>
    <template v-else>
      <span class="big">{{ card.value }}</span>
      <span class="name">{{ boost ? 'Boost' : fromStress ? 'Stress' : card.kind === 'upgrade' ? 'Special' : 'Speed' }}</span>
    </template>
  </button>
</template>

<style scoped>
.race-card {
  position: relative;
  display: grid;
  place-items: center;
  align-content: center;
  width: 3.6rem;
  height: 5rem;
  padding: 0.2rem;
  border: 2px solid rgba(0, 0, 0, 0.25);
  border-radius: 0.5rem;
  color: #fff;
  background: #555;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.2);
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}

@media (max-width: 560px) {
  .race-card {
    width: 3rem;
    height: 4.3rem;
  }

  .big {
    font-size: 1.6rem;
  }
}

.race-card.small {
  width: 2.6rem;
  height: 3.6rem;
}

.race-card:disabled {
  opacity: 1;
  cursor: default;
}

.big {
  font-size: 1.9rem;
  font-weight: 900;
  line-height: 1;
}

.small .big {
  font-size: 1.35rem;
}

.icon {
  font-size: 1.5rem;
  line-height: 1;
}

.name {
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.9;
}

.small .name {
  font-size: 0.5rem;
}

.speed.v1 {
  background: linear-gradient(160deg, #4cc9f0, #3a86ff);
}

.speed.v2 {
  background: linear-gradient(160deg, #52b788, #2d6a4f);
}

.speed.v3 {
  background: linear-gradient(160deg, #f9c74f, #f3722c);
  color: #1b1b1b;
}

.speed.v4 {
  background: linear-gradient(160deg, #f94144, #9d0208);
}

.upgrade {
  background: repeating-linear-gradient(135deg, #3d405b 0 6px, #2b2d42 6px 12px);
  border-color: #e9c46a;
}

.heat {
  background: linear-gradient(160deg, #ff9e00, #d00000);
}

.stress {
  background: linear-gradient(160deg, #ffe066, #fab005);
  color: #1b1b1b;
}

.boost {
  outline: 2px dashed #ffd60a;
  outline-offset: 2px;
}

.selected {
  transform: translateY(-0.45rem);
  box-shadow:
    0 0 0 3px var(--accent),
    0 6px 10px rgba(0, 0, 0, 0.25);
}

.discard.selected {
  box-shadow:
    0 0 0 3px #e5383b,
    0 6px 10px rgba(0, 0, 0, 0.25);
  opacity: 0.7;
}

.heat:disabled,
.stress:disabled {
  filter: saturate(0.85);
}
</style>
