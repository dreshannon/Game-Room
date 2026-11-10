<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Game } from '../../games/types'
import { gameViews } from '../games'
import GameThumbnail from '../games/GameThumbnail.vue'
import { canAnimate } from '../motion'

const props = defineProps<{
  games: Game<any, any>[]
  selectedId: string | null
  /** Only the host can pick. Everyone else sees the same tiles, to follow along. */
  canPick: boolean
  connectedCount: number
}>()

const emit = defineEmits<{ select: [gameId: string] }>()

const playerCount = (game: Game<any, any>) => {
  if (game.seats) return `${game.seats} players`
  if (game.minPlayers === game.maxPlayers) return `${game.minPlayers} players`
  return `${game.minPlayers}–${game.maxPlayers} players`
}

/** Why the room can't play this game right now, if it can't. */
const blocker = (game: Game<any, any>) => {
  const needed = game.seats ?? game.minPlayers
  if (props.connectedCount < needed) return `Needs ${needed - props.connectedCount} more`
  if (!game.seats && props.connectedCount > game.maxPlayers) return `Too many players`
  return null
}

// Pops the tile that was just picked, so guests notice the host's choice.
const popped = ref<string | null>(null)
watch(
  () => props.selectedId,
  (id, old) => {
    if (!id || !old || !canAnimate()) return
    popped.value = null
    requestAnimationFrame(() => (popped.value = id))
  },
)
</script>

<template>
  <div class="picker" role="radiogroup" aria-label="Game">
    <button
      v-for="game in games"
      :key="game.id"
      type="button"
      role="radio"
      class="tile"
      :class="{ selected: game.id === selectedId, blocked: blocker(game), pop: popped === game.id }"
      :style="{ '--tile-accent': gameViews[game.id]?.accent }"
      :aria-checked="game.id === selectedId"
      :disabled="!canPick && game.id !== selectedId"
      :tabindex="canPick ? undefined : -1"
      @click="canPick && emit('select', game.id)"
      @animationend="popped = null"
    >
      <span class="art"><GameThumbnail :game-id="game.id" /></span>
      <span class="text">
        <span class="name">{{ game.name }}</span>
        <span class="tagline">{{ gameViews[game.id]?.tagline }}</span>
        <span class="meta">
          <span class="count">{{ playerCount(game) }}</span>
          <span v-if="blocker(game)" class="blocker">{{ blocker(game) }}</span>
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
  gap: 0.75rem;
  width: 100%;
}

@media (max-width: 30rem) {
  .picker {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }
}

.tile {
  --tile-accent: var(--accent);
  display: grid;
  grid-template-rows: auto 1fr;
  padding: 0;
  overflow: hidden;
  text-align: left;
  font-weight: inherit;
  border: 2px solid var(--line);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}

.tile:hover:not(:disabled) {
  border-color: var(--tile-accent);
  transform: translateY(-2px) rotate(-0.4deg);
  box-shadow: 0 6px 16px rgb(0 0 0 / 0.12);
}

.tile:focus-visible {
  outline: 3px solid var(--tile-accent);
  outline-offset: 2px;
}

/* Guests can't pick, but the tiles shouldn't look broken. */
.tile:disabled {
  opacity: 0.55;
  cursor: default;
}

.tile.selected {
  border-color: var(--tile-accent);
  box-shadow:
    0 0 0 2px var(--tile-accent),
    0 6px 16px rgb(0 0 0 / 0.14);
}

.tile.selected:disabled {
  opacity: 1;
}

.art {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  padding: 0.4rem;
  background: color-mix(in srgb, var(--tile-accent) 16%, var(--surface));
}

/* The same gloss as the game cards. */
.art::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--card-gloss);
  pointer-events: none;
}

:root[data-theme='dark'] .art::after {
  opacity: 0.35;
}

.selected .art::before {
  content: '✓';
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  background: var(--tile-accent);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 800;
}

.text {
  display: grid;
  align-content: start;
  gap: 0.2rem;
  padding: 0.55rem 0.7rem 0.65rem;
}

.name {
  font-weight: 800;
  line-height: 1.2;
}

.tagline {
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.3;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.3rem;
}

.count,
.blocker {
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}

.count {
  background: color-mix(in srgb, var(--tile-accent) 18%, var(--surface));
}

.blocker {
  border: 1px dashed var(--line);
  color: var(--muted);
}

.blocked:not(.selected) .art {
  filter: saturate(0.4);
}

.pop {
  animation: pop 0.4s ease;
}

@keyframes pop {
  40% {
    transform: scale(1.05);
  }
}
</style>
