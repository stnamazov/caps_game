<script setup lang="ts">
import { computed, watch } from 'vue'
import { useGLTF } from '@tresjs/cientos'
import * as THREE from 'three'

const { state: model, nodes } = useGLTF('/models/location.glb')

console.log(nodes)

// Достаем корневой объект локации
const location = computed(() => nodes.value?.Location_Collection)

// Универсальная функция для настройки пикселизации (магнификация и минификация без сглаживания)
const applyPixelSettings = (tex: THREE.Texture) => {
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.anisotropy = 1
  tex.needsUpdate = true
  tex.colorSpace = THREE.SRGBColorSpace
}

// Следим за загрузкой локации
watch(location, (newLocation) => {
  if (!newLocation) return

  // Метод traverse обходит саму локацию и все её вложенные 3D-объекты (ноды)
  newLocation.traverse((child: any) => {
    // Проверяем, является ли объект Мешем и есть ли у него материал
    if (child.isMesh && child.material) {
      
      // Модель может использовать массив материалов или один материал
      const materials = Array.isArray(child.material) ? child.material : [child.material]

      materials.forEach((mat: THREE.MeshStandardMaterial) => {
        // 1. Проверяем основную текстуру (альбедо/диффузная карта)
        if (mat.map) applyPixelSettings(mat.map)
        
        // 2. Если у модели есть текстуры нормалей, шероховатости или эммисивные карты,
        // их тоже желательно перевести в NearestFilter, чтобы не было размытых стыков:
        if (mat.normalMap) applyPixelSettings(mat.normalMap)
        if (mat.roughnessMap) applyPixelSettings(mat.roughnessMap)
        if (mat.metalnessMap) applyPixelSettings(mat.metalnessMap)
        if (mat.emissiveMap) applyPixelSettings(mat.emissiveMap)
      })
    }
  })
}, { immediate: true })
</script>

<template>
  <primitive v-if="location" :object="location" :scale="8" />
</template>