<script setup lang="ts">
import { computed } from 'vue'
import CardBack from './CardBack.vue'

const props = defineProps<{
  count: number
  /** Whether you can click the deck to flip a card. */
  active: boolean
  shuffling?: boolean
}>()

defineEmits<{ draw: [] }>()

/** The pile looks thinner as it runs down. */
const layers = computed(() => (props.count > 40 ? 3 : props.count > 12 ? 2 : props.count > 1 ? 1 : 0))
</script>

<template>
  <div class="deck-wrap">
    <button
      type="button"
      class="deck"
      :class="{ active, shuffling, empty: count === 0 }"
      :disabled="!active"
      :aria-label="active ? `Flip a card (${count} left in the deck)` : `Deck: ${count} cards left`"
      @click="$emit('draw')"
    >
      <span v-for="i in layers" :key="i" class="layer" :style="{ '--depth': layers - i + 1 }" aria-hidden="true">
        <CardBack />
      </span>
      <span v-if="count > 0" class="top" data-anchor="deck"><CardBack /></span>
      <span v-else class="top outline" data-anchor="deck" aria-hidden="true"></span>
      <span class="count" aria-hidden="true">{{ count }}</span>
    </button>
    <span class="caption">{{ active ? 'Tap to flip' : 'Deck' }}</span>
  </div>
</template>

<style scoped>
.deck-wrap {
  display: grid;
  justify-items: center;
  gap: 0.35rem;
}

.deck {
  position: relative;
  width: var(--big-card-w, 4.4rem);
  height: var(--big-card-h, 6.16rem);
  padding: 0;
  border: 0;
  background: none;
  cursor: default;
}

.deck:disabled {
  opacity: 1;
}

.layer,
.top {
  position: absolute;
  inset: 0;
  border-radius: 0.55rem;
  transition: transform 0.2s ease;
}

.layer {
  transform: translate(calc(var(--depth) * 3px), calc(var(--depth) * 3px));
  filter: brightness(0.82);
}

.top {
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
}

.outline {
  border: 2px dashed var(--line);
  box-shadow: none;
}

.count {
  position: absolute;
  right: -0.55rem;
  bottom: -0.55rem;
  min-width: 1.7rem;
  padding: 0.1rem 0.35rem;
  border: 2px solid var(--accent);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.8rem;
  font-weight: 800;
  line-height: 1.2;
}

.active {
  cursor: pointer;
}

.active .top {
  animation: beckon 1.8s ease-in-out infinite;
}

.active:hover .top,
.active:focus-visible .top {
  animation: none;
  transform: translateY(-6px) rotate(-2deg);
  box-shadow:
    0 0 0 3px var(--surface),
    0 0 0 6px var(--accent),
    0 10px 18px rgb(0 0 0 / 0.25);
}

.active:active .top {
  transform: translateY(-2px) scale(0.97);
}

.deck:focus-visible {
  outline: none;
}

.shuffling .top,
.shuffling .layer {
  animation: riffle 0.55s ease-in-out 2;
}

.shuffling .layer:nth-child(2) {
  animation-direction: reverse;
}

.caption {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.active + .caption {
  color: var(--accent);
}

@keyframes beckon {
  0%,
  100% {
    transform: translateY(0);
    box-shadow:
      0 0 0 0 color-mix(in srgb, var(--accent) 50%, transparent),
      0 2px 6px rgb(0 0 0 / 0.2);
  }
  50% {
    transform: translateY(-3px);
    box-shadow:
      0 0 0 6px color-mix(in srgb, var(--accent) 0%, transparent),
      0 6px 12px rgb(0 0 0 / 0.22);
  }
}

@keyframes riffle {
  0%,
  100% {
    transform: none;
  }
  30% {
    transform: translateX(-10px) rotate(-6deg);
  }
  65% {
    transform: translateX(10px) rotate(6deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .active .top,
  .shuffling .top,
  .shuffling .layer {
    animation: none;
  }
}
</style>
