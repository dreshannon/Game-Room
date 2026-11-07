<script setup lang="ts">
// The art deco back of a Lucky Streak card: a stepped border, overlapping trapezoids
// hanging from the top and rising from the bottom, and a diamond in the middle.
const TOP = [
  { points: '20,10 80,10 69,33 31,33', fill: 'line' },
  { points: '30,10 70,10 61,43 39,43', fill: 'bg' },
  { points: '39,10 61,10 55,52 45,52', fill: 'line' },
]
const BOTTOM = TOP.map((shape) => ({
  ...shape,
  points: shape.points
    .split(' ')
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return `${x},${140 - y!}`
    })
    .join(' '),
}))
</script>

<template>
  <svg class="card-back" viewBox="0 0 100 140" aria-hidden="true">
    <rect x="1.5" y="1.5" width="97" height="137" rx="9" class="bg outer" />
    <rect x="6" y="6" width="88" height="128" rx="5" class="frame" />
    <rect x="9.5" y="9.5" width="81" height="121" rx="2.5" class="frame thin" />
    <g class="fan">
      <polygon v-for="(shape, i) in [...TOP, ...BOTTOM]" :key="i" :points="shape.points" :class="shape.fill" />
    </g>
    <line x1="50" y1="52" x2="50" y2="58" class="frame" />
    <line x1="50" y1="82" x2="50" y2="88" class="frame" />
    <polygon points="50,58 62,70 50,82 38,70" class="bg frame" />
    <polygon points="50,63 57,70 50,77 43,70" class="line" />
    <line x1="14" y1="70" x2="34" y2="70" class="frame thin" />
    <line x1="66" y1="70" x2="86" y2="70" class="frame thin" />
  </svg>
</template>

<style scoped>
.card-back {
  --deco-bg: var(--accent);
  --deco-line: var(--accent-ink);
  display: block;
  width: 100%;
  height: 100%;
}

.bg {
  fill: var(--deco-bg);
}

.outer {
  stroke: color-mix(in srgb, var(--deco-bg) 70%, #000000);
  stroke-width: 3;
}

.line {
  fill: var(--deco-line);
}

.fan .bg {
  stroke: var(--deco-line);
  stroke-width: 1.5;
  stroke-linejoin: round;
}

.frame {
  fill: none;
  stroke: var(--deco-line);
  stroke-width: 2;
}

.bg.frame {
  fill: var(--deco-bg);
}

.thin {
  stroke-width: 0.9;
}
</style>
