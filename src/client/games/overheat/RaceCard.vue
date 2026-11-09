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

/** What sits in the corners, like the index on a playing card. */
const corner = computed(() => {
  const card = props.card
  if (!card) return '0'
  if (card.kind === 'stress') return '?'
  if (card.kind === 'heat') return null
  return String(card.value)
})

/** A small word under the art, for cards that need one. Plain speed cards speak for themselves. */
const tag = computed(() => {
  const card = props.card
  if (props.boost) return 'Boost'
  if (props.fromStress) return 'Stress'
  if (!card) return null
  if (card.kind === 'heat') return 'Heat'
  if (card.kind === 'stress') return 'Stress'
  if (card.kind === 'upgrade') return 'Special'
  return null
})

// Simple line drawings of our own, sized to a 24×24 grid.
const THERMOMETER =
  '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7" stroke-width="3"/><circle cx="12" cy="17.5" r="2" fill="currentColor" stroke="none"/>'
const COG =
  '<circle cx="12" cy="12" r="7.5" stroke-width="3.6" stroke-dasharray="3.1 2.8"/><circle cx="12" cy="12" r="5"/>'
const STAR = '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor"/>'
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
    <span class="face" aria-hidden="true">
      <template v-if="corner !== null">
        <span class="corner tl">{{ corner }}</span>
        <!-- A labelled card keeps just the top corner, so the label has room. -->
        <span v-if="!tag" class="corner br">{{ corner }}</span>
      </template>
      <template v-else>
        <svg class="corner tl corner-icon" viewBox="0 0 24 24" v-html="THERMOMETER"></svg>
        <svg v-if="!tag" class="corner br corner-icon" viewBox="0 0 24 24" v-html="THERMOMETER"></svg>
      </template>

      <span class="art">
        <svg v-if="card?.kind === 'heat'" class="emblem" viewBox="0 0 24 24" v-html="THERMOMETER"></svg>
        <template v-else-if="card?.kind === 'stress'">
          <span class="big">?</span>
        </template>
        <template v-else>
          <span class="big">{{ card?.value ?? 0 }}</span>
          <svg v-if="card?.kind === 'upgrade'" class="mark" viewBox="0 0 24 24" v-html="card.value === 0 ? COG : STAR"></svg>
          <span v-else-if="card && card.value > 0" class="pips">
            <span v-for="i in card.value" :key="i" class="pip"></span>
          </span>
        </template>
        <span v-if="tag" class="tag">{{ tag }}</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
/* The card: a printed border around an inset art panel. */
.race-card {
  --card-border: #f6f0e1;
  --edge: rgba(0, 0, 0, 0.35);
  --panel: #555;
  --card-ink: #fff;
  --w: 3.6rem;
  --h: 5rem;

  position: relative;
  display: block;
  flex: none;
  width: var(--w);
  height: var(--h);
  padding: 0.18rem;
  border: 1px solid var(--edge);
  border-radius: 0.5rem;
  background: var(--card-border);
  color: var(--card-ink);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.5) inset,
    0 2px 3px rgba(0, 0, 0, 0.25);
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}

@media (max-width: 560px) {
  .race-card {
    --w: 3rem;
    --h: 4.3rem;
  }
}

.race-card.small {
  --w: 2.6rem;
  --h: 3.6rem;
  padding: 0.13rem;
}

.race-card:disabled {
  opacity: 1;
  cursor: default;
}

.face {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 0.32rem;
  background: var(--panel);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
}

/* ---- Corner indices ---- */

.corner {
  position: absolute;
  z-index: 1;
  font-size: 0.68rem;
  font-weight: 900;
  line-height: 1;
}

.tl {
  top: 0.18rem;
  left: 0.22rem;
}

.br {
  right: 0.22rem;
  bottom: 0.18rem;
  transform: rotate(180deg);
}

.corner-icon {
  width: 0.7rem;
  height: 0.7rem;
}

.small .corner {
  font-size: 0.52rem;
}

.small .corner-icon {
  width: 0.55rem;
  height: 0.55rem;
}

svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---- Centre art ---- */

.art {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 0.15rem;
}

.big {
  font-size: 1.9rem;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.2);
}

@media (max-width: 560px) {
  .big {
    font-size: 1.6rem;
  }
}

.small .big {
  font-size: 1.3rem;
}

.pips {
  display: flex;
  gap: 1px;
}

/* Chevrons, one per point of speed. */
.pip {
  width: 0.38rem;
  height: 0.5rem;
  background: currentColor;
  clip-path: polygon(0 0, 45% 0, 100% 50%, 45% 100%, 0 100%, 55% 50%);
}

.small .pips {
  display: none;
}

.emblem {
  width: 2rem;
  height: 2rem;
}

.small .emblem {
  width: 1.4rem;
  height: 1.4rem;
}

.mark {
  width: 0.95rem;
  height: 0.95rem;
}

.small .mark {
  display: none;
}

/* Special cards carry a mark and a label too, so the number is a little smaller to fit. */
.upgrade .big {
  font-size: 1.6rem;
}

.upgrade .mark {
  width: 0.8rem;
  height: 0.8rem;
}

.small.upgrade .big {
  font-size: 1.2rem;
}

.tag {
  font-size: 0.5rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.small .tag {
  font-size: 0.42rem;
}

/* ---- Speed: colour by value, with speed lines streaking behind ---- */

.speed .face::before {
  content: '';
  position: absolute;
  inset: -20%;
  background: repeating-linear-gradient(
    -65deg,
    transparent 0 7px,
    rgba(255, 255, 255, 0.16) 7px 9px,
    transparent 9px 16px,
    rgba(255, 255, 255, 0.08) 16px 17px
  );
}

.speed.v1 {
  --panel: linear-gradient(160deg, #4cc9f0, #3a86ff);
}

.speed.v2 {
  --panel: linear-gradient(160deg, #52b788, #2d6a4f);
}

.speed.v3 {
  --panel: linear-gradient(160deg, #f9c74f, #f3722c);
  --card-ink: #1b1b1b;
}

.speed.v4 {
  --panel: linear-gradient(160deg, #f94144, #9d0208);
}

/* ---- Special 0 and 5: gold foil border ---- */

.upgrade {
  --card-border: linear-gradient(135deg, #f7e19b, #c9962b 35%, #fff1c1 55%, #b07d1c 80%, #e9c46a);
  --panel: radial-gradient(circle at 50% 35%, #4a4e75, #23253a);
  --card-ink: #f7e19b;
}

/* ---- Heat: a thermometer over heat haze ---- */

.heat {
  --panel: linear-gradient(160deg, #ff9e00, #d00000);
}

.heat .face::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 18% at 50% 0%, rgba(255, 255, 255, 0.25), transparent),
    repeating-radial-gradient(circle at 50% 120%, transparent 0 6px, rgba(255, 255, 255, 0.12) 6px 8px);
}

/* ---- Stress: hazard stripes around a warning panel ---- */

.stress {
  --panel: repeating-linear-gradient(45deg, #111 0 5px, #ffd60a 5px 10px);
  --card-ink: #1b1b1b;
}

.stress .face::before {
  content: '';
  position: absolute;
  inset: 0.35rem;
  border-radius: 0.25rem;
  background: linear-gradient(160deg, #ffe066, #fab005);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
}

.small.stress .face::before {
  inset: 0.25rem;
}

.stress .corner {
  padding: 0 0.12rem;
  border-radius: 0.2rem;
  background: #ffe066;
}

/* ---- No card, from a Boost that found nothing ---- */

.empty {
  --panel: #6c757d;
}

/* ---- States ---- */

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
