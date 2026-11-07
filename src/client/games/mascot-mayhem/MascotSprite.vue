<script setup lang="ts">
/**
 * One cartoon mascot, drawn facing right around (0, 0) in about a 46-unit box.
 * Used inside an <svg>, on the track and in tickets and cards.
 */
defineProps<{
  animal: 'dog' | 'duck' | 'frog' | 'raccoon'
  color: string
  running?: boolean
  fallen?: boolean
  backwards?: boolean
  out?: boolean
}>()

const OUTLINE = '#1d1b19'
</script>

<template>
  <g class="sprite" :class="{ running, fallen, backwards, out }">
    <g class="pose">
      <ellipse class="shadow" cx="0" cy="19" rx="16" ry="4" fill="#000" opacity="0.22" />
      <g class="bob">
        <!-- Back legs, then front legs, so they swing out of step. -->
        <g class="legs back">
          <rect x="-11" y="8" width="6" height="11" rx="3" :fill="color" :stroke="OUTLINE" stroke-width="1.6" />
          <rect x="3" y="8" width="6" height="11" rx="3" :fill="color" :stroke="OUTLINE" stroke-width="1.6" />
        </g>

        <template v-if="animal === 'dog'">
          <path d="M -14 -2 q -10 -6 -9 -14" fill="none" :stroke="OUTLINE" stroke-width="5" stroke-linecap="round" />
          <path d="M -14 -2 q -10 -6 -9 -14" fill="none" :stroke="color" stroke-width="2.6" stroke-linecap="round" />
          <ellipse cx="-2" cy="2" rx="15" ry="10" :fill="color" :stroke="OUTLINE" stroke-width="1.8" />
          <ellipse cx="-3" cy="5" rx="8" ry="4.5" fill="#fff" opacity="0.35" />
          <circle cx="12" cy="-8" r="10" :fill="color" :stroke="OUTLINE" stroke-width="1.8" />
          <ellipse cx="20" cy="-5" rx="6" ry="4.5" fill="#f6e3cc" :stroke="OUTLINE" stroke-width="1.5" />
          <circle cx="24.5" cy="-6.5" r="2.4" :fill="OUTLINE" />
          <path d="M 7 -16 q -7 2 -6 13 q 5 -2 7 -9 z" fill="#7a3b1d" :stroke="OUTLINE" stroke-width="1.5" />
          <circle cx="15" cy="-11" r="2.2" :fill="OUTLINE" />
          <circle cx="15.7" cy="-11.7" r="0.8" fill="#fff" />
          <path d="M 18 -1.5 q 3 3 6 0" fill="none" :stroke="OUTLINE" stroke-width="1.3" stroke-linecap="round" />
          <path d="M 21 0 q 1 4 3 1" fill="#ff6b81" :stroke="OUTLINE" stroke-width="1" />
        </template>

        <template v-else-if="animal === 'duck'">
          <path d="M -15 -1 l -7 -6 l 2 9 z" :fill="color" :stroke="OUTLINE" stroke-width="1.6" stroke-linejoin="round" />
          <ellipse cx="-2" cy="2" rx="15" ry="11" :fill="color" :stroke="OUTLINE" stroke-width="1.8" />
          <path d="M -9 -1 q 8 -5 13 3 q -6 6 -13 -3 z" fill="#d99a00" :stroke="OUTLINE" stroke-width="1.4" />
          <circle cx="11" cy="-10" r="9.5" :fill="color" :stroke="OUTLINE" stroke-width="1.8" />
          <path d="M 18 -10 q 9 -1 10 3 q -4 4 -11 2 z" fill="#ff8c1a" :stroke="OUTLINE" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M 18.5 -7 l 9 0" :stroke="OUTLINE" stroke-width="1" />
          <circle cx="13.5" cy="-13" r="2.2" :fill="OUTLINE" />
          <circle cx="14.2" cy="-13.7" r="0.8" fill="#fff" />
          <path d="M 9 -19 q 1 -5 4 -4" fill="none" :stroke="OUTLINE" stroke-width="1.6" stroke-linecap="round" />
        </template>

        <template v-else-if="animal === 'frog'">
          <ellipse cx="0" cy="3" rx="17" ry="10" :fill="color" :stroke="OUTLINE" stroke-width="1.8" />
          <ellipse cx="0" cy="7" rx="11" ry="4.5" fill="#d8f5c4" opacity="0.8" />
          <circle cx="5" cy="-9" r="6.5" :fill="color" :stroke="OUTLINE" stroke-width="1.8" />
          <circle cx="15" cy="-8" r="6.5" :fill="color" :stroke="OUTLINE" stroke-width="1.8" />
          <circle cx="5.5" cy="-9.5" r="3.8" fill="#fff" :stroke="OUTLINE" stroke-width="1.2" />
          <circle cx="15.5" cy="-8.5" r="3.8" fill="#fff" :stroke="OUTLINE" stroke-width="1.2" />
          <circle cx="7" cy="-9.5" r="1.8" :fill="OUTLINE" />
          <circle cx="17" cy="-8.5" r="1.8" :fill="OUTLINE" />
          <path d="M 6 1 q 9 7 17 -1" fill="none" :stroke="OUTLINE" stroke-width="1.6" stroke-linecap="round" />
          <circle cx="-6" cy="-1" r="1.6" fill="#1e7a46" />
          <circle cx="-10" cy="3" r="1.2" fill="#1e7a46" />
        </template>

        <template v-else>
          <!-- A ringed raccoon tail. -->
          <g transform="rotate(-25 -16 -2)">
            <ellipse cx="-24" cy="-2" rx="11" ry="5" :fill="color" :stroke="OUTLINE" stroke-width="1.6" />
            <rect x="-27" y="-7" width="3.5" height="10" fill="#26264a" />
            <rect x="-19" y="-7" width="3.5" height="10" fill="#26264a" />
            <ellipse cx="-24" cy="-2" rx="11" ry="5" fill="none" :stroke="OUTLINE" stroke-width="1.6" />
          </g>
          <ellipse cx="-2" cy="2" rx="15" ry="10" :fill="color" :stroke="OUTLINE" stroke-width="1.8" />
          <ellipse cx="-2" cy="5" rx="8" ry="4" fill="#fff" opacity="0.3" />
          <path d="M 4 -14 l 2 -7 l 5 5 z" :fill="color" :stroke="OUTLINE" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M 13 -16 l 4 -6 l 3 7 z" :fill="color" :stroke="OUTLINE" stroke-width="1.5" stroke-linejoin="round" />
          <circle cx="12" cy="-8" r="10" :fill="color" :stroke="OUTLINE" stroke-width="1.8" />
          <path d="M 4 -10 q 9 -6 19 0 q -2 5 -9 3 q -7 2 -10 -3 z" fill="#26264a" />
          <circle cx="10" cy="-9.5" r="2.4" fill="#fff" />
          <circle cx="18" cy="-9.5" r="2.4" fill="#fff" />
          <circle cx="10.8" cy="-9.5" r="1.3" :fill="OUTLINE" />
          <circle cx="18.8" cy="-9.5" r="1.3" :fill="OUTLINE" />
          <path d="M 17 -3 q 4 0 6 -2" fill="none" :stroke="OUTLINE" stroke-width="1.2" />
          <circle cx="22.5" cy="-4.5" r="1.8" :fill="OUTLINE" />
        </template>

        <g class="legs front">
          <rect x="-6" y="9" width="6" height="10" rx="3" :fill="color" :stroke="OUTLINE" stroke-width="1.6" />
          <rect x="8" y="9" width="6" height="10" rx="3" :fill="color" :stroke="OUTLINE" stroke-width="1.6" />
        </g>
      </g>

      <!-- Seeing stars after a fall. -->
      <g v-if="fallen && !out" class="dizzy">
        <text x="-6" y="-22">★</text>
        <text x="8" y="-26">★</text>
      </g>
    </g>
    <g v-if="out" class="knocked">
      <path d="M -9 -9 L 9 9 M 9 -9 L -9 9" stroke="#e5383b" stroke-width="4" stroke-linecap="round" />
    </g>
  </g>
