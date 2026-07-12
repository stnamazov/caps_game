import { ref, computed } from 'vue'

// 1. Описываем экраны/стадии игры (без паузы и геймовера)
export type GameStage = 'WELCOME' | 'PLAYING'

// 2. Глобальное состояние (вне функции)
const currentStage = ref<GameStage>('WELCOME')
const isLoading = ref(true) // По умолчанию загрузка включена, пока ассеты не готовы
const score = ref(0)
const totalThrows = ref(0)
const comboMultiplier = ref(1)

export function useGameState() {
  
  // Геттеры (Read-only)
  const isWelcomeScreen = computed(() => currentStage.value === 'WELCOME')
  const isPlaying = computed(() => currentStage.value === 'PLAYING')
  
  // Вычисляемая точность
  const accuracy = computed(() => {
    if (totalThrows.value === 0) return 0
    return Math.round((score.value / totalThrows.value) * 100)
  })

  // 3. Методы управления состоянием (Actions)
  function setStage(stage: GameStage) {
    currentStage.value = stage
  }

  function setLoading(loading: boolean) {
    isLoading.value = loading
  }

  function startGame() {
    // Начать игру можно только если все ассеты загружены
    if (isLoading.value) return
    
    score.value = 0
    totalThrows.value = 0
    comboMultiplier.value = 1
    setStage('PLAYING')
  }

  function addPoints(points: number) {
    score.value += points * comboMultiplier.value
  }

  function incrementThrows() {
    totalThrows.value++
  }

  return {
    // Стейт
    currentStage,
    isLoading,
    score,
    totalThrows,
    comboMultiplier,
    
    // Геттеры
    isWelcomeScreen,
    isPlaying,
    accuracy,
    
    // Экшены
    setStage,
    setLoading,
    startGame,
    addPoints,
    incrementThrows
  }
}