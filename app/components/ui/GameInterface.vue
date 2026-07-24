<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useGameplay } from '@/composables/useGameplay'
import { useEventBus } from '@/composables/useEventBus'
import { useCapsManager } from '@/composables/useCapsManager'
import { useCapsSounds } from '@/composables/useCapsSounds'

type Phase = 'choose' | 'selecting' | 'battle'

const gameplay = useGameplay()
const capsManager = useCapsManager()
const capsSounds = useCapsSounds()
const { emit, on } = useEventBus()

const phase = ref<Phase>('choose')
const isBusy = ref(false)
let botThrowTimer: ReturnType<typeof setTimeout> | null = null

const selectedCount = computed(() => gameplay.proposedPlayerCaps.value.length)

const proposedBetValue = computed(() =>
  gameplay.proposedPlayerCaps.value.reduce((sum, id) => {
    return sum + (gameplay.allCaps.value.get(id)?.value || 0)
  }, 0)
)

const betValidation = computed(() =>
  gameplay.checkProposedBetValidity('player', gameplay.proposedPlayerCaps.value)
)

const isPlayerTurn = computed(() => gameplay.currentPlayerId.value === 'player')

const canStart = computed(() => betValidation.value.valid && !isBusy.value)

function clearBotTimer() {
  if (botThrowTimer) {
    clearTimeout(botThrowTimer)
    botThrowTimer = null
  }
}

function enterSelection() {
  if (phase.value !== 'choose' || isBusy.value) return
  capsSounds.unlockMobileAudio()
  gameplay.proposedPlayerCaps.value = []
  phase.value = 'selecting'
  emit('ui:toggle_selection_mode', { active: true })
}

const canQuickStart = computed(() => {
  if (isBusy.value || phase.value !== 'choose') return false
  return gameplay.findQuickStartBet('player') !== null
})

function quickStart() {
  if (phase.value !== 'choose' || isBusy.value) return
  capsSounds.unlockMobileAudio()

  const caps = gameplay.findQuickStartBet('player')
  if (!caps) return

  gameplay.proposedPlayerCaps.value = []
  emit('ui:toggle_selection_mode', { active: false })
  gameplay.createBattleStackWithEqualValue('player', caps)
}

function cancelSelection() {
  if (phase.value !== 'selecting') return
  gameplay.proposedPlayerCaps.value = []
  phase.value = 'choose'
  emit('ui:toggle_selection_mode', { active: false })
}

function startRound() {
  if (!canStart.value) return

  const success = gameplay.createBattleStackWithEqualValue(
    'player',
    [...gameplay.proposedPlayerCaps.value]
  )
  if (!success) return

  emit('ui:toggle_selection_mode', { active: false })
  // phase / бот — через game:battle_stack_created
}

async function requestThrow() {
  if (capsManager.isThrowAnimating.value) return
  isBusy.value = true
  const ok = await capsManager.playThrow(0.5)
  if (!ok) isBusy.value = false
}

function handleThrow() {
  if (phase.value !== 'battle' || !isPlayerTurn.value || isBusy.value) return
  if (gameplay.battleStack.value.length === 0) return
  capsSounds.unlockMobileAudio()
  requestThrow()
}

function scheduleBotThrowIfNeeded() {
  clearBotTimer()

  if (phase.value !== 'battle') return
  if (gameplay.battleStack.value.length === 0) return
  if (gameplay.currentPlayerId.value === 'player') {
    isBusy.value = false
    return
  }

  isBusy.value = true
  botThrowTimer = setTimeout(() => {
    botThrowTimer = null
    if (phase.value !== 'battle') return
    if (gameplay.battleStack.value.length === 0) return
    if (gameplay.currentPlayerId.value === 'player') {
      isBusy.value = false
      return
    }
    requestThrow()
  }, 700)
}

