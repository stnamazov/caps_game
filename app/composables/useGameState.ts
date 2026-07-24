import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from '#app'
import { useEventBus } from '@/composables/useEventBus'

// ========================================================
// 1. ТИПЫ И ИНТЕРФЕЙСЫ
// ========================================================

export interface CharacterAnimationPayload {
  name: string
  oneShot?: boolean
  duration?: number
}

export interface DialogueActionContext {
  gameState: ReturnType<typeof useGameState>
  emit: ReturnType<typeof useEventBus>['emit']
}

export type DialogueActionFn = (ctx: DialogueActionContext) => void

export interface DialogueOption {
  text: string
  nextNodeId?: string
  actions?: DialogueActionFn
}

export interface AutoTransition {
  delayMs: number
  nextNodeId: string
  actions?: DialogueActionFn
}

export interface DialogueNode {
  id: string
  text?: string
  narration?: string
  animation?: CharacterAnimationPayload
  options: DialogueOption[]
  autoTransition?: AutoTransition
}

// ========================================================
// 2. СЦЕНАРИЙ ИГРЫ (ДИАЛОГОВОЕ ДЕРЕВО КАК СТЕЙТ-МАШИНА)
// ========================================================
export const DIALOGUE_TREE: Record<string, DialogueNode> = {
  NONE: {
    id: 'NONE'
  },
  START: {
    id: 'START',
    text: 'Дядь Сереж, зырь какая сотка! У меня и другие визарды есть. Сыграем?',
    animation: { name: 'RobotArmature|Robot_Idle', oneShot: false },
    options: [
      { 
        text: 'Шкет, ты кто такой?', 
        nextNodeId: 'INFO_1', 
        actions: (ctx) => {
          ctx.gameState.wakeUp()
          ctx.emit('camera:move', { preset: 'DIALOGUE' })
        } 
      }
    ]
  },
  INFO_1: {
    id: 'INFO_1',
    text: 'Дядь, ты забыл чтоли? Я Стас из четвертой квартиры! Давай играть уже!',
    animation: { name: 'RobotArmature|Robot_No', oneShot: true },
    options: [
      { 
        text: 'У меня соток нет...', 
        nextNodeId: 'INFO_2', 
        actions: (ctx) => {
          ctx.emit('camera:move', { preset: 'TAKE' })
        } 
      }
    ]
  },
  INFO_2: {
    id: 'INFO_2',
    text: 'Ну я тебе одолжу несколько. На держи!',
    options: [], 
    autoTransition: {
      delayMs: 3000,
      nextNodeId: 'INFO_3',
      actions: (ctx) => {
        ctx.emit('character:animation', { name: 'RobotArmature|Robot_Give_Caps', oneShot: true })
        ctx.emit('game:show_caps_pack', { ids: [0, 1, 2, 3, 4] })
        ctx.emit('ui:toast', { 
          title: 'Получен предмет', 
          text: 'Набор стартовых соток (x5)', 
          icon: '/img/caps-stack-icon.png' 
        })
      }
    }
  },
  INFO_3: {
    id: 'INFO_3',
    narration: 'Стас протягивает тебе стопку соток',
    options: [
      { 
        text: 'Это что за сотки...', 
        nextNodeId: 'INFO_4',
        actions: (ctx) => {
          ctx.emit('character:animation', { name: 'RobotArmature|Robot_Jump', oneShot: true })
        }
      }
    ]
  },
  INFO_4: {
    id: 'INFO_4',
    text: 'Сам ты покемон! С покемонами у всех есть, а такие только у меня... Я их сам делаю!',
    animation: { name: 'RobotArmature|Robot_Idle', oneShot: false },
    options: [
      { 
        text: 'Ладно... Давай сыграем', 
        actions: (ctx) => {
          ctx.gameState.startGame()
          ctx.emit('camera:move', { preset: 'PLAYING' })
        } 
      }
    ]
  }
}

