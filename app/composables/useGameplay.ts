import { ref, computed } from 'vue'
import { useEventBus } from '@/composables/useEventBus' // Твоя шина событий

export type ParticipantId = 'player' | 'stas' | 'vova'

export interface CapModel {
  id: number
  value: number
  isRare: boolean
  textureId: string
  owner: ParticipantId | 'table'
}

export interface GameParticipant {
  id: ParticipantId
  name: string
  caps: number[]
}

export interface ThrowPlan {
  throwerId: ParticipantId
  flippedIds: number[]
  remainingIds: number[]
  isRoundOver: boolean
}

// --- ЕДИНЫЕ ГЛОБАЛЬНЫЕ СОСТОЯНИЯ СЕССИИ ---
const allCaps = ref<Map<number, CapModel>>(new Map())
const participants = ref<Map<ParticipantId, GameParticipant>>(new Map())
const turnOrder = ref<ParticipantId[]>([])
const currentTurnIndex = ref(0)
const battleStack = ref<number[]>([])
const roundsPlayed = ref(0)

// ДОБАВЛЕНО: Глобальный реф для выбранных фишек Игрока
const proposedPlayerCaps = ref<number[]>([])

export function useGameplay() {
  const { emit } = useEventBus()

  const currentPlayerId = computed(() => turnOrder.value[currentTurnIndex.value] || null)
  const currentPlayer = computed(() => currentPlayerId.value ? participants.value.get(currentPlayerId.value) : null)
  const battleStackValue = computed(() => {
    return battleStack.value.reduce((sum, id) => sum + (allCaps.value.get(id)?.value || 0), 0)
  })

  const allCapsList = computed(() => Array.from(allCaps.value.values()))
  const participantsList = computed(() => Array.from(participants.value.values()))

  function initGame(
    playersList: { 
      id: ParticipantId; 
      name: string; 
      initialCapsCount: number; 
      specificCapIds?: number[] 
    }[]
  ) {
    allCaps.value.clear()
    participants.value.clear()
    battleStack.value = []
    turnOrder.value = playersList.map(p => p.id)
    currentTurnIndex.value = 0
    roundsPlayed.value = 0
    
    // ДОБАВЛЕНО: Сбрасываем выбор при старте новой игры
    proposedPlayerCaps.value = []

    playersList.forEach(p => {
      participants.value.set(p.id, {
        id: p.id,
        name: p.name,
        caps: []
      })
    })

    let autoIdCounter = 0

    function getNextUniqueId(): number {
      while (allCaps.value.has(autoIdCounter)) {
        autoIdCounter++
      }
      return autoIdCounter++
    }

    playersList.forEach(p => {
      const isPlayer = p.id === 'player'
      const participantStore = participants.value.get(p.id)!
      const explicitIds = p.specificCapIds || []
      
      explicitIds.forEach((id, index) => {
        if (allCaps.value.has(id)) {
          console.warn(`Фишка с ID ${id} уже существует! Пропускаем дубликат для игрока ${p.id}.`)
          return
        }

        const isRare = index !== 0 && index % 4 === 0 

        const cap: CapModel = {
          id,
          value: isRare ? 2 : 1,
          isRare,
          textureId: isPlayer ? `player-explicit-${id}` : `opponent-explicit-${id}`,
          owner: p.id
        }

        allCaps.value.set(id, cap)
        participantStore.caps.push(id)
      })

      const currentCount = participantStore.caps.length
      const neededCount = p.initialCapsCount - currentCount

      for (let i = 0; i < neededCount; i++) {
        const id = getNextUniqueId()
        const isRare = (currentCount + i) !== 0 && (currentCount + i) % 4 === 0

        const cap: CapModel = {
          id,
          value: isRare ? 2 : 1,
          isRare,
          textureId: isPlayer ? `player-auto-${id}` : `opponent-auto-${id}`,
          owner: p.id
        }

        allCaps.value.set(id, cap)
        participantStore.caps.push(id)
      }
    })

    emit('game:initialized', {
      participants: participantsList.value,
      allCaps: allCapsList.value
    })
  }

  function getParticipantBankValue(participantId: ParticipantId): number {
    const p = participants.value.get(participantId)
    if (!p) return 0
    return p.caps.reduce((sum, id) => sum + (allCaps.value.get(id)?.value || 0), 0)
  }

  // ========================================================
  // АЛГОРИТМИЧЕСКОЕ ЯДРО (ПОДБОР СТАВКИ)
  // ========================================================

  function findExactCombination(
    availableCapIds: number[],
    targetValue: number,
    options?: { preferCheap?: boolean; minCount?: number }
  ): number[] | null {
    const caps = availableCapIds
      .map(id => allCaps.value.get(id))
      .filter((cap): cap is CapModel => Boolean(cap))
    const result: number[] = []
    const minCount = options?.minCount ?? 0

    function backtrack(index: number, currentSum: number, currentSet: number[]): boolean {
      if (currentSum === targetValue) {
        // Короткие наборы отклоняем и ищем комбинацию подлиннее
        if (currentSet.length < minCount) return false
        result.push(...currentSet)
        return true
      }
      if (currentSum > targetValue || index >= caps.length) {
        return false
      }
      if (minCount > 0 && currentSet.length + (caps.length - index) < minCount) {
        return false
      }

      const cap = caps[index]!
      if (backtrack(index + 1, currentSum + cap.value, [...currentSet, cap.id])) {
        return true
      }
      if (backtrack(index + 1, currentSum, currentSet)) {
        return true
      }

      return false
    }

    if (options?.preferCheap) {
      caps.sort((a, b) => a.value - b.value || a.id - b.id)
    } else {
      caps.sort((a, b) => b.value - a.value || a.id - b.id)
    }

    if (backtrack(0, 0, [])) {
      return result
    }
    return null
  }

  /**
   * Автоподбор ставки: стремимся к ≥5 самым дешёвым фишкам.
   * Если 5 нельзя — пробуем 4, 3, 2, 1 (никогда не прыгаем сразу к 1, пока возможно больше).
   */
  function findQuickStartBet(initiatorId: ParticipantId): number[] | null {
    const initiator = participants.value.get(initiatorId)
    if (!initiator || initiator.caps.length === 0) return null

    const playerMax = getParticipantBankValue(initiatorId)
    let opponentMin = Infinity
    for (const [pId] of participants.value.entries()) {
      if (pId === initiatorId) continue
      opponentMin = Math.min(opponentMin, getParticipantBankValue(pId))
    }

    const maxBet = Math.min(playerMax, opponentMin)
    if (!Number.isFinite(maxBet) || maxBet <= 0) return null

    const QUICK_START_TARGET_CAPS = 5
    const maxCount = Math.min(QUICK_START_TARGET_CAPS, initiator.caps.length)

    for (let minCount = maxCount; minCount >= 1; minCount--) {
      for (let target = 1; target <= maxBet; target++) {
        if (!canOpponentsMatchValue(initiatorId, target)) continue

        const playerSet = findExactCombination(initiator.caps, target, {
          preferCheap: true,
          minCount,
        })
        if (playerSet && playerSet.length >= minCount) {
          return playerSet
        }
      }
    }

    return null
  }

  function canOpponentsMatchValue(initiatorId: ParticipantId, targetValue: number): boolean {
    if (targetValue <= 0) return false

    for (const [pId, participant] of participants.value.entries()) {
      if (pId === initiatorId) continue
      
      const foundSet = findExactCombination(participant.caps, targetValue)
      if (!foundSet) {
        return false
      }
    }
    return true
  }

  function checkProposedBetValidity(initiatorId: ParticipantId, selectedCapIds: number[]): { 
    valid: boolean; 
    reason?: 'empty' | 'not_owned' | 'opponents_cannot_match' | 'ok' 
  } {
    if (selectedCapIds.length === 0) {
      return { valid: false, reason: 'empty' }
    }

    const initiator = participants.value.get(initiatorId)
    if (!initiator) return { valid: false, reason: 'not_owned' }

    const ownsAll = selectedCapIds.every(id => initiator.caps.includes(id))
    if (!ownsAll) return { valid: false, reason: 'not_owned' }

    const targetValue = selectedCapIds.reduce((sum, id) => sum + (allCaps.value.get(id)?.value || 0), 0)

    const possible = canOpponentsMatchValue(initiatorId, targetValue)
    if (!possible) {
      return { valid: false, reason: 'opponents_cannot_match' }
    }

    return { valid: true, reason: 'ok' }
  }

  function createBattleStackWithEqualValue(initiatorId: ParticipantId, initiatorCapIds: number[]): boolean {
    const validation = checkProposedBetValidity(initiatorId, initiatorCapIds)
    if (!validation.valid) {
      return false
    }

    const targetValue = initiatorCapIds.reduce((sum, id) => sum + (allCaps.value.get(id)?.value || 0), 0)

    battleStack.value = []
    const proposedTransfers = new Map<ParticipantId, number[]>()
    
    proposedTransfers.set(initiatorId, [...initiatorCapIds])

    for (const [pId, participant] of participants.value.entries()) {
      if (pId === initiatorId) continue
      
      const exactSet = findExactCombination(participant.caps, targetValue)
      if (!exactSet) return false 
      
      proposedTransfers.set(pId, exactSet)
    }

    const transfersLog: Array<{ participantId: ParticipantId; capIds: number[] }> = []

    proposedTransfers.forEach((capIds, pId) => {
      const participant = participants.value.get(pId)!
      transfersLog.push({ participantId: pId, capIds: [...capIds] })

      capIds.forEach(id => {
        participant.caps = participant.caps.filter(cId => cId !== id)
        const cap = allCaps.value.get(id)!
        cap.owner = 'table'
        battleStack.value.push(id)
      })
    })

    // ДОБАВЛЕНО: Очищаем выбранные фишки, так как они успешно улетели в стопку на стол
    if (initiatorId === 'player') {
      proposedPlayerCaps.value = []
    }

    emit('game:battle_stack_created', {
      battleStack: [...battleStack.value],
      totalValue: targetValue * participants.value.size,
      transfers: transfersLog
    })

    return true
  }

  function transferCap(capId: number, toOwnerId: ParticipantId | 'table'): boolean {
    const cap = allCaps.value.get(capId)
    if (!cap) {
      console.warn(`Фишка с ID ${capId} не найдена в базе данных сессии.`)
      return false
    }

    const fromOwnerId = cap.owner
    if (fromOwnerId === toOwnerId) return true

    if (fromOwnerId !== 'table') {
      const previousOwner = participants.value.get(fromOwnerId)
      if (previousOwner) {
        previousOwner.caps = previousOwner.caps.filter(id => id !== capId)
      }
    } else {
      battleStack.value = battleStack.value.filter(id => id !== capId)
    }

    cap.owner = toOwnerId

    if (toOwnerId !== 'table') {
      const newOwner = participants.value.get(toOwnerId)
      if (newOwner) {
        newOwner.caps.push(capId)
      }
    } else {
      battleStack.value.push(capId)
    }

    emit('game:caps_transferred', {
      capId,
      from: fromOwnerId,
      to: toOwnerId
    })

    return true
  }

  // ========================================================
  // ИГРОВОЙ ЦИКЛ
  // ========================================================

  /** Считает исход удара без изменения стейта (для анимации) */
  function resolveThrow(flipChance = 0.5): ThrowPlan | null {
    const activePlayerId = currentPlayerId.value
    if (!activePlayerId || battleStack.value.length === 0) {
      return null
    }

    const flippedIds: number[] = []
    const remainingIds: number[] = []

    battleStack.value.forEach(id => {
      if (Math.random() < flipChance) {
        flippedIds.push(id)
      } else {
        remainingIds.push(id)
      }
    })

    return {
      throwerId: activePlayerId,
      flippedIds,
      remainingIds,
      isRoundOver: remainingIds.length === 0
    }
  }

  /** Применяет заранее посчитанный исход удара и шлёт события */
  function applyThrow(plan: ThrowPlan) {
    const { throwerId, flippedIds, remainingIds, isRoundOver } = plan

    flippedIds.forEach(id => {
      const cap = allCaps.value.get(id)
      if (!cap) return
      cap.owner = throwerId
      participants.value.get(throwerId)?.caps.push(id)
    })

    battleStack.value = [...remainingIds]

    emit('game:throw_executed', {
      throwerId,
      flippedIds: [...flippedIds],
      remainingIds: [...remainingIds],
      isRoundOver
    })

    if (!isRoundOver) {
      nextTurn()
    } else {
      roundsPlayed.value++
      emit('game:round_over', {
        roundsPlayed: roundsPlayed.value
      })
    }
  }

  function executeThrow(flipChance = 0.5) {
    const plan = resolveThrow(flipChance)
    if (!plan) {
      return { flippedIds: [], remainingIds: [], activePlayerId: currentPlayerId.value, isRoundOver: false }
    }

    applyThrow(plan)

    return {
      flippedIds: plan.flippedIds,
      remainingIds: plan.remainingIds,
      activePlayerId: plan.throwerId,
      isRoundOver: plan.isRoundOver
    }
  }

  function nextTurn() {
    if (turnOrder.value.length === 0) return
    currentTurnIndex.value = (currentTurnIndex.value + 1) % turnOrder.value.length

    emit('game:turn_changed', {
      nextPlayerId: currentPlayerId.value
    })
  }

  return {
    allCaps,
    participants,
    battleStack,
    turnOrder,
    currentPlayerId,
    currentPlayer,
    battleStackValue,
    roundsPlayed,
    allCapsList,
    participantsList,
    
    // ДОБАВЛЕНО: Экспортируем реф выбора
    proposedPlayerCaps,

    initGame,
    getParticipantBankValue,
    checkProposedBetValidity,
    findQuickStartBet,
    createBattleStackWithEqualValue,
    resolveThrow,
    applyThrow,
    executeThrow,
    nextTurn,
    transferCap
  }
}