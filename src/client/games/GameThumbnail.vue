<script setup lang="ts">
// A small picture of each game for its tile in the lobby, built from the games' own art where we can.
import LuckyCardBack from './lucky-streak/CardBack.vue'
import MascotSprite from './mascot-mayhem/MascotSprite.vue'
import PlayingCard from './PlayingCard.vue'
import { MASCOTS } from '../../games/mascot-mayhem/data'
import { PATTERNS, turn } from '../../games/drift-lines/paths'
import { channel, channels } from './drift-lines/art'

defineProps<{ gameId: string }>()

// Shade Hunt: a slice of the board, hue across and lightness down.
const SHADES = Array.from({ length: 4 }, (_, row) =>
  Array.from({ length: 10 }, (_, col) => `hsl(${col * 36} 75% ${68 - row * 12}%)`),
)

// Overheat: cars spread around an oval track.
const TRACK = 'M50 20 H150 A40 40 0 0 1 150 100 H50 A40 40 0 0 1 50 20 Z'
const CARS = [
  { x: 120, y: 20, fill: '#e63946' },
  { x: 92, y: 20, fill: '#3a86ff' },
  { x: 186, y: 52, fill: '#ffbe0b' },
  { x: 70, y: 100, fill: '#06d6a0' },
]

// Tier Talk: rows of contenders, emptier further down.
const TIERS = [
  { label: 'S', fill: '#e4572e', count: 2 },
  { label: 'A', fill: '#f2b705', count: 3 },
  { label: 'B', fill: '#2fbf71', count: 2 },
  { label: 'C', fill: '#4d7cfe', count: 1 },
]

// Midnight Lift: a few blocks at night, a thief's trail and two wardens.
const LIFT_BLOCKS = [
  [10, 4, 50],
  [80, 4, 70],
  [170, 4, 24],
  [10, 60, 80],
  [110, 60, 40],
  [170, 60, 24],
]

// Drift Lines: a strip of channel pieces with two lanterns' trails. Squares are 100 units, drawn at a third.
const DRIFT_PIECES = [3, 11, 20, 7, 28, 15].map((pattern, i) => ({
  x: (i % 3) * 100,
  y: Math.floor(i / 3) * 100,
  paths: channels(turn(PATTERNS[pattern]!, i % 4)),
}))
const DRIFT_TRAILS = [
  { d: channel(0, 5, 0, 0), fill: '#e63946' },
  { d: channel(7, 2, 100, 100), fill: '#3a86ff' },
]

// Tic-Tac-Toe: a game partway through.
const MARKS = ['X', 'O', '', '', 'X', '', 'O', '', 'X']
</script>

