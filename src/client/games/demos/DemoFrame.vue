<script setup lang="ts">
// The dashed box around a lobby practice demo, with its heading and a way to start again.
defineProps<{
  /** What the practice is, after "Practice ·". */
  label: string
  /** Set when the practice has ended: one line on how it went. */
  over?: string
}>()

defineEmits<{ restart: [] }>()
</script>

<template>
  <div class="demo">
    <div class="demo-head">
      <p class="eyebrow">Practice · {{ label }}</p>
      <button class="restart" @click="$emit('restart')">Start over</button>
    </div>
    <slot />
    <div v-if="over" class="over" aria-live="polite">
      <p>{{ over }}</p>
      <button class="primary" @click="$emit('restart')">Practice again</button>
    </div>
  </div>
</template>

<style scoped>
.demo {
  display: grid;
  gap: 0.75rem;
  justify-items: center;
  width: 100%;
  padding: 0.75rem;
  border: 2px dashed var(--line);
  border-radius: var(--radius);
  text-align: center;
}

.demo-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
}

.restart {
  padding: 0.25rem 0.7rem;
  font-size: 0.85rem;
}

.over {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  font-weight: 600;
}
</style>
