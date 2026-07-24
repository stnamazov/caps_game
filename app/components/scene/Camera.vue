<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted } from 'vue'
import { useLoop } from '@tresjs/core'
import { useEventBus } from '@/composables/useEventBus' // Не забываем импорт шины
import * as THREE from 'three'

const { on } = useEventBus()

const cameraRef = shallowRef<THREE.PerspectiveCamera | null>(null)
const mouse = { x: 0, y: 0 }
const isMobile = ref(false)

// ========================================================
// СОСТОЯНИЯ ВКЛЮЧЕНИЯ / ОТКЛЮЧЕНИЯ АНИМАЦИЙ
// ========================================================
const isAutopilotEnabled = ref(true)      // Плавные перелеты между ракурсами (lerp)
const isDynamicEffectsEnabled = ref(true)  // Реакция на мышь, дыхание и блуждающий взгляд

// ========================================================
// КОНФИГУРАЦИЯ И ПРЕСЕТЫ С УЧЕТОМ НАКЛОНА ГОЛОВЫ (up)
// ========================================================
const getUpVector = (degrees: number) => {
  const radians = (degrees * Math.PI) / 180
  return [Math.sin(radians), Math.cos(radians), 0] as const
}

const CAMERA_PRESETS = {
  WELCOME: { pos: [2, 3, 20], look: [0, 5, 0], up: getUpVector(45) },
  DIALOGUE: { pos: [5, 12, 20], look: [0, 10, 0], up: getUpVector(0) },
  TAKE: { pos: [5, 10, 15], look: [0, 5, 0], up: getUpVector(0) },
  PLAYING: { pos: [3, 7, 5], look: [0, 0.2, 0], up: getUpVector(0) },
} as const

type PresetName = keyof typeof CAMERA_PRESETS

const initialPreset = CAMERA_PRESETS.PLAYING

// Базовые векторы целей
const targetPos = new THREE.Vector3(...initialPreset.pos)
const targetLook = new THREE.Vector3(...initialPreset.look)
const targetUp = new THREE.Vector3(...initialPreset.up)

// Текущие сглаженные векторы для интерполяции (lerp)
const currentPos = targetPos.clone()
const currentLook = targetLook.clone()
const currentUp = targetUp.clone()
const finalLookAt = new THREE.Vector3()

// Переменные динамического наклона (от мыши)
let targetMouseRoll = 0
let currentMouseRoll = 0

// Координаты смещения взгляда (мышь + шум)
let targetMouseX = 0, targetMouseY = 0
let currentMouseX = 0, currentMouseY = 0
let wanderTimeX = 0, wanderTimeY = 0, breathingTime = 0

// Настройки эффектов (Тряска)
const shakeIntensity = ref(0)
const SHAKE_DECAY = 0.85

// ========================================================
// ИВЕНТЫ: СМЕНА РАКУРСА, ЭФФЕКТЫ И УПРАВЛЕНИЕ АНИМАЦИЕЙ
// ========================================================
on('camera:move', (data: { preset?: PresetName | string; position?: { x: number, y: number, z: number }; lookAt?: { x: number, y: number, z: number } }) => {
  if (data.preset && data.preset in CAMERA_PRESETS) {
    const p = CAMERA_PRESETS[data.preset as PresetName]
    targetPos.fromArray(p.pos)
    targetLook.fromArray(p.look)
    targetUp.fromArray(p.up)
    return
  }
  
  if (data.position) targetPos.set(data.position.x, data.position.y, data.position.z)
  if (data.lookAt) targetLook.set(data.lookAt.x, data.lookAt.y, data.lookAt.z)
  targetUp.set(0, 1, 0)
})

on('camera:action', (data: { type: 'SHAKE'; intensity?: number }) => {
  if (data.type === 'SHAKE') {
    shakeIntensity.value = data.intensity ?? 0.22
  }
})

// Дополнительный обработчик шины событий для динамического изменения настроек камеры
// Например, из консоли или триггера в UI: emit('camera:toggle_features', { autopilot: false, dynamics: true })
on('camera:toggle_features', (data: { autopilot?: boolean; dynamics?: boolean }) => {
  if (data.autopilot !== undefined) isAutopilotEnabled.value = data.autopilot
  if (data.dynamics !== undefined) isDynamicEffectsEnabled.value = data.dynamics
})

