<script setup lang="ts">
import { computed } from 'vue'
import { theme, toggleTheme } from '../theme'

const isDark = computed(() => theme.value === 'dark')
</script>

<template>
  <button type="button" class="theme-toggle" role="switch" :aria-checked="isDark" @click="toggleTheme">
    <span class="icon" aria-hidden="true">{{ isDark ? '☾' : '☀' }}</span>
    Dark mode
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.icon {
  display: inline-block;
  width: 1em;
  text-align: center;
  transition: transform 0.3s ease;
}

.theme-toggle[aria-checked='true'] .icon {
  transform: rotate(-20deg);
}
</style>
