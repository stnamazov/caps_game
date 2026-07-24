import { onUnmounted } from 'vue'
import mitt from 'mitt'

// Импортируем типы из геймплейного движка (укажи правильный путь к файлу)
import type { ParticipantId, CapModel, GameParticipant } from '@/composables/useGameplay'

// 1. Единый типизированный контракт всей игры
type ApplicationEvents = {

  // Смена положения и взгляда камеры
  'camera:move': { 
    position?: { x: number; y: number; z: number }
    lookAt?: { x: number; y: number; z: number }
    preset?: 'WELCOME' | 'DIALOGUE' | 'PLAYING' | 'TAKE'
  }

  'camera:action': { 
    type: 'SHAKE';
    intensity?: number
  }
  
  'camera:toggle_features': { 
    autopilot?: boolean; 
    dynamics?: boolean
  }

  // Игра создана, фишки инициализированы на руках игроков
  'game:initialized': {
    participants: GameParticipant[]
    allCaps: CapModel[]
  }

  // Одиночная фишка сменила владельца напрямую (обмен, подарок)
  'game:caps_transferred': {
    capId: number
    from: ParticipantId | 'table'
    to: ParticipantId | 'table'
  }

  // Ставки сделаны, фишки сформировали общую стопку на кону
  'game:battle_stack_created': {
    battleStack: number[]
    totalValue: number
    transfers: Array<{ participantId: ParticipantId; capIds: number[] }>
  }

  // Совершен бросок/удар по стопке
  'game:throw_executed': {
    throwerId: ParticipantId
    flippedIds: number[]
    remainingIds: number[]
    isRoundOver: boolean
  }

  // Ход передан следующему игроку
  'game:turn_changed': {
    nextPlayerId: ParticipantId | null
  }

  // Кон полностью сыгран (на столе не осталось фишек)
  'game:round_over': {
    roundsPlayed: number
  }
  
  // Базовые события сцены и UI
  'fishka:click': { id: number; timestamp: number }
  'fishka:hit': { force: number; type: 'floor' | 'fishka' }
  'character:animation': void

  // Режим выбора фишек (веер перед камерой)
  'ui:toggle_selection_mode': { active: boolean }

  'ui:toast': {
    title: string
    text: string
    icon?: string
    duration?: number
  }
  
}

const emitter = mitt<ApplicationEvents>()

// Лог всех событий шины (один раз на модуль)
emitter.on('*', (type, payload) => {
  console.log(`[event] ${String(type)}`, payload)
})

export function useEventBus() {
  
  function emit<K extends keyof ApplicationEvents>(event: K, payload: ApplicationEvents[K]) {
    emitter.emit(event, payload)
  }

  function on<K extends keyof ApplicationEvents>(
    event: K | '*', 
    callback: (payload: any) => void
  ) {
    // @ts-ignore (mitt внутри отлично поддерживает '*', но TS может ворчать на пересечение типов)
    emitter.on(event, callback)
  
    onUnmounted(() => {
      // @ts-ignore
      emitter.off(event, callback)
    })
  }

  function off<K extends keyof ApplicationEvents>(event: K, callback: (payload: ApplicationEvents[K]) => void) {
    emitter.off(event, callback)
  }

  return {
    emit,
    on,
    off
  }
}