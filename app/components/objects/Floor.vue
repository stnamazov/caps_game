<script setup lang="ts">
import { watch } from 'vue'
import { useLoader } from '@tresjs/core'
import * as THREE from 'three'

const { state: texture, isLoading, error } = useLoader(
    THREE.TextureLoader,
    '/textures/floor.jpeg',
)

// Как только текстура загрузится, настраиваем её тайлинг
watch(texture, (newTexture) => {
  if (newTexture) {
    // Включаем режим бесконечного повторения во все стороны
    newTexture.wrapS = THREE.RepeatWrapping
    newTexture.wrapT = THREE.RepeatWrapping
    
    // Задаем размер сетки: повторить 10 раз по горизонтали и 10 раз по вертикали
    newTexture.repeat.set(5, 5)
    
    // Сигнализируем Three.js, что ассет обновился и его нужно перерендерить
    newTexture.needsUpdate = true
  }
})
</script>

<template>
    <TresMesh :position="[0, -0.01, 0]">
        <TresBoxGeometry :args="[50, 0.02, 50]" />
        <TresMeshStandardMaterial v-if="texture" :map="texture" />
    </TresMesh>
</template>