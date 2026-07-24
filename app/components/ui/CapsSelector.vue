<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

// Описываем структуру фишки, которую компонент принимает на вход
interface VisualCap {
  id: number
  value: number
  isRare?: boolean
}

const props = withDefaults(
  defineProps<{
    // Список фишек для отображения (любое количество)
    caps: VisualCap[]
    // Двустороннее связывание для выбранных ID
    selected?: number[]
  }>(),
  {
    caps: () => [],
    selected: () => []
  }
)

const emit = defineEmits<{
  (e: 'update:selected', value: number[]): void
}>()

const scrollContainer = ref<HTMLElement | null>(null)
const centerIndex = ref(0)

// Ограничиваем отображение максимум 10 фишками для сохранения красивого веера
const displayedCaps = computed(() => {
  return props.caps.slice(0, 10)
})

// Включаем скролл-эффекты (snap), только если фишек во вьюпорте больше 2
const isScrollable = computed(() => displayedCaps.value.length > 2)

// Динамический отрицательный отступ (нахлест) для создания эффекта веера
const overlapMargin = computed(() => {
  const count = displayedCaps.value.length
  if (count <= 1) return '0px'
  if (count === 2) return '-10px' // Легкое сближение
  return '-28px' // Плотный нахлест для 3+ фишек
})

// Отслеживание центральной фишки при скролле (для мобильных и свайпов)
function handleScroll() {
  if (!scrollContainer.value || displayedCaps.value.length === 0 || !isScrollable.value) {
    centerIndex.value = 0
    return
  }

  const container = scrollContainer.value
  const containerCenter = container.scrollLeft + container.clientWidth / 2
  
  let closestIndex = 0
  let minDistance = Infinity

  const children = container.children
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as HTMLElement
    const childCenter = child.offsetLeft + child.clientWidth / 2
    const distance = Math.abs(containerCenter - childCenter)

    if (distance < minDistance) {
      minDistance = distance
      closestIndex = i
    }
  }

  centerIndex.value = closestIndex
}

// Клик по фишке
function handleCapClick(cap: VisualCap, index: number) {
  // Если фишек много и мы кликнули на боковую — плавно центрируем её
  if (isScrollable.value && centerIndex.value !== index && scrollContainer.value) {
    const child = scrollContainer.value.children[index] as HTMLElement
    scrollContainer.value.scrollTo({
      left: child.offsetLeft - scrollContainer.value.clientWidth / 2 + child.clientWidth / 2,
      behavior: 'smooth'
    })
    centerIndex.value = index
    return
  }

  // Переключение состояния выбора (выдвижение вверх)
  const updated = [...props.selected]
  const selectedIdx = updated.indexOf(cap.id)

  if (selectedIdx === -1) {
    updated.push(cap.id)
  } else {
    updated.splice(selectedIdx, 1)
  }

  emit('update:selected', updated)
}

// Реагируем на динамическое изменение массива входных фишек
watch(
  () => displayedCaps.value,
  async (newCaps) => {
    await nextTick()
    if (newCaps.length <= 2) {
      centerIndex.value = 0
    } else {
      handleScroll()
    }
  },
  { deep: true, immediate: true }
)

onMounted(() => {
  setTimeout(handleScroll, 100)
})
</script>

<template>
  <div class="caps-selector-wrapper pointer-events-auto">
    
    <div v-if="displayedCaps.length === 0" class="text-center text-slate-600 py-6 text-[10px] tracking-wider uppercase font-mono">
      Нет доступных фишек
    </div>

    <div 
      v-else
      ref="scrollContainer"
      @scroll="handleScroll"
      class="caps-scroll-container"
      :class="{ 'is-scrollable': isScrollable }"
    >
      <div
        v-for="(cap, index) in displayedCaps"
        :key="cap.id"
        class="cap-card-wrapper"
        :class="{
          'is-center': !isScrollable || centerIndex === index,
          'is-selected': selected?.includes(cap.id),
          'is-rare': cap.isRare
        }"
        :style="{
          zIndex: isScrollable ? (100 - Math.abs(centerIndex - index)) : 10,
          marginLeft: index === 0 ? '0px' : overlapMargin
        }"
        @click="handleCapClick(cap, index)"
      >
        <div class="cap-body">
          <div class="cap-inner font-mono">
            <span class="cap-id">ID {{ cap.id }}</span>
            <span class="cap-value">{{ cap.value }}★</span>
          </div>
          <div v-if="cap.isRare" class="rare-border"></div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.caps-selector-wrapper {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  position: relative;
  overflow: hidden;
}

/* Контейнер карусели */
.caps-scroll-container {
  display: flex;
  align-items: flex-end;
  justify-content: center; /* Центрируем, если фишек 1 или 2 */
  padding: 30px 0 15px 0; /* Место сверху для прыжка выбранной фишки */
  transition: all 0.2s ease;
}

/* Если фишек много — включаем нативный горизонтальный скролл с прилипанием */
.caps-scroll-container.is-scrollable {
  justify-content: flex-start;
  overflow-x: auto;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x mandatory;
  
  /* Паддинги, чтобы первая и последняя фишка могли встать идеально по центру */
  scroll-padding: 0 calc(50% - 45px);
  padding-left: calc(50% - 45px);
  padding-right: calc(50% - 45px);
}

/* Скрываем скроллбары на всех устройствах */
.caps-scroll-container::-webkit-scrollbar {
  display: none;
}
.caps-scroll-container {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Обертка одной фишки */
.cap-card-wrapper {
  flex: 0 0 90px; /* Фиксированный визуальный размер */
  height: 90px;
  scroll-snap-align: center;
  transition: transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1), filter 0.2s ease;
  cursor: pointer;
  position: relative;
}

/* Физическая модель фишки */
.cap-body {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: radial-gradient(circle, #1a2230 40%, #0b0f17 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6);
  position: relative;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.cap-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #8a99ad;
  font-weight: 900;
  user-select: none;
}

.cap-id {
  font-size: 9px;
  opacity: 0.6;
}

.cap-value {
  font-size: 14px;
  color: #fff;
}

/* Эффект отдаления для боковых фишек во время скролла */
.is-scrollable .cap-card-wrapper:not(.is-center) {
  transform: scale(0.8) translateY(8px);
  filter: grayscale(40%) brightness(55%);
}

/* Фокус на центральной/единственной фишке */
.cap-card-wrapper.is-center {
  transform: scale(1.1) translateY(0);
  filter: none;
}
.cap-card-wrapper.is-center .cap-body {
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 6px 15px rgba(0, 0, 0, 0.7);
}
.cap-card-wrapper.is-center .cap-inner .cap-value {
  color: #fbbf24;
}

/* Внешний вид редкой фишки */
.cap-card-wrapper.is-rare .cap-body {
  background: radial-gradient(circle, #2e0854 40%, #120e2e 100%);
}
.rare-border {
  position: absolute;
  inset: -1px;
  border: 1.5px solid #a855f7;
  border-radius: 50%;
  opacity: 0.7;
  pointer-events: none;
}

/* Анимация выдвижения фишки вверх при выборе */
.cap-card-wrapper.is-selected {
  transform: scale(1.1) translateY(-24px) !important;
}
.cap-card-wrapper.is-selected .cap-body {
  border-color: #fbbf24;
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.4);
}
</style>