on('game:initialized', () => {
  clearBotTimer()
  isBusy.value = false
  phase.value = 'choose'
  gameplay.proposedPlayerCaps.value = []
  emit('ui:toggle_selection_mode', { active: false })
})

on('game:battle_stack_created', () => {
  phase.value = 'battle'
  scheduleBotThrowIfNeeded()
})

// executeThrow вызывает nextTurn после удара — здесь уже актуальный игрок
on('game:turn_changed', () => {
  scheduleBotThrowIfNeeded()
})

on('game:round_over', () => {
  clearBotTimer()
  isBusy.value = false
  gameplay.proposedPlayerCaps.value = []
  phase.value = 'choose'
})

onUnmounted(() => {
  clearBotTimer()
})
</script>

<template>
  <div class="absolute inset-0 z-50 pointer-events-none flex flex-col justify-center items-center px-4 ui-stage">
    <!-- Выбор фишек: вход в режим -->
    <div v-if="phase === 'choose'" class="pointer-events-auto flex flex-col items-center gap-3">
      <button
        type="button"
        class="game-btn"
        :disabled="isBusy"
        @click="enterSelection"
      >
        Выбрать фишки
      </button>
      <button
        type="button"
        class="game-btn game-btn--ghost"
        :disabled="!canQuickStart"
        @click="quickStart"
      >
        Быстрый старт
      </button>
    </div>

    <!-- Режим выбора -->
    <div v-else-if="phase === 'selecting'" class="pointer-events-auto flex flex-col items-center gap-3">
      <p class="text-sm text-white/70 tracking-wide">
        <template v-if="selectedCount === 0">Выбери фишки для кона</template>
        <template v-else-if="betValidation.valid">
          Ставка {{ proposedBetValue }}★ — можно начинать
        </template>
        <template v-else-if="betValidation.reason === 'opponents_cannot_match'">
          Соперник не может уравнять {{ proposedBetValue }}★
        </template>
        <template v-else>
          Выбрано: {{ selectedCount }} ({{ proposedBetValue }}★)
        </template>
      </p>

      <div class="flex items-center gap-3">
        <button type="button" class="game-btn game-btn--ghost" @click="cancelSelection">
          Назад
        </button>
        <button
          type="button"
          class="game-btn"
          :disabled="!canStart"
          @click="startRound"
        >
          Начать
        </button>
      </div>
    </div>

    <!-- Бой: ход игрока — клик по всему экрану -->
    <button
      v-else-if="isPlayerTurn"
      type="button"
      class="throw-hit-area"
      :disabled="isBusy || capsManager.isThrowAnimating.value || gameplay.battleStack.value.length === 0"
      @click="handleThrow"
    >
      <span class="throw-hint">Кликни чтобы разбить фишки</span>
    </button>

    <!-- Бой: ход бота -->
    <div v-else class="pointer-events-none flex flex-col items-center gap-3">
      <p class="text-sm text-white/70 tracking-wide">
        Бьёт {{ gameplay.currentPlayer.value?.name || 'соперник' }}…
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Чуть выше геометрического центра экрана */
.ui-stage {
  padding-bottom: 18vh;
}

.game-btn {
  min-width: 180px;
  padding: 0.65rem 1.75rem;
  font-size: 1rem;
  letter-spacing: 0.04em;
  color: #fde047;
  border: 1px solid rgba(253, 224, 71, 0.45);
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, opacity 0.2s ease;
}

.game-btn:hover:not(:disabled) {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.5);
}

.game-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.game-btn--ghost {
  min-width: 120px;
  color: rgba(255, 255, 255, 0.75);
  border-color: rgba(255, 255, 255, 0.25);
}

.throw-hit-area {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  cursor: pointer;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 18vh;
}

.throw-hit-area:disabled {
  cursor: default;
  pointer-events: none;
}

.throw-hint {
  font-size: 0.95rem;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.7);
  pointer-events: none;
}

.throw-hit-area:not(:disabled):hover .throw-hint {
  color: #fde047;
}
</style>
