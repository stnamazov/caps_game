<script setup lang="ts">
import { onMounted, onUnmounted, watch, shallowReactive } from 'vue'
import { useLoop, useTresContext } from '@tresjs/core'
import { useCapsManager } from '@/composables/useCapsManager'
import { useEventBus } from '@/composables/useEventBus'
import * as THREE from 'three'

const gameplay = useGameplay()
const { camera } = useTresContext()
const capsManager = useCapsManager(camera?.activeCamera)
const { on, emit } = useEventBus()

const textureLoader = new THREE.TextureLoader()

const RADIUS = 0.45
const THICKNESS = 0.03

const topTexture = textureLoader.load('/textures/test/top-shared.png')
const faceTextures = shallowReactive<Map<number, THREE.Texture>>(new Map())
const materialsByCap = shallowReactive<Map<number, THREE.MeshStandardMaterial[]>>(new Map())
const edgeColor = new THREE.Color('#ffffff')

// Плейсхолдер вместо map: undefined — убирает спам THREE.Material warn
const placeholderFace = (() => {
  const data = new Uint8Array([255, 255, 255, 255])
  const tex = new THREE.DataTexture(data, 1, 1)
  tex.needsUpdate = true
  return tex
})()

let isClickLocked = false

function ensureMaterials(capId: number) {
  if (materialsByCap.has(capId)) return materialsByCap.get(capId)!

  const materials = [
    new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0 }),
    new THREE.MeshStandardMaterial({ map: topTexture, roughness: 0 }),
    new THREE.MeshStandardMaterial({ map: placeholderFace, roughness: 0 }),
  ]
  materialsByCap.set(capId, materials)
  return materials
}

function ensureTextureLoaded(capId: number) {
  ensureMaterials(capId)
  if (faceTextures.has(capId)) return

  const textureUrl = '/textures/test/1.png'

  textureLoader.load(textureUrl, (tex) => {
    tex.center.set(0.5, 0.5)
    tex.repeat.x = -1
    faceTextures.set(capId, tex)

    const materials = materialsByCap.get(capId)
    if (materials?.[2]) {
      materials[2].map = tex
      materials[2].needsUpdate = true
    }
  })
}

function handleCapClick(e: any, id: number) {
  e.stopPropagation()

  if (!capsManager.isSelectionMode.value || isClickLocked) return
  isClickLocked = true

  const proposed = gameplay.proposedPlayerCaps.value || []

  if (proposed.includes(id)) {
    gameplay.proposedPlayerCaps.value = proposed.filter(capId => capId !== id)
  } else {
    gameplay.proposedPlayerCaps.value = [...proposed, id]
  }

  emit('fishka:click', { id, timestamp: Date.now() })

  setTimeout(() => {
    isClickLocked = false
  }, 50)
}

watch(
  () => Array.from(capsManager.visualCaps.value.keys()),
  (activeIds) => {
    activeIds.forEach((id) => ensureTextureLoaded(id))
  },
  { immediate: true, deep: true }
)

const { onRender } = useLoop()
onRender(({ delta }) => {
  capsManager.updatePhysics(delta)
})

const handleWheel = (e: WheelEvent) => {
  if (!capsManager.isSelectionMode.value) return
  capsManager.scrollOffset.value += e.deltaY * 0.005
}

on('ui:toggle_selection_mode', ({ active }) => {
  capsManager.isSelectionMode.value = active
  if (active) {
    emit('camera:move', { preset: 'PLAYING' })
  }
})

onMounted(() => {
  window.addEventListener('wheel', handleWheel, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('wheel', handleWheel)
  materialsByCap.forEach((mats) => mats.forEach(m => m.dispose()))
  materialsByCap.clear()
  placeholderFace.dispose()
})
</script>

<template>
  <TresGroup :scale="[1, 1, 1 + capsManager.animFrame.value * 0]">
    <TresGroup
      v-for="[id, cap] in capsManager.visualCaps.value"
      :key="id"
      :position="[cap.currentPosition.x, cap.currentPosition.y, cap.currentPosition.z]"
      :rotation="[cap.currentRotation.x, cap.currentRotation.y, cap.currentRotation.z]"
    >
      <TresMesh
        @click="(e) => handleCapClick(e, id)"
        :material="ensureMaterials(id)"
      >
        <TresCylinderGeometry :args="[RADIUS, RADIUS, THICKNESS, 16]" />
      </TresMesh>
    </TresGroup>
  </TresGroup>
</template>
