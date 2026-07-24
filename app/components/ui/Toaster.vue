<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { gsap } from 'gsap'

interface ToastItem extends ToastPayload {
  id: number
}

// Импортируем твой EventBus (замени путь на реальный)
const { on, off } = useEventBus()

const toasts = ref<ToastItem[]>([])
let toastIdCounter = 0

// Функция добавления тоста
const addToast = (payload: ToastPayload) => {
  const id = toastIdCounter++
  const newToast: ToastItem = {
    id,
    title: payload.title,
    text: payload.text,
    icon: payload.icon,
    duration: payload.duration || 3500
  }

  toasts.value.push(newToast)

  // Анимируем появление нового элемента на следующем тике Vue
  nextTick(() => {
    animateIn(id)
  })

  // Автоматически удаляем тост по истечении времени
  setTimeout(() => {
    removeToast(id)
  }, newToast.duration)
}

// Анимация ПОЯВЛЕНИЯ плашки (вылет справа с упругим отскоком)
const animateIn = (id: number) => {
  const el = document.querySelector(`[data-toast-id="${id}"]`)
  if (!el) return

  gsap.fromTo(el, 
    { x: 100, opacity: 0, scale: 0.9 },
    { 
      x: 0, 
      opacity: 1, 
      scale: 1, 
      duration: 0.6, 
      ease: 'back.out(1.5)' // Классный пружинящий эффект при влете
    }
  )
}

// Анимация ИСЧЕЗНОВЕНИЯ плашки
const removeToast = (id: number) => {
  const el = document.querySelector(`[data-toast-id="${id}"]`)
  if (!el) {
    // Если элемента уже нет в DOM, просто убираем из массива
    toasts.value = toasts.value.filter(t => t.id !== id)
    return
  }

  // Сначала плавно уводим влево/вправо и растворяем
  gsap.to(el, {
    x: 120,
    opacity: 0,
    scale: 0.9,
    duration: 0.4,
    ease: 'power2.in',
    onComplete: () => {
      // И только после анимации физически удаляем из реактивного массива Vue
      toasts.value = toasts.value.filter(t => t.id !== id)
    }
  })
}

// Подписываемся на события при монтировании
onMounted(() => {
  on('ui:toast', addToast)
})

onUnmounted(() => {
  off('ui:toast', addToast)
})
</script>

<template>
  <div class="fixed top-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none w-80 max-w-[calc(100vw-3rem)]">
    
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :data-toast-id="toast.id"
      class="pointer-events-auto flex items-center gap-4 px-4 py-3 bg-neutral-900/90 border border-yellow-500/30 rounded-xl shadow-xl backdrop-blur-md opacity-0 transform"
    >
      <div v-if="toast.icon" class="flex-shrink-0 w-12 h-12 bg-neutral-800 rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
        <img :src="toast.icon" :alt="toast.text" class="w-10 h-10 object-contain img-shadow" />
      </div>

      <div class="flex-grow text-left">
        <span class="block text-xs font-semibold text-yellow-500 uppercase tracking-wider">
          {{ toast.title }}
        </span>
        <span class="block text-sm font-bold text-white leading-tight">
          {{ toast.text }}
        </span>
      </div>

      <button 
        @click="removeToast(toast.id)" 
        class="text-gray-500 hover:text-white text-xs px-2 py-1 cursor-pointer transition-colors"
      >
        ✕
      </button>

    </div>

  </div>
</template>

<style scoped>
/* Легкое свечение под иконкой фишки для 3D объема */
.img-shadow {
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.4));
}
</style>