</template>

<style scoped>
.pose {
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-box: fill-box;
  transform-origin: center;
}

.backwards .pose {
  transform: scaleX(-1);
}

.fallen .pose {
  transform: rotate(80deg) translateX(4px);
}

.backwards.fallen .pose {
  transform: scaleX(-1) rotate(80deg) translateX(4px);
}

.out {
  opacity: 0.45;
  filter: grayscale(0.85);
}

.running .bob {
  animation: bob 0.24s ease-in-out infinite alternate;
}

.running .legs.back {
  animation: swing 0.24s ease-in-out infinite alternate;
}

.running .legs.front {
  animation: swing 0.24s ease-in-out infinite alternate-reverse;
}

.legs {
  transform-box: fill-box;
  transform-origin: top center;
}

@keyframes bob {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-4px);
  }
}

@keyframes swing {
  from {
    transform: rotate(-28deg);
  }
  to {
    transform: rotate(28deg);
  }
}

.dizzy text {
  fill: #ffd60a;
  font-size: 11px;
  stroke: #1d1b19;
  stroke-width: 0.6px;
  animation: twinkle 0.9s ease-in-out infinite alternate;
}

@keyframes twinkle {
  from {
    opacity: 0.4;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .running .bob,
  .running .legs {
    animation: none;
  }
}
</style>
