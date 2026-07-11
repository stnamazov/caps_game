<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted } from 'vue'
import { useLoop } from '@tresjs/core'
import { useEventBus } from '@/composables/useEventBus'

const { on } = useEventBus()

// Ссылки на камеру и мышь
const cameraRef = shallowRef<any>(null)
const mouse = { x: 0, y: 0 }
const isMobile = ref(false)

// Параметры орбиты камеры
const orbitRadius = 5.2
const baseHeight = 5.8

// Центральная точка (ось) обзора камеры — 45 градусов (Math.PI / 4)
const centerAngle = Math.PI / 4 
let targetAngle = centerAngle
let currentAngle = centerAngle

// Время для имитации дыхания и авто-движения
let breathingTime = 0
let autoOrbitTime = 0

// ========================================================
// ПЕРЕМЕННЫЕ ДЛЯ ВСТРЯСКИ КАМЕРЫ
// ========================================================
const shakeIntensity = ref(0)
const SHAKE_DECAY = 0.88 // Скорость затухания (чем меньше, тем быстрее гаснет тряска)

const onMouseMove = (event: MouseEvent) => {
  if (isMobile.value) return
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1

  targetAngle = centerAngle + mouse.x * (Math.PI / 20)
}

// Подписываемся на удар фишки
on('fishka:hit', (data) => {
  if (data.type === 'floor') {
    // Активируем встряску. 
    // Силу встряски можно завязать на data.force (если передаешь), либо сделать фиксированной.
    // Значение 0.15–0.25 дает отличный "тяжелый" бабах.
    shakeIntensity.value = 0.18 
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

  breathingTime += delta * 1.2 

  if (isMobile.value) {
    autoOrbitTime += delta * 0.5 
    currentAngle = centerAngle + Math.sin(autoOrbitTime) * (Math.PI / 12)
  } else {
    currentAngle += (targetAngle - currentAngle) * 0.04
  }

  // Расчет базовых координат камеры на дуге орбиты
  let newX = Math.cos(currentAngle) * orbitRadius
  let newZ = Math.sin(currentAngle) * orbitRadius

  // Микро-дыхание по вертикали
  const breathingOffset = Math.sin(breathingTime) * 0.04
  let dynamicHeight = baseHeight + (isMobile.value ? 0 : mouse.y * 0.4) + breathingOffset

  // ========================================================
  // РАСЧЕТ И НАЛОЖЕНИЕ ВСТРЯСКИ
  // ========================================================
  if (shakeIntensity.value > 0.001) {

    // Метод А: Высокочастотный шум через Math.sin от времени рендера (более плавный, кинематографичный)
    const shakeX = Math.sin(elapsed * 70) * shakeIntensity.value
    const shakeY = Math.cos(elapsed * 83) * shakeIntensity.value
    const shakeZ = Math.sin(elapsed * 61) * shakeIntensity.value

    /* Метод Б: Если нужен жесткий хаотичный "цифровой" дрож (глитч), раскомментируй это:
    const shakeX = (Math.random() - 0.5) * 2 * shakeIntensity.value
    const shakeY = (Math.random() - 0.5) * 2 * shakeIntensity.value
    const shakeZ = (Math.random() - 0.5) * 2 * shakeIntensity.value
    */

    // Добавляем смещение встряски к рассчитанным координатам
    newX += shakeX
    dynamicHeight += shakeY
    newZ += shakeZ

    // Линейно затухаем силу тряски с течением времени (адаптировано под delta fps)
    // Либо по-простому: shakeIntensity.value *= SHAKE_DECAY
    shakeIntensity.value *= Math.pow(SHAKE_DECAY, delta * 60)
  } else {
    shakeIntensity.value = 0
  }
  // ========================================================

  // Применяем итоговую позицию
  cameraRef.value.position.set(newX, dynamicHeight, newZ)
  
  // Камера держит фокус
  cameraRef.value.lookAt(0, 0, 0)
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