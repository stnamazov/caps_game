<script setup lang="ts">
import { ref, computed, watch, shallowRef } from 'vue'
import { useGLTF, useAnimations } from '@tresjs/cientos'
import * as THREE from 'three'

const { on } = useEventBus()

const { state: model, nodes } = useGLTF('/models/character.glb')
const animations = computed(() => model.value?.animations || [])
const character = computed(() => nodes.value?.Root_Scene)

// Извлекаем actions и сам mixer (он нужен для прослушивания событий окончания анимации)
const { actions, mixer } = useAnimations(animations, character)

console.log(animations)

// Храним имя дефолтной анимации, чтобы всегда знать, куда возвращаться
const IDLE_ANIMATION = "RobotArmature|Robot_Idle"

// Текущий активный экшен
const currentAction = ref<THREE.AnimationAction | null>(null)
// Флаг, заблокирован ли переход (играет ли сейчас важная однократная анимация)
const isPlayingOneShot = ref(false)

/**
 * Плавный переход между анимациями
 * @param animationName Имя следующей анимации
 * @param duration Время смешивания (кроссфейда) в секундах
 * @param isOneShot Играть ли анимацию один раз
 */
const transitionToAnimation = (animationName: string, duration = 0.5, isOneShot = false) => {
  const nextAction = actions[animationName]
  if (!nextAction || nextAction === currentAction.value) return

  // Если запускается однократная анимация
  if (isOneShot) {
    isPlayingOneShot.value = true
    nextAction.setLoop(THREE.LoopOnce, 1)
    nextAction.clampWhenFinished = true
  } else {
    isPlayingOneShot.value = false
  }

  // Плавное затухание текущей анимации
  if (currentAction.value) {
    currentAction.value.fadeOut(duration)
  }

  // Настройка и запуск новой анимации
  nextAction.reset()
  nextAction.setEffectiveWeight(1)
  nextAction.play()
  nextAction.fadeIn(duration)

  currentAction.value = nextAction
}

// Настраиваем слушатель окончания анимаций на миксере
watch(mixer, (newMixer) => {
  if (!newMixer) return

  // Добавляем обработчик завершения
  newMixer.addEventListener('finished', (event) => {
    // Проверяем, что завершилась именно та анимация, которая играла как однократная
    if (currentAction.value && event.action === currentAction.value) {
      // Плавно возвращаемся в Idle
      transitionToAnimation(IDLE_ANIMATION, 0.6, false)
    }
  })
}, { immediate: true })

// Включение Idle по умолчанию при загрузке модели
watch(actions, (newActions) => {
  if (newActions && Object.keys(newActions).length > 0) {
    transitionToAnimation(IDLE_ANIMATION, 0)
  }
}, { deep: true })


// Слушаем внешние события для запуска анимаций
on('character:animation', (data) => {
  if (!data || !data.name) return
  
  // Например, если прилетает { name: "RobotArmature|Robot_Give_Caps", oneShot: true }
  const isOneShot = data.oneShot !== undefined ? data.oneShot : true
  const duration = data.duration || 0.4

  transitionToAnimation(data.name, duration, isOneShot)
})

</script>

<template>
  <TresGroup>
    <primitive v-if="character" :object="character" :scale="2.5" :position="[0, 0, -5]" :rotation="[0, 0.2, 0]" />
  </TresGroup>
</template>