// ========================================================
// МЫШЬ И МОБИЛЬНЫЕ
// ========================================================
const onMouseMove = (e: MouseEvent) => {
  if (isMobile.value || !isDynamicEffectsEnabled.value) return
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
  
  targetMouseX = mouse.x * 0.8
  targetMouseY = mouse.y * 0.6
  targetMouseRoll = -mouse.x * 0.04 
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  isMobile.value = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
})

onUnmounted(() => window.removeEventListener('mousemove', onMouseMove))

// ========================================================
// ИГРОВОЙ ЦИКЛ (ОПТИМИЗИРОВАННЫЙ РЕНДЕР)
// ========================================================
const { onRender } = useLoop()

onRender(({ delta, elapsed }) => {
  const camera = cameraRef.value
  if (!camera) return

  // 1. ПОЗИЦИОНИРОВАНИЕ И ЛЕРП (АВТОПИЛОТ)
  if (isAutopilotEnabled.value) {
    currentPos.lerp(targetPos, 0.05)
    currentLook.lerp(targetLook, 0.05)
    currentUp.lerp(targetUp, 0.05)
  }

  // 2. РАСЧЕТ МИКРОДИНАМИКИ (ДЫХАНИЕ, ВЗГЛЯД, МЫШЬ)
  let yBreathingOffset = 0
  let wanderX = 0
  let wanderY = 0

  if (isDynamicEffectsEnabled.value) {
    breathingTime += delta * 1.5
    wanderTimeX += delta * 0.4
    wanderTimeY += delta * 0.55

    // Дыхание
    yBreathingOffset = Math.sin(breathingTime) * 0.03

    // Блуждание взгляда
    wanderX = Math.sin(wanderTimeX) * Math.cos(wanderTimeX * 0.5) * 0.25
    wanderY = Math.cos(wanderTimeY) * 0.15

    // Инерция мыши
    if (!isMobile.value) {
      currentMouseX += (targetMouseX - currentMouseX) * 0.05
      currentMouseY += (targetMouseY - currentMouseY) * 0.05
      currentMouseRoll += (targetMouseRoll - currentMouseRoll) * 0.05
    }
  } else {
    // Если эффекты отключены, плавно возвращаем инерцию мыши и наклона головы в нулевую точку
    currentMouseX += (0 - currentMouseX) * 0.1
    currentMouseY += (0 - currentMouseY) * 0.1
    currentMouseRoll += (0 - currentMouseRoll) * 0.1
  }

  // Применяем позицию камеры (с учетом или без дыхания)
  camera.position.set(currentPos.x, currentPos.y + yBreathingOffset, currentPos.z)

  // Итоговая точка взгляда
  finalLookAt.set(
    currentLook.x + currentMouseX + wanderX,
    currentLook.y + currentMouseY + wanderY,
    currentLook.z
  )

  // 3. РАСЧЕТ ТРЯСКИ (Оставляем активной всегда, так как это реакция на физический удар)
  let currentShakeRoll = 0
  if (shakeIntensity.value > 0.001) {
    finalLookAt.x += Math.sin(elapsed * 80) * shakeIntensity.value
    finalLookAt.y += Math.cos(elapsed * 95) * shakeIntensity.value
    finalLookAt.z += Math.sin(elapsed * 67) * shakeIntensity.value
    
    currentShakeRoll = Math.sin(elapsed * 50) * shakeIntensity.value * 0.2
    shakeIntensity.value *= Math.pow(SHAKE_DECAY, delta * 60)
  } else {
    shakeIntensity.value = 0
  }

  // 4. ПРИМЕНЕНИЕ НАКЛОНА И ВЗГЛЯДА
  camera.up.copy(currentUp)
  camera.up.x += currentMouseRoll + currentShakeRoll

  camera.lookAt(finalLookAt)
})
</script>

<template>
  <TresPerspectiveCamera ref="cameraRef" :fov="50" :near="0.1" :far="1000" /> 
</template>