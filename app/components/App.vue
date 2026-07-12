<template>
  <div>

    <Transition name="fade">
      <UiLoader v-if="isLoading" />
    </Transition>

    <Transition name="fade">
      <UiOverlay v-if="!isLoading" />
    </Transition>

    <TresCanvas clear-color="#020420" window-size :class="['canvas-webgl', { 'canvas-visible': !isLoading }]" >
      
      <SceneCamera />
      <SceneLight />
      <ScenePostProcessing />

      <ObjectsCaps />
      <ObjectsFloor />

    </TresCanvas>
    
  </div>
</template>

<script setup lang="ts">

const { isLoading, setLoading } = useGameState()

onMounted(() => {
  // Имитируем окончание загрузки. В реальности этот метод 
  // нужно вызвать там, где все текстуры фишек и пола железно скачались (через Promise.all)
  setTimeout(() => {
    setLoading(false)
  }, 1000)
})

</script>

<style scoped>
.game-viewport {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

/* Базовые стили для канваса */
.canvas-webgl {
  opacity: 0;
  transition: opacity 1.2s ease-in-out; /* Плавное проявление 3D мира */
  pointer-events: none;
}

/* Класс, который включится после загрузки */
.canvas-visible {
  opacity: 1;
  pointer-events: auto;
}

/* Анимация плавного исчезновения лоадера и появления оверлея */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>