<template>
  <div class="thumb" aria-hidden="true">
    <svg v-if="gameId === 'color-clues'" viewBox="0 0 200 110">
      <g v-for="(row, r) in SHADES" :key="r">
        <rect
          v-for="(fill, c) in row"
          :key="c"
          :x="10 + c * 18"
          :y="10 + r * 23"
          width="16"
          height="21"
          rx="2"
          :fill="fill"
        />
      </g>
      <circle cx="91" cy="43" r="9" fill="#fff" stroke="#1d1b19" stroke-width="3" />
      <circle cx="91" cy="43" r="3.5" fill="#1d1b19" />
    </svg>

    <div v-else-if="gameId === 'lucky-streak' || gameId === 'lucky-streak-revenge'" class="cards">
      <span class="back back-1"><LuckyCardBack /></span>
      <span class="back back-2"><LuckyCardBack /></span>
      <PlayingCard
        class="front"
        :card="
          gameId === 'lucky-streak'
            ? { id: 0, kind: 'number', value: 13, special: 'lucky13' }
            : { id: 0, kind: 'number', value: 7, special: 'unlucky7' }
        "
      />
    </div>

    <svg v-else-if="gameId === 'tier-talk'" viewBox="0 0 200 110">
      <g v-for="(tier, i) in TIERS" :key="tier.label">
        <rect x="40" :y="8 + i * 25" width="22" height="21" rx="3" :fill="tier.fill" />
        <text x="51" :y="23 + i * 25" text-anchor="middle" class="tier-label">{{ tier.label }}</text>
        <rect x="66" :y="8 + i * 25" width="96" height="21" rx="3" class="lane" />
        <rect
          v-for="n in tier.count"
          :key="n"
          :x="69 + (n - 1) * 24"
          :y="11 + i * 25"
          width="20"
          height="15"
          rx="2"
          class="chip"
        />
      </g>
    </svg>

    <svg v-else-if="gameId === 'dial-in'" viewBox="0 0 200 110">
      <path d="M30 98 A70 70 0 0 1 170 98 Z" class="lane" />
      <path d="M100 98 L138 39 A70 70 0 0 1 157 58 Z" fill="#f2b705" />
      <path d="M100 98 L149 48 A70 70 0 0 1 157 58 Z" fill="#e4572e" />
      <path d="M100 98 L131 34 A70 70 0 0 1 138 39 Z" fill="#4d7cfe" />
      <line x1="100" y1="98" x2="72" y2="40" class="needle" />
      <circle cx="100" cy="98" r="7" class="hub" />
    </svg>

    <svg v-else-if="gameId === 'overheat'" viewBox="0 0 200 120">
      <path :d="TRACK" class="asphalt" />
      <path :d="TRACK" class="kerb" />
      <line x1="100" y1="8" x2="100" y2="32" class="finish" />
      <circle v-for="car in CARS" :key="car.fill" :cx="car.x" :cy="car.y" r="6" :fill="car.fill" class="car" />
    </svg>

    <svg v-else-if="gameId === 'mascot-mayhem'" viewBox="0 0 200 110">
      <line v-for="i in 4" :key="i" x1="0" :y1="i * 26 + 2" x2="200" :y2="i * 26 + 2" class="lane-line" />
      <line x1="186" y1="0" x2="186" y2="110" class="finish ink" />
      <g
        v-for="(mascot, i) in MASCOTS"
        :key="mascot.name"
        :transform="`translate(${[118, 78, 152, 50][i]} ${18 + i * 26}) scale(0.62)`"
      >
        <MascotSprite :animal="mascot.animal" :color="mascot.color" running />
      </g>
    </svg>

    <svg v-else-if="gameId === 'midnight-lift'" viewBox="0 0 200 110">
      <rect width="200" height="110" rx="8" class="ml-ground" />
      <rect v-for="(b, i) in LIFT_BLOCKS" :key="i" :x="b[0]" :y="b[1]" :width="b[2]" height="38" rx="4" class="ml-block" />
      <polyline points="40,51 70,51 100,51 100,80 130,80" class="ml-trail" />
      <circle cx="130" cy="80" r="7" class="ml-thief" />
      <circle cx="160" cy="51" r="9" fill="#2f6fde" stroke="#fff" stroke-width="2" />
      <circle cx="70" cy="22" r="9" fill="#d6453d" stroke="#fff" stroke-width="2" />
      <circle cx="40" cy="51" r="8" class="ml-lantern" />
    </svg>

    <svg v-else-if="gameId === 'drift-lines'" viewBox="0 0 200 110">
      <rect width="200" height="110" rx="8" class="dl-canal" />
      <g transform="translate(50 5) scale(0.333)">
        <g v-for="(p, i) in DRIFT_PIECES" :key="i" :transform="`translate(${p.x} ${p.y})`">
          <rect x="4" y="4" width="92" height="92" rx="10" class="dl-piece" />
          <path v-for="c in p.paths" :key="c.key" :d="c.d" class="dl-water" />
        </g>
        <path v-for="(t, i) in DRIFT_TRAILS" :key="i" :d="t.d" class="dl-trail" :style="{ stroke: t.fill }" />
        <circle cx="33" cy="100" r="16" fill="#e63946" />
        <circle cx="200" cy="133" r="16" fill="#3a86ff" />
      </g>
    </svg>

    <svg v-else-if="gameId === 'tic-tac-toe'" viewBox="0 0 200 110">
      <g class="grid">
        <line x1="85" y1="10" x2="85" y2="100" />
        <line x1="115" y1="10" x2="115" y2="100" />
        <line x1="55" y1="40" x2="145" y2="40" />
        <line x1="55" y1="70" x2="145" y2="70" />
      </g>
      <g v-for="(mark, i) in MARKS" :key="i" :transform="`translate(${70 + (i % 3) * 30} ${25 + Math.floor(i / 3) * 30})`">
        <path v-if="mark === 'X'" d="M-9 -9 L9 9 M9 -9 L-9 9" class="x" />
        <circle v-else-if="mark === 'O'" r="9" class="o" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.thumb {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}

