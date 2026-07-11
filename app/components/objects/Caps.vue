<script setup lang="ts">
import { useEventBus } from '@/composables/useEventBus'
import { useCapMaterials } from '@/composables/useCapMaterials'
import { useCapsSounds } from '@/composables/useCapsSounds'
import { useCapsAnimation } from '@/composables/useCapsAnimation'
import type { CapServerConfig } from '@/types/caps'
import { CAPS_CONFIG, createIdleRotationY } from '@/constants/caps'
import { shallowRef, onMounted, onUnmounted } from 'vue'

const { emit } = useEventBus()
const { radius, thickness, getCapMaterials } = useCapMaterials()
const { resumeAudioContext, playFirstHit, playSlamFlat, playDribble } = useCapsSounds()

const fishkiRefs = shallowRef<any[]>([])
const initialRotationY = createIdleRotationY()

const { resetStackToWait, throwCaps, getActiveCapIds, getIsAnimating } = useCapsAnimation({
  fishkiRefs,
  initialRotationY,
  onFirstHit: () => {
    playFirstHit()
    emit('fishka:hit', { force: 1, type: 'floor' })
  },
  onSlamFlat: playSlamFlat,
  onDribble: playDribble,
})

const setFishkaRef = (el: any, index: number) => {
  if (el) fishkiRefs.value[index] = el
}

const generateServerData = (activeCapIds: number[], flipPercentage = 10): CapServerConfig[] => {
  const flipCount = Math.round((activeCapIds.length * flipPercentage) / 100)
  const flippedIds = [...activeCapIds].sort(() => 0.5 - Math.random()).slice(0, flipCount)

  return activeCapIds.map((id, throwStackIndex) => ({
    id,
    throwStackIndex,
    isFlipped: flippedIds.includes(id),
  }))
}

const handleGlobalClick = (event: PointerEvent) => {
  // Проверяем getIsAnimating
  if (getIsAnimating()) return

  // Защита от ложных срабатываний (например, если кликнули правой кнопкой мыши)
  if (event.button !== 0) return 

  const activeCapIds = getActiveCapIds()
  if (activeCapIds.length === 0) return

  resumeAudioContext()
  throwCaps(generateServerData(activeCapIds, 60))
}

onMounted(() => {
  resetStackToWait()
  window.addEventListener('pointerdown', handleGlobalClick)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', handleGlobalClick)
})
</script>

<template>
  <TresMesh
    v-for="n in CAPS_CONFIG.TOTAL"
    :key="n"
    :ref="(el) => setFishkaRef(el, n - 1)"
    :material="getCapMaterials(n)"
    cast-shadow
  >
    <TresCylinderGeometry :args="[radius, radius, thickness, 32]" />
  </TresMesh>
</template>
