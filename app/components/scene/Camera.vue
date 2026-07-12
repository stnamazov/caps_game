<script setup lang="ts">
import { useLoop } from '@tresjs/core'
import * as THREE from 'three'

const { on } = useEventBus()

const cameraRef = shallowRef<any>(null)
const mouse = { x: 0, y: 0 }
const isMobile = ref(false)

// ========================================================
// НАСТРОЙКИ ФИКСИРОВАННОЙ КАМЕРЫ (FIRST-PERSON)
// ========================================================
// Камера теперь жестко стоит на месте (например, чуть сбоку и сверху)
const CAMERA_STATIC_POS = new THREE.Vector3(4, 5.0, 4)

// Базовая точка, куда изначально смотрит человек (центр стола, где фишки)
const BASE_LOOK_AT = new THREE.Vector3(0, 0.3, 0)

// Текущие смещения взгляда от мыши и шума
let targetLookX = 0
let targetLookY = 0
let currentLookX = 0
let currentLookY = 0

// Время для имитации блуждающего взгляда и дыхания
let wanderTimeX = 0
let wanderTimeY = 0
let breathingTime = 0

// Встряска
const shakeIntensity = ref(0)
const SHAKE_DECAY = 0.85

const onMouseMove = (event: MouseEvent) => {
  if (isMobile.value) return
  // Нормализуем координаты
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

  // Мышь смещает точку взгляда в пределах разумного радиуса (+- 0.8 юнитов в 3D пространстве)
  targetLookX = mouse.x * 0.8
  targetLookY = mouse.y * 0.6
}

on('fishka:hit', (data) => {
  if (data.type === 'floor') {
    // Встряска для первого лица должна быть ощутимой, но быстрой
    shakeIntensity.value = 0.22 
  }
})

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  isMobile.value = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
})

const { onRender } = useLoop()

onRender(({ delta, elapsed }) => {
  if (!cameraRef.value) return

  // Увеличиваем тайминги с разной скоростью, чтобы движения по X и Y не синхронизировались
  breathingTime += delta * 1.5
  wanderTimeX += delta * 0.4 
  wanderTimeY += delta * 0.55

  // 1. ПОЗИЦИЯ КАМЕРЫ: Жестко зафиксирована + микро-дыхание по вертикали (Y)
  const breathingOffset = Math.sin(breathingTime) * 0.03
  cameraRef.value.position.set(
    CAMERA_STATIC_POS.x,
    CAMERA_STATIC_POS.y + breathingOffset,
    CAMERA_STATIC_POS.z
  )

  // 2. БЛУЖДАЮЩИЙ ВЗГЛЯД (Авто-анимация)
  // Накладываем легкое блуждание (для мобилок оно основное, для десктопа — накладывается поверх мыши)
  const wanderX = Math.sin(wanderTimeX) * Math.cos(wanderTimeX * 0.5) * 0.25
  const wanderY = Math.cos(wanderTimeY) * 0.15

  if (isMobile.value) {
    // На мобилках взгляд блуждает сам
    currentLookX = wanderX
    currentLookY = wanderY
  } else {
    // На десктопе плавно следим за мышкой (Lerp) + подмешиваем блуждание взгляда
    currentLookX += (targetLookX - currentLookX) * 0.05
    currentLookY += (targetLookY - currentLookY) * 0.05
  }

  // 3. РАСЧЕТ ИТОГОВОЙ ТОЧКИ НАПРАВЛЕНИЯ ВЗГЛЯДА (Target LookAt)
  // Базовая точка + отклонение глаз (мышь/шум)
  const finalLookAt = new THREE.Vector3(
    BASE_LOOK_AT.x + (isMobile.value ? currentLookX : currentLookX + wanderX),
    BASE_LOOK_AT.y + (isMobile.value ? currentLookY : currentLookY + wanderY),
    BASE_LOOK_AT.z
  )

  // 4. НАЛОЖЕНИЕ ВСТРЯСКИ ПРИ УДАРЕ (Трясем саму точку взгляда, имитируя дрожь головы)
  if (shakeIntensity.value > 0.001) {
    const shakeX = Math.sin(elapsed * 80) * shakeIntensity.value
    const shakeY = Math.cos(elapsed * 95) * shakeIntensity.value
    const shakeZ = Math.sin(elapsed * 67) * shakeIntensity.value

    finalLookAt.x += shakeX
    finalLookAt.y += shakeY
    finalLookAt.z += shakeZ

    shakeIntensity.value *= Math.pow(SHAKE_DECAY, delta * 60)
  } else {
    shakeIntensity.value = 0
  }

  // Заставляем камеру смотреть в рассчитанную «живую» точку
  cameraRef.value.lookAt(finalLookAt)
})
</script>

<template>
  <TresPerspectiveCamera 
    ref="cameraRef" 
    :fov="50" 
    :near="0.1" 
    :far="1000" 
  />
</template>