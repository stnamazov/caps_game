// composables/useGameLogic.ts
import { ref } from 'vue'
import { useGameState } from './useGameState'
import { useCapsAnimation } from './useCapsAnimation' // твоя логика анимации

export function useGameLogic() {
  const state = useGameState()
  const isMatchProcessing = ref(false)

  // 1. Постановка фишек на кон (Ставка)
  function prepareMatch(selectedPlayerCapIds: number[]) {
    if (selectedPlayerCapIds.length === 0) return

    // Забираем фишки у игрока
    state.removeFromCollection(selectedPlayerCapIds)

    // Игра (оппонент) выставляет такое же количество случайных фишек
    // Для примера генерируем случайные ID от 100 до 200
    const opponentCapIds = Array.from(
      { length: selectedPlayerCapIds.length }, 
      () => Math.floor(Math.random() * 100) + 100
    )

    // Объединяем их в общую стопку на столе
    const fullStack = [...selectedPlayerCapIds, ...opponentCapIds]
    
    // Перемешиваем стопку, чтобы фишки перемешались между собой
    fullStack.sort(() => 0.5 - Math.random())

    state.setBetStack(fullStack)
    state.setStage('PLAYING')
  }

  // 2. Розыгрыш (Вызывается при ударе/броске биты)
  function resolveThrow(serverFlippedResults: { id: number, isFlipped: boolean }[]) {
    isMatchProcessing.value = true

    const wonCaps: number[] = []
    const leftOnTable: number[] = []

    // Распределяем фишки по результатам серверного броска
    serverFlippedResults.forEach(cap => {
      if (cap.isFlipped) {
        // Перевернулась? Игрок забрал себе в коллекцию!
        wonCaps.push(cap.id)
      } else {
        // Не перевернулась? Остается на столе для следующего удара
        leftOnTable.push(cap.id)
      }
    })

    // Начисляем выигрыш
    if (wonCaps.length > 0) {
      state.addToCollection(wonCaps)
    }

    // Обновляем стопку на столе
    state.setBetStack(leftOnTable)

    // Проверяем завершение матча
    if (leftOnTable.length === 0) {
      endMatch()
    }

    isMatchProcessing.value = false
  }

  function endMatch() {
    state.setStage('GAME_OVER')
    state.clearBetStack()
  }

  return {
    isMatchProcessing,
    prepareMatch,
    resolveThrow,
    endMatch
  }
}