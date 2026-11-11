<script setup lang="ts">
import { computed, ref } from 'vue'
import { FLICKER_TEXT, describeNeed, type Flicker } from '../../../games/glowcatch/fireflies'
import type { Firefly } from '../../../games/glowcatch/logic'
import { chanceLabel } from './odds'

const props = defineProps<{
  firefly: Firefly
  small?: boolean
  /** Chance your current pick meets it, while you're casting. */
  chance?: number | null
  /** It flickered as it arrived this round. */
  fresh?: boolean
}>()

const FLICKER_TAG: Record<Flicker, string> = {
  swarm: 'Brought a friend',
  gift: 'Charm for all',
  breeze: 'Woke lanterns',
}

const open = ref(false)
const need = computed(() => describeNeed(props.firefly.need, props.firefly.minTotal))
/** Bigger fireflies glow brighter. */
const glow = computed(() => 5 + Math.min(7, props.firefly.points) * 1.2)
const chanceText = computed(() => (props.chance == null ? null : chanceLabel(props.chance)))
const chanceLevel = computed(() => {
  const c = props.chance ?? 0
  return c >= 0.6 ? 'high' : c >= 0.25 ? 'mid' : 'low'
})
</script>

<template>
  <component
    :is="small ? 'div' : 'button'"
    class="firefly"
    :class="{ small, fresh, open }"
    :type="small ? undefined : 'button'"
    :aria-expanded="small ? undefined : open"
    @click="small || (open = !open)"
  >
    <svg viewBox="0 0 40 40" class="bug" aria-hidden="true">
      <circle cx="20" cy="25" :r="glow + 6" class="halo" />
      <ellipse cx="13" cy="15" rx="7" ry="4" class="wing" transform="rotate(-30 13 15)" />
      <ellipse cx="27" cy="15" rx="7" ry="4" class="wing" transform="rotate(30 27 15)" />
      <ellipse cx="20" cy="15" rx="4" ry="5" class="body" />
      <ellipse cx="20" cy="25" rx="5" :ry="glow * 0.8" class="tail" />
    </svg>
    <span class="text">
      <span class="name">
        {{ firefly.name }}
        <span v-if="firefly.flicker && !fresh" class="flicker" title="Flickers when it arrives">✦</span>
      </span>
      <span class="need">{{ need }}</span>
      <span v-if="fresh && firefly.flicker" class="tag">✦ {{ FLICKER_TAG[firefly.flicker] }}</span>
    </span>
    <span class="side">
      <span class="points" :aria-label="`${firefly.points} points`">{{ firefly.points }}</span>
      <span v-if="chanceText" class="chance" :class="chanceLevel" :title="'Chance your pick rolls this'">
        {{ chanceText }}
      </span>
    </span>
    <span v-if="open" class="details">
      Your roll needs: {{ need.charAt(0).toLowerCase() + need.slice(1) }}. Worth {{ firefly.points }}
      point{{ firefly.points === 1 ? '' : 's' }}.
      <template v-if="firefly.flicker"> When it arrived: {{ FLICKER_TEXT[firefly.flicker] }}</template>
      <template v-if="chanceText">
        Your pick rolls it about {{ chanceText }} of the time, if nobody beats you to it.</template
      >
    </span>
  </component>
</template>

<style scoped>
.firefly {
  display: grid;
  grid-template-columns: 2.4rem 1fr auto;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-width: 0;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--gc-card-line);
  border-radius: var(--radius);
  background: var(--gc-card);
  color: var(--gc-card-ink);
  font: inherit;
  font-weight: 400;
  text-align: left;
}

button.firefly {
  cursor: pointer;
}

button.firefly:hover {
  border-color: var(--gc-glow-strong);
}

.fresh {
  box-shadow: 0 0 0 2px var(--gc-glow);
}

.small {
  grid-template-columns: 1.6rem 1fr auto;
  padding: 0.25rem 0.45rem;
  font-size: 0.85rem;
}

.bug {
  width: 100%;
  height: auto;
}

.halo {
  fill: var(--gc-glow);
  opacity: 0.25;
}

.wing {
  fill: var(--gc-wing);
}

.body {
  fill: var(--gc-body);
}

.tail {
  fill: var(--gc-glow);
}

.text {
  display: grid;
  min-width: 0;
}

.name {
  font-weight: 700;
  line-height: 1.2;
}

.need {
  color: var(--gc-card-muted);
  font-size: 0.85em;
  line-height: 1.25;
}

.tag {
  justify-self: start;
  margin-top: 0.2rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--gc-glow);
  color: #1d1b10;
  font-size: 0.75em;
  font-weight: 700;
  white-space: nowrap;
}

.flicker {
  color: var(--gc-glow-strong);
}

.side {
  display: grid;
  justify-items: center;
  gap: 0.2rem;
}

.points {
  display: grid;
  place-items: center;
  min-width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  background: var(--gc-glow);
  color: #1d1b10;
  font-weight: 800;
}

.small .points {
  min-width: 1.4rem;
  height: 1.4rem;
}

.chance {
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.chance.high {
  color: var(--gc-good);
}

.chance.mid {
  color: var(--gc-card-ink);
}

.chance.low {
  color: var(--gc-card-muted);
}

.details {
  grid-column: 1 / -1;
  padding-top: 0.35rem;
  border-top: 1px solid var(--line);
  color: var(--gc-card-ink);
  font-size: 0.85rem;
  line-height: 1.35;
}
</style>
