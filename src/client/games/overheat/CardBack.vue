<script setup lang="ts">
defineProps<{
  /** The discard pile is drawn in quieter colors than the deck. */
  muted?: boolean
}>()
</script>

<template>
  <span class="card-back" :class="{ muted }" aria-hidden="true">
    <span class="panel">
      <span class="finish"></span>
      <span class="emblem">
        <!-- A speedometer, our own mark for the back of every card. -->
        <svg viewBox="0 0 24 24">
          <path d="M4.5 16a8 8 0 1 1 15 0" />
          <path d="M7 9.5l1 1M12 6.5v1.5M17 9.5l-1 1" />
          <path d="M12 15l3.5-4.5" stroke-width="2.4" />
          <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </span>
    </span>
  </span>
</template>

<style scoped>
.card-back {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0.18rem;
  border: 1px solid rgba(0, 0, 0, 0.35);
  border-radius: 0.5rem;
  background: #f6f0e1;
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.25);
}

.panel {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 0.32rem;
  /* A small checkered-flag weave over deep racing red. */
  background:
    repeating-conic-gradient(rgba(255, 255, 255, 0.09) 0 25%, transparent 0 50%) 0 0 / 0.5rem 0.5rem,
    radial-gradient(circle at 50% 40%, #c1121f, #6a040f);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.3),
    inset 0 0 0 0.2rem rgba(246, 240, 225, 0.18);
}

.finish {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--card-gloss);
  opacity: 0.55;
  mix-blend-mode: overlay;
  pointer-events: none;
}

.muted .panel {
  background:
    repeating-conic-gradient(rgba(255, 255, 255, 0.08) 0 25%, transparent 0 50%) 0 0 / 0.5rem 0.5rem,
    radial-gradient(circle at 50% 40%, #6c757d, #343a40);
}

.emblem {
  display: grid;
  place-items: center;
  width: 58%;
  aspect-ratio: 1;
  border: 2px solid #f6f0e1;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.25);
  color: #f6f0e1;
}

svg {
  width: 72%;
  height: 72%;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
