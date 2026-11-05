<script setup lang="ts">
import HomePage from './components/HomePage.vue'
import RoomPage from './components/RoomPage.vue'

const match = location.pathname.match(/^\/room\/([a-z0-9]+)\/?$/i)
const roomCode = match?.[1]?.toUpperCase() ?? null
</script>

<template>
  <RoomPage v-if="roomCode" :code="roomCode" />
  <HomePage v-else />
</template>