svg {
  width: 100%;
  height: 100%;
}

.lane {
  fill: color-mix(in srgb, var(--ink) 10%, transparent);
}

.chip {
  fill: var(--surface);
  stroke: color-mix(in srgb, var(--ink) 30%, transparent);
}

.tier-label {
  fill: #1d1b19;
  font-size: 14px;
  font-weight: 800;
}

.needle {
  stroke: var(--ink);
  stroke-width: 4;
  stroke-linecap: round;
}

.hub {
  fill: var(--ink);
}

.asphalt {
  fill: none;
  stroke: #3c3a38;
  stroke-width: 22;
}

.kerb {
  fill: none;
  stroke: #ffffff;
  stroke-width: 1.5;
  stroke-dasharray: 6 6;
  opacity: 0.6;
}

.finish {
  stroke: #ffffff;
  stroke-width: 4;
  stroke-dasharray: 4 4;
}

.car {
  stroke: #1d1b19;
  stroke-width: 2;
}

.lane-line {
  stroke: color-mix(in srgb, var(--ink) 18%, transparent);
  stroke-dasharray: 5 5;
}

.finish.ink {
  stroke: var(--ink);
}

.grid line {
  stroke: var(--ink);
  stroke-width: 4;
  stroke-linecap: round;
}

.x {
  stroke: var(--accent);
  stroke-width: 5;
  stroke-linecap: round;
}

.o {
  fill: none;
  stroke: #1b4fd8;
  stroke-width: 5;
}

:root[data-theme='dark'] .o {
  stroke: #6f9bff;
}

/* Midnight Lift */
.ml-ground {
  fill: #3a3f52;
}

.ml-block {
  fill: #e9e1cf;
}

:root[data-theme='dark'] .ml-ground {
  fill: #12141c;
}

:root[data-theme='dark'] .ml-block {
  fill: #2c2a33;
}

.ml-trail {
  fill: none;
  stroke: var(--accent);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ml-thief {
  fill: #1d1b19;
  stroke: var(--accent);
  stroke-width: 3;
}

.ml-lantern {
  fill: #ffc93c;
}

/* Drift Lines */
.dl-canal {
  fill: #2b4a63;
}

:root[data-theme='dark'] .dl-canal {
  fill: #13222f;
}

.dl-piece {
  fill: #f3ede0;
}

.dl-water {
  fill: none;
  stroke: #9bb3c4;
  stroke-width: 9;
  stroke-linecap: round;
}

.dl-trail {
  fill: none;
  stroke-width: 13;
  stroke-linecap: round;
}

/* Lucky Streak: two card backs fanned behind a face-up card. */
.cards {
  position: relative;
  width: 6rem;
  height: 4.3rem;
}

.back,
.front {
  position: absolute;
  top: 0;
  left: 50%;
  width: 3.1rem;
  height: 4.3rem;
}

.back-1 {
  transform: translateX(-110%) rotate(-14deg);
}

.back-2 {
  transform: translateX(-80%) rotate(-5deg);
}

.front {
  transform: translateX(-30%) rotate(8deg);
}
</style>