// ========================================================
// 3. ГЛОБАЛЬНЫЙ СИНГЛТОН-СТЕЙТ (ВНЕ ФУНКЦИИ)
// ========================================================
const isLoading = ref(true)
const isSleeping = ref(false)      // Начинаем игру с закрытыми глазами (сон)
const isDialogueActive = ref(true) // Идет ли сейчас режим диалога/сцены

// Игровые метрики
const score = ref(0)
const totalThrows = ref(0)
const comboMultiplier = ref(1)

// Состояние диалога
const currentNodeId = ref<string>('NONE')
const lastUserChoice = ref<string | null>(null)
let transitionTimer: NodeJS.Timeout | null = null

// ========================================================
// 4. ЕДИНЫЙ КОМПОЗАБЛ УПРАВЛЕНИЯ ИГРОЙ
// ========================================================
export function useGameState() {
  const route = useRoute()
  const { emit } = useEventBus()

  // ------------------------------------------------------
  // Геттеры / Вычисляемые свойства
  // ------------------------------------------------------
  const special = computed(() => (route.params.special as string) || false)
  const currentNode = computed(() => DIALOGUE_TREE[currentNodeId.value])
  
  const accuracy = computed(() => {
    if (totalThrows.value === 0) return 0
    return Math.round((score.value / totalThrows.value) * 100)
  })
  

  // ------------------------------------------------------
  // Системная логика переходов диалогов
  // ------------------------------------------------------
  const clearActiveTimer = () => {
    if (transitionTimer) {
      clearTimeout(transitionTimer)
      transitionTimer = null
    }
  }

  // Контекст, прокидываемый в функции действий в диалоге
  // Использует ленивое геттер-вызывание, чтобы избежать рекурсии при инициализации
  const getActionContext = (): DialogueActionContext => ({
    gameState: useGameState(),
    emit
  })

  const startAutoTransition = (transition: AutoTransition) => {
    clearActiveTimer()
    transitionTimer = setTimeout(() => {
      if (transition.actions) {
        transition.actions(getActionContext())
      }
      currentNodeId.value = transition.nextNodeId
    }, transition.delayMs)
  }

  const selectOption = (option: DialogueOption) => {
    clearActiveTimer()
    lastUserChoice.value = option.text
    
    if (option.actions) {
      option.actions(getActionContext())
    }

    if (option.nextNodeId) {
      currentNodeId.value = option.nextNodeId
    }
  }

  // ------------------------------------------------------
  // Экшены управления игрой (Actions)
  // ------------------------------------------------------
  function setLoading(loading: boolean) {
    isLoading.value = loading
  }

  function wakeUp() {
    isSleeping.value = false
  }

  function startGame() {
    isSleeping.value = false 
    isDialogueActive.value = false // Прячем UI диалога, отдаем управление игроку
    
    score.value = 0
    totalThrows.value = 0
    comboMultiplier.value = 1
  }

  function addPoints(points: number) {
    score.value += points * comboMultiplier.value
  }

  function incrementThrows() {
    totalThrows.value++
  }

  function resetToDialogue(nodeId = 'START') {
    clearActiveTimer()
    isDialogueActive.value = true
    currentNodeId.value = nodeId
    lastUserChoice.value = null
  }

  // Наблюдатель за автоматическими действиями при смене шагов
  watch(currentNodeId, () => {
    const node = currentNode.value
    if (!node || !isDialogueActive.value) return

    // Фоновая анимация Стаса при входе на шаг
    if (node.animation) {
      emit('character:animation', node.animation)
    }

    if (node.autoTransition) {
      startAutoTransition(node.autoTransition)
    } else {
      clearActiveTimer()
    }
  }, { immediate: true })

  // Очистка таймеров, если юзер уходит со страницы
  onUnmounted(() => {
    clearActiveTimer()
  })

  return {
    // Состояния (Refs)
    isLoading,
    isSleeping,
    isDialogueActive,
    score,
    totalThrows,
    comboMultiplier,
    special,
    currentNodeId,
    currentNode,
    lastUserChoice,

    // Вычисляемые (Getters)
    accuracy,

    // Методы (Actions)
    setLoading,
    wakeUp,
    startGame,
    addPoints,
    incrementThrows,
    selectOption,
    resetToDialogue
  }
}