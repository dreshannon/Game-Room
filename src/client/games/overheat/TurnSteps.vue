<script setup lang="ts">
import { computed } from 'vue'
import type { OverheatView, TurnStep } from '../../../games/overheat/logic'

const props = defineProps<{
  phase: OverheatView['phase']
  /** The step the driving car is on, while cars move. */
  step: TurnStep | null
  /** Who is driving right now. */
  driver: { name: string; color: string } | null
  /** You still have to discard while someone else drives. */
  youDiscarding: boolean
}>()

interface Step {
  key: string
  label: string
  /** For phones, where the full label won't fit. */
  short: string
  detail: string
  /** Inline SVG drawn on a 24×24 grid with the current color. */
  icon: string
}

// Our own simple line icons, so they read at a glance in both themes.
const STEPS: Step[] = [
  {
    key: 'shift',
    label: 'Shift gear',
    short: 'Gear',
    detail: 'Pick a gear from 1 to 4. Shifting two gears at once costs 1 Heat.',
    icon: '<path d="M6 5v14M12 5v14M18 12v7M6 12h12"/><circle cx="18" cy="6" r="2.6" fill="currentColor" stroke="none"/>',
  },
  {
    key: 'cards',
    label: 'Play cards',
    short: 'Cards',
    detail: 'Play as many cards as your gear. Gear 3 means 3 cards.',
    icon: '<rect x="3.5" y="5" width="10" height="14" rx="2" transform="rotate(-10 8.5 12)"/><rect x="10.5" y="5" width="10" height="14" rx="2" transform="rotate(8 15.5 12)"/>',
  },
  {
    key: 'move',
    label: 'Move',
    short: 'Move',
    detail: 'Each car moves the total of its cards, leader first.',
    icon: '<path d="M8 12h12M15 7l5 5-5 5M3 9h3M3 15h3"/>',
  },
  {
    key: 'react',
    label: 'Boost',
    short: 'Boost',
    detail: 'Pay 1 Heat to move the next speed card’s worth. The last car can add 1 with Adrenaline. Low gears cool down by themselves.',
    icon: '<path d="M12 3c1.5 3.5 6 5.5 6 10.5a6 6 0 0 1-12 0c0-2.6 1.4-4.2 2.6-5.5.4 1.6 1.3 2.6 2.4 3 0-3 .2-5.4 1-8z"/>',
  },
  {
    key: 'slipstream',
    label: 'Slipstream',
    short: 'Slip',
    detail: 'Beside or right behind a car? You may move 2 more spaces.',
    icon: '<path d="M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5M3 16h8"/>',
  },
  {
    key: 'corners',
    label: 'Corners',
    short: 'Corner',
    detail: 'Pay 1 Heat for each point over a corner’s limit, or spin out.',
    icon: '<path d="M4 21v-7a9 9 0 0 1 9-9h7"/><circle cx="16.5" cy="15.5" r="4"/><path d="M16.5 14v3"/>',
  },
  {
    key: 'discard',
    label: 'Discard & draw',
    short: 'Draw',
    detail: 'Throw away cards you don’t want, then draw back up to 7.',
    icon: '<rect x="8" y="6" width="9" height="12" rx="1.8"/><path d="M4.5 9.5A8 8 0 0 1 9 4M3 6.5l1.5 3 3-1.5M19.5 14.5A8 8 0 0 1 15 20M21 17.5l-1.5-3-3 1.5"/>',
  },
]

/** Which steps are happening now. */
const active = computed(() => {
  if (props.phase === 'plan') return new Set(['shift', 'cards'])
  if (props.phase !== 'resolve') return new Set<string>()
  if (props.step) return new Set([props.step])
  return new Set(['discard'])
})

const activeIndex = computed(() => STEPS.findIndex((step) => active.value.has(step.key)))

function stateOf(index: number) {
  const key = STEPS[index]!.key
  if (active.value.has(key)) return 'now'
  if (key === 'discard' && props.youDiscarding) return 'yours'
  // While a car drives, the steps before its current one are done for that car.
  if (props.phase === 'resolve' && index < activeIndex.value) return 'done'
  return 'later'
}
</script>

<template>
  <section class="turn-steps" aria-label="Order of play">
    <div class="groups" aria-hidden="true">
      <span class="group together">All cars at once</span>
      <span class="group each">One car at a time, leader first</span>
    </div>
    <ol class="steps">
      <li
        v-for="(step, index) in STEPS"
        :key="step.key"
        class="step"
        :class="[stateOf(index), { 'group-start': index === 2 }]"
        :title="step.detail"
        :aria-current="stateOf(index) === 'now' ? 'step' : undefined"
      >
        <span class="badge">
          <svg viewBox="0 0 24 24" aria-hidden="true" v-html="step.icon"></svg>
          <span class="num">{{ index + 1 }}</span>
        </span>
        <span class="label">
          <span class="long">{{ step.label }}</span>
          <span class="short" aria-hidden="true">{{ step.short }}</span>
        </span>
        <span class="visually-hidden">: {{ step.detail }}</span>
        <span v-if="stateOf(index) === 'now' && phase === 'resolve' && driver" class="who">
          <span class="dot" :style="{ background: driver.color }"></span>{{ driver.name }}
        </span>
        <span v-else-if="stateOf(index) === 'yours'" class="who">You too</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.turn-steps {
  display: grid;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem 0.4rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.groups,
.steps {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  column-gap: 0.35rem;
}

.group {
  padding-bottom: 0.2rem;
  border-bottom: 2px solid var(--line);
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: center;
  text-transform: uppercase;
}

.group.together {
  grid-column: 1 / 3;
}

.group.each {
  grid-column: 3 / 8;
}

.steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  position: relative;
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 0.2rem;
  padding: 0.35rem 0.1rem;
  border-radius: 0.6rem;
  color: var(--muted);
  text-align: center;
  cursor: help;
  transition:
    background 0.2s,
    color 0.2s;
}

/* A chevron between steps shows the direction of play. */
.step:not(:first-child)::before {
  content: '';
  position: absolute;
  top: 1.45rem;
  left: -0.3rem;
  width: 0.4rem;
  height: 0.4rem;
  border-top: 2px solid var(--line);
  border-right: 2px solid var(--line);
  transform: rotate(45deg);
}

.badge {
  position: relative;
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border: 2px solid var(--line);
  border-radius: 50%;
  background: var(--paper);
}

.badge svg {
  width: 1.4rem;
  height: 1.4rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.num {
  position: absolute;
  right: -0.35rem;
  bottom: -0.25rem;
  display: grid;
  place-items: center;
  min-width: 1.05rem;
  height: 1.05rem;
  padding: 0 0.15rem;
  border-radius: 999px;
  background: var(--line);
  color: var(--ink);
  font-size: 0.65rem;
  font-weight: 800;
}

.label {
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.15;
}

.short {
  display: none;
}

.who {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 100%;
  overflow: hidden;
  color: var(--ink);
  font-size: 0.68rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  flex: none;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4);
}

.step.done {
  opacity: 0.55;
}

.step.done .badge {
  border-style: dashed;
}

.step.now {
  background: var(--accent-soft);
  color: var(--ink);
}

.step.now .badge {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: 0 0 0 4px var(--accent-soft);
  animation: nudge 1.6s ease-in-out infinite;
}

.step.now .num {
  background: var(--ink);
  color: var(--surface);
}

.step.yours .badge {
  border-color: var(--accent);
  color: var(--accent);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes nudge {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.07);
  }
}

@media (max-width: 560px) {
  .turn-steps {
    padding: 0.5rem 0.4rem 0.4rem;
  }

  .groups,
  .steps {
    column-gap: 0.15rem;
  }

  .badge {
    width: 2rem;
    height: 2rem;
  }

  .badge svg {
    width: 1.15rem;
    height: 1.15rem;
  }

  .step:not(:first-child)::before {
    display: none;
  }

  .label {
    font-size: 0.62rem;
  }

  .long {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .short {
    display: inline;
  }

  .group {
    font-size: 0.58rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .step.now .badge {
    animation: none;
  }
}
</style>
