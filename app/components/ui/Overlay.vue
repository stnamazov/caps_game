<template>
  <div class="fixed top-0 left-0 w-full h-full z-[100] flex items-end justify-center select-none">
    <div class="flex flex-col items-center justify-center px-12 py-36 text-center max-w-xl">

      <button v-on:click="test" class="border p-3">test action</button>
      
      <p v-if="lastUserChoice" class="text-yellow-300 text-sm mb-2 italic">
        — {{ lastUserChoice }}
      </p>
      
      <p 
        ref="textRef" 
        class="text-lg mb-4 leading-relaxed text-white min-h-[2rem]"
      >
        </p>

      <p 
        ref="narrationRef" 
        class="text-sm md:text-base text-gray-400 italic mb-6 opacity-0"
      >
        <span v-if="currentNode?.narration">[ {{ currentNode.narration }} ]</span>
      </p>

      <div class="flex flex-col gap-3 w-full min-w-[280px]">
        <button
          v-for="(option, index) in currentNode?.options"
          :key="index"
          @click="selectOption(option)"
          class="option-btn w-full px-10 py-2 text-yellow-300 border border-yellow-300/40 rounded-full cursor-pointer hover:text-white hover:border-white transition-colors duration-200 opacity-0 transform"
        >
          {{ option.text }}
        </button>
      </div>
      
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { gsap } from 'gsap'
import { TextPlugin } from 'gsap/TextPlugin'

// Регистрируем плагин для эффекта печати букв
gsap.registerPlugin(TextPlugin)

const { currentStage, isLoading, currentNode, lastUserChoice, selectOption } = useGameState()
const { emit } = useEventBus()

// Ссылки на DOM-элементы для анимации
const textRef = ref<HTMLElement | null>(null)
const narrationRef = ref<HTMLElement | null>(null)

// Следим за изменением шага диалога, чтобы запускать анимацию заново
watch(() => currentNode.value?.id, async () => {
  await nextTick() // Ждем, пока Vue обновит DOM под новые данные

  // 1. Сбрасываем и очищаем предыдущие анимации на элементах
  gsap.killTweensOf([textRef.value, narrationRef.value, '.option-btn'])
  
  const text = currentNode.value?.text || ''
  const hasNarration = !!currentNode.value?.narration

  // Базовый сброс стилей перед стартом
  gsap.set('.option-btn', { opacity: 0, scale: 0.8, y: 15 })
  gsap.set(narrationRef.value, { opacity: 0, y: 10 })
  if (textRef.value) textRef.value.textContent = ''

  // Создаем таймлайн для последовательного воспроизведения
  const tl = gsap.timeline()

  // Шаг А: Эффект печати текста персонажа
  if (text && textRef.value) {
    // Скорость: примерно 0.03 сек на символ
    const duration = Math.max(0.5, text.length * 0.03) 
    
    tl.to(textRef.value, {
      duration: duration,
      text: { value: text },
      ease: 'none'
    })
  }

  // Шаг Б: Плавное появление описания действия (narration)
  if (hasNarration && narrationRef.value) {
    tl.to(narrationRef.value, {
      opacity: 1,
      y: 0,
      duration: 0.4,
      ease: 'power2.out'
    }, '-=0.2') // Начинаем чуть раньше, чем допечатается текст
  }

  // Шаг В: Появление кнопок со "встряской" (elastic bump)
  tl.to('.option-btn', {
    opacity: 1,
    scale: 1,
    y: 0,
    duration: 0.6,
    stagger: 0.1, // Кнопки появляются одна за другой с микрозадержкой
    ease: 'back.out(2.2)', // back.out дает классный пружинящий отскок (встряску) при появлении
  }, '-=0.1')

}, { immediate: true })

const test = () => {
  emit('game:reset_caps', { ids: [9] })
}

const inspectPlayer = () => {
  emit('camera:move', {
    position: { x: 5, y: 5, z: 5 }, 
    lookAt: { x: 0, y: 0.3, z: 0 }  
  })
}

const resetToTable = () => {
  emit('camera:move', {
    position: { x: 5, y: 12, z: 20 }, 
    lookAt: { x: 0, y: 10, z: 0 } 
  })
}
</script>