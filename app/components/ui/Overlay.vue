<template>
  <div class="fixed top-0 left-0 w-full h-full z-50 flex items-center justify-center select-none">
    <button v-on:click="emit('throw')">throw</button>
    <div v-if="currentStage === 'WELCOME'" class="flex flex-col items-center justify-center">

    </div>
  </div>
</template>

<script setup lang="ts">

const { currentStage, isLoading } = useGameState()
const { emit } = useEventBus()

</script>