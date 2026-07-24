<script setup lang="ts">
const { isLoading, setLoading } = useGameState()
const { initGame } = useGameplay()

onMounted(() => {
  setTimeout(() => {
    initGame([
      {
        id: 'player',
        name: 'Игрок',
        initialCapsCount: 5
      },
      {
        id: 'stas',
        name: 'Стас',
        initialCapsCount: 5
      }
    ])
    setLoading(false)
  }, 1000)
})
</script>

<template>
  <div class="game-viewport">
    <!-- WebGL + игровой UI только на клиенте — иначе hydration mismatch -->
    <ClientOnly>
      <div class="w-full h-screen flex flex-col items-center justify-center select-none fixed z-150 pointer-events-none">
        <UiLoading v-if="isLoading" />
        <UiGameInterface v-else />
      </div>

      <TresCanvas window-size :class="['canvas-webgl', { 'canvas-visible': !isLoading }]">
        <SceneCamera />
        <SceneLight />
        <ScenePostProcessing />

        <ObjectsCaps />
        <ObjectsLocation />
      </TresCanvas>
    </ClientOnly>
  </div>
</template>