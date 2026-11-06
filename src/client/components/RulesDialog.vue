<script setup lang="ts">
import { ref, type Component } from 'vue'

defineProps<{ title: string; rules: Component }>()

const dialog = ref<HTMLDialogElement | null>(null)

defineExpose({ open: () => dialog.value?.showModal() })

// Clicking the dimmed area outside the box closes it.
function closeOnBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) dialog.value?.close()
}
</script>

<template>
  <dialog ref="dialog" class="rules-dialog" :aria-label="`How to play ${title}`" @click="closeOnBackdrop">
    <div class="rules-body">
      <header class="rules-header">
        <h2>How to play {{ title }}</h2>
        <button aria-label="Close" @click="dialog?.close()">✕</button>
      </header>
      <component :is="rules" />
    </div>
  </dialog>
</template>

<style scoped>
.rules-dialog {
  width: min(40rem, calc(100vw - 2rem));
  max-height: min(85vh, 50rem);
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--ink);
}

.rules-dialog::backdrop {
  background: rgb(0 0 0 / 0.5);
}

.rules-body {
  padding: 1.25rem 1.5rem 1.5rem;
}

.rules-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: -1.25rem -1.5rem 1rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.rules-body :deep(h3) {
  margin: 1.25rem 0 0.4rem;
  font-size: 1rem;
}

.rules-body :deep(p),
.rules-body :deep(ul),
.rules-body :deep(ol) {
  margin: 0 0 0.6rem;
}

.rules-body :deep(ul),
.rules-body :deep(ol) {
  padding-left: 1.25rem;
}

.rules-body :deep(li) {
  margin-bottom: 0.3rem;
}
</style>
