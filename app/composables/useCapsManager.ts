import { ref, watch, type ShallowRef } from 'vue'
import { useGameplay, type ParticipantId, type ThrowPlan } from '@/composables/useGameplay'
import { useEventBus } from '@/composables/useEventBus'
import { useCapsSounds } from '@/composables/useCapsSounds'
import gsap from 'gsap'
import * as THREE from 'three'

interface ThrowSoundCallbacks {
  onFirstHit?: () => void
  onSlamFlat?: () => void
  onDribble?: () => void
}

export interface VisualCapState {
  id: number
  value: number
  isRare: boolean
  targetPosition: THREE.Vector3
  targetRotation: THREE.Euler
  currentPosition: THREE.Vector3
  currentRotation: THREE.Euler
}

const CAPS_CONFIG = {
  INITIAL_Y: 1.5,
  FLOOR_Y: 0.025,
  RADIUS: 0.45,
  THICKNESS: 0.085,
  IDLE_TILT_DEG: 1,
  GROUP_TILT_DEG: 12,
  COLLECTED_PLANE_JITTER: 0.08,
  // Покачивание стопки в ожидании клика игрока
  WAIT_BOB: {
    AMPLITUDE: 0.1,
    SPEED: 2.4,
  },
  THROW_ANIMATION: {
    AIM_DROP: 0.5,
    AIM_DURATION: 0.14,
    WINDUP_LIFT: 0.5,
    WINDUP_DURATION: 0.12,
    SLAM_DURATION: 0.07,
    BOUNCE_DELAY: 0.03,
  },
  RETURN_ANIMATION: {
    THROW_STACK_STAGGER: 0.07,
    THROW_STACK_LIFT_MIN: 0.35,
    THROW_STACK_LIFT_MAX: 0.65,
    THROW_STACK_SPREAD: 0.55,
    THROW_STACK_LIFT_DURATION_MIN: 0.35,
    THROW_STACK_LIFT_DURATION_MAX: 0.5,
    THROW_STACK_SETTLE_DURATION_MIN: 0.55,
    THROW_STACK_SETTLE_DURATION_MAX: 0.75,
    // Пауза между стартом полёта каждой выбитой фишки в банк
    COLLECTED_STAGGER: 0.22,
    COLLECTED_ARC_HEIGHT_MIN: 0.5,
    COLLECTED_ARC_HEIGHT_MAX: 0.9,
    COLLECTED_APPROACH_OFFSET: 0.3,
    COLLECTED_LIFT_DURATION_MIN: 0.4,
    COLLECTED_LIFT_DURATION_MAX: 0.55,
    COLLECTED_DROP_DURATION_MIN: 0.45,
    COLLECTED_DROP_DURATION_MAX: 0.6,
    POST_SCATTER_DELAY: 0.55,
  },
} as const

interface CapTrajectory {
  capId: number
  throwStackIndex: number
  isFlipped: boolean
  startY: number
  randomTargetX: number
  randomTargetZ: number
  landY: number
  bounceHeightDelta: number
  maxBounceHeight: number
  timeUp: number
  timeDown: number
  totalFlyTime: number
  finalAirRotationX: number
  finalTouchY: number
  finalTargetXRot: number
  thisFinalSlamTime: number
  thisBounceDribbleTime: number
  isFirstCap: boolean
  idleRotationY: number
}

interface PlacedCap {
  x: number
  z: number
  finalY: number
  bounceDelta: number
}

interface ThrowTiming {
  aimEndTime: number
  windupEndTime: number
  startTiltSlamTime: number
  bounceStartTime: number
}

// --- Синглтон-состояние (общий для UI и сцены) ---
const visualCaps = ref<Map<number, VisualCapState>>(new Map())
const isSelectionMode = ref(false)
const scrollOffset = ref(0)
const isThrowAnimating = ref(false)
/** Тик для принудительного ре-рендера Tres при императивных мутациях позиций */
const animFrame = ref(0)
/** Фаза покачивания стопки в ожидании удара игрока */
let waitBobTime = 0

let activeCamera: ShallowRef<THREE.PerspectiveCamera | null> | { value: THREE.PerspectiveCamera | null } | null = null
let activeThrowTimeline: gsap.core.Timeline | null = null

const STACK_POSITIONS = {
  playerBank: new THREE.Vector3(1, 0, 2),
  botBank: new THREE.Vector3(0, 0, -3),
  battleStack: new THREE.Vector3(0, 0, 0)
}

const FAN_RELATIVE_CONFIG = {
  distance: 6,
  heightOffset: 0,
  desiredSpacing: 0.5,
  minRadiusX: 1.8,
  fixedRadiusZ: 1.3,
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randomSignedRange(max: number) {
  return (Math.random() - 0.5) * 2 * max
}

function getDeterministicNoise(id: number, seed: number = 1) {
  const x = Math.sin(id * 12.9898 + seed) * 43758.5453
  return x - Math.floor(x)
}

function createThrowTiming(): ThrowTiming {
  const config = CAPS_CONFIG.THROW_ANIMATION
  const aimEndTime = config.AIM_DURATION
  const windupEndTime = aimEndTime + config.WINDUP_DURATION
  const startTiltSlamTime = windupEndTime + config.SLAM_DURATION
  const bounceStartTime = startTiltSlamTime + config.BOUNCE_DELAY
  return { aimEndTime, windupEndTime, startTiltSlamTime, bounceStartTime }
}

function calculateCapRotation(isFlipped: boolean, forceLowRotation: boolean) {
  if (forceLowRotation) {
    return isFlipped ? 180 : 0
  }
  if (isFlipped) {
    return Math.random() > 0.5 ? 180 : 540
  }
  return Math.random() > 0.4 ? 360 : (15 + Math.random() * 20)
}

function generateCapTrajectory(
  capId: number,
  throwStackIndex: number,
  isFlipped: boolean,
  placedCaps: PlacedCap[],
  bounceStartTime: number,
  origin: THREE.Vector3,
): CapTrajectory {
  const stackOffsetY = throwStackIndex * CAPS_CONFIG.THICKNESS
  const startY = CAPS_CONFIG.INITIAL_Y + stackOffsetY
  const minDistance = CAPS_CONFIG.RADIUS * 2

  const scatterForce = 0.6 + throwStackIndex * 0.15
  const randomTargetX = origin.x + randomSignedRange(scatterForce)
  const randomTargetZ = origin.z + randomSignedRange(scatterForce)

  let landY = CAPS_CONFIG.FLOOR_Y
  placedCaps.forEach((other) => {
    const dx = randomTargetX - other.x
    const dz = randomTargetZ - other.z
    const distance = Math.sqrt(dx * dx + dz * dz)
    if (distance < minDistance && other.finalY >= landY) {
      landY = other.finalY + CAPS_CONFIG.THICKNESS
    }
  })

  let bounceHeightDelta = 0.6 + Math.random() * 1.2
  let forceLowRotation = false

  placedCaps.forEach((other) => {
    const dx = randomTargetX - other.x
    const dz = randomTargetZ - other.z
    const airDistance = Math.sqrt(dx * dx + dz * dz)
    if (airDistance < minDistance * 1.4) {
      const heightDifference = Math.abs((landY + bounceHeightDelta) - (other.finalY + other.bounceDelta))
      if (heightDifference < CAPS_CONFIG.RADIUS) {
        bounceHeightDelta += 0.55
        if (airDistance < minDistance * 0.9) {
          forceLowRotation = true
        }
      }
    }
  })

  const totalRotationDeg = calculateCapRotation(isFlipped, forceLowRotation)
  const finalAirRotationX = totalRotationDeg * Math.PI / 180
  const finalTouchY = landY + CAPS_CONFIG.RADIUS * Math.abs(Math.sin(finalAirRotationX))
  const finalTargetXRot = Math.round(finalAirRotationX / Math.PI) * Math.PI

  const timeUp = 0.2 + bounceHeightDelta * 0.12
  const timeDown = timeUp * 0.75
  const totalFlyTime = timeUp + timeDown
  const thisFinalSlamTime = bounceStartTime + totalFlyTime
  const thisBounceDribbleTime = thisFinalSlamTime + 0.05

  return {
    capId,
    throwStackIndex,
    isFlipped,
    startY,
    randomTargetX,
    randomTargetZ,
    landY,
    bounceHeightDelta,
    maxBounceHeight: landY + bounceHeightDelta,
    timeUp,
    timeDown,
    totalFlyTime,
    finalAirRotationX,
    finalTouchY,
    finalTargetXRot,
    thisFinalSlamTime,
    thisBounceDribbleTime,
    isFirstCap: throwStackIndex === 0,
    idleRotationY: (getDeterministicNoise(capId, 17.3) - 0.5) * 1.2,
  }
}

function getCollectedStackPosition(throwerId: ParticipantId, slot: number) {
  const base = throwerId === 'player' ? STACK_POSITIONS.playerBank : STACK_POSITIONS.botBank
  const jitter = CAPS_CONFIG.COLLECTED_PLANE_JITTER
  return {
    x: base.x + randomSignedRange(jitter),
    y: base.y + slot * CAPS_CONFIG.THICKNESS,
    z: base.z + randomSignedRange(jitter),
  }
}

/** Финальный угол в банке — тот же, что потом поставит updateTargets */
function getCollectedStackRotation(throwerId: ParticipantId, slot: number, capId: number) {
  const isPlayer = throwerId === 'player'
  const noiseTiltX = (getDeterministicNoise(capId, isPlayer ? 8.4 : 13.4) - 0.5) * 0.04
  const noiseTiltZ = (getDeterministicNoise(capId, isPlayer ? 9.5 : 14.5) - 0.5) * 0.04
  const noiseRotY = (getDeterministicNoise(capId, isPlayer ? 7.3 : 12.3) - 0.5) * 0.5
  const yaw = isPlayer ? slot * 0.1 + noiseRotY : slot * -0.08 + noiseRotY
  return { x: noiseTiltX, y: yaw, z: noiseTiltZ }
}

/** Кратчайший путь по X, чтобы доворот в полёте был на ~π, а не на 3π */
function shortestEulerX(current: number, target: number) {
  let x = current
  while (x - target > Math.PI) x -= Math.PI * 2
  while (target - x > Math.PI) x += Math.PI * 2
  return x
}

function appendThrowStackReturn(
  timeline: gsap.core.Timeline,
  cap: VisualCapState,
  throwStackIndex: number,
  startTime: number,
  idleRotationY: number,
  targetTiltZ: number,
  origin: THREE.Vector3,
) {
  const config = CAPS_CONFIG.RETURN_ANIMATION
  const targetY = CAPS_CONFIG.INITIAL_Y + throwStackIndex * CAPS_CONFIG.THICKNESS
  const arcHeight = randomRange(config.THROW_STACK_LIFT_MIN, config.THROW_STACK_LIFT_MAX)
  const spreadX = origin.x + randomSignedRange(config.THROW_STACK_SPREAD)
  const spreadZ = origin.z + randomSignedRange(config.THROW_STACK_SPREAD)
  const liftDuration = randomRange(config.THROW_STACK_LIFT_DURATION_MIN, config.THROW_STACK_LIFT_DURATION_MAX)
  const settleDuration = randomRange(config.THROW_STACK_SETTLE_DURATION_MIN, config.THROW_STACK_SETTLE_DURATION_MAX)
  const liftY = Math.max(cap.currentPosition.y, targetY) + arcHeight

  timeline.to(
    cap.currentPosition,
    { x: spreadX, y: liftY, z: spreadZ, duration: liftDuration, ease: 'power2.out' },
    startTime,
  )
  timeline.to(
    cap.currentRotation,
    { x: 0, y: idleRotationY, z: targetTiltZ, duration: liftDuration, ease: 'power2.out' },
    startTime,
  )
  timeline.to(
    cap.currentPosition,
    { x: origin.x, y: targetY, z: origin.z, duration: settleDuration, ease: 'power2.inOut' },
    startTime + liftDuration * 0.8,
  )
}

function appendCollectedStackReturn(
  timeline: gsap.core.Timeline,
  cap: VisualCapState,
  target: { x: number; y: number; z: number },
  targetRotation: { x: number; y: number; z: number },
  startTime: number,
) {
  const config = CAPS_CONFIG.RETURN_ANIMATION
  const arcHeight = randomRange(config.COLLECTED_ARC_HEIGHT_MIN, config.COLLECTED_ARC_HEIGHT_MAX)
  const approachOffsetX = randomSignedRange(config.COLLECTED_APPROACH_OFFSET)
  const approachOffsetZ = randomSignedRange(config.COLLECTED_APPROACH_OFFSET)
  const liftDuration = randomRange(config.COLLECTED_LIFT_DURATION_MIN, config.COLLECTED_LIFT_DURATION_MAX)
  const dropDuration = randomRange(config.COLLECTED_DROP_DURATION_MIN, config.COLLECTED_DROP_DURATION_MAX)
  const peakY = Math.max(cap.currentPosition.y, target.y) + arcHeight
  const dropStart = startTime + liftDuration
  const landTime = dropStart + dropDuration
  const flipDuration = liftDuration + dropDuration

  // Стартуем с выбитой стороны и доворачиваем к ориентации банка уже в полёте
  cap.currentRotation.x = shortestEulerX(cap.currentRotation.x, targetRotation.x)

  timeline.to(
    cap.currentPosition,
    {
      x: target.x + approachOffsetX,
      y: peakY,
      z: target.z + approachOffsetZ,
      duration: liftDuration,
      ease: 'power1.out',
    },
    startTime,
  )
  timeline.to(
    cap.currentPosition,
    { x: target.x, y: target.y, z: target.z, duration: dropDuration, ease: 'power2.in' },
    dropStart,
  )
  timeline.to(
    cap.currentPosition,
    { y: target.y + 0.02, duration: 0.06, ease: 'power1.out' },
    landTime,
  )
  timeline.to(
    cap.currentPosition,
    { y: target.y, duration: 0.1, ease: 'bounce.out' },
    landTime + 0.06,
  )
  timeline.to(
    cap.currentRotation,
    {
      x: targetRotation.x,
      y: targetRotation.y,
      z: targetRotation.z,
      duration: flipDuration,
      ease: 'power2.inOut',
    },
    startTime,
  )
}

function appendCapTrajectoryToTimeline(
  timeline: gsap.core.Timeline,
  cap: VisualCapState,
  trajectory: CapTrajectory,
  timing: ThrowTiming,
  groupTiltZ: number,
  firstTouchY: number,
  origin: THREE.Vector3,
  sounds: ThrowSoundCallbacks = {},
) {
  const stackOffsetY = trajectory.throwStackIndex * CAPS_CONFIG.THICKNESS
  const initialLandY = CAPS_CONFIG.FLOOR_Y + stackOffsetY
  const throwConfig = CAPS_CONFIG.THROW_ANIMATION
  const aimY = trajectory.startY - throwConfig.AIM_DROP
  const windupY = trajectory.startY + throwConfig.WINDUP_LIFT
  const floorTouchY = firstTouchY + stackOffsetY

  timeline.set(cap.currentPosition, {
    x: origin.x,
    y: trajectory.startY,
    z: origin.z,
  }, 0)
  timeline.set(cap.currentRotation, {
    x: 0,
    y: trajectory.idleRotationY,
    z: groupTiltZ,
  }, 0)

  timeline.to(
    cap.currentPosition,
    { y: aimY, duration: throwConfig.AIM_DURATION, ease: 'power1.inOut' },
    0,
  )
  timeline.to(
    cap.currentPosition,
    { y: windupY, duration: throwConfig.WINDUP_DURATION, ease: 'power2.out' },
    timing.aimEndTime,
  )
  timeline.to(
    cap.currentPosition,
    { y: floorTouchY, duration: throwConfig.SLAM_DURATION, ease: 'power4.in' },
    timing.windupEndTime,
  )

  if (trajectory.isFirstCap && sounds.onFirstHit) {
    timeline.call(sounds.onFirstHit, undefined, timing.startTiltSlamTime)
  }

  timeline.to(cap.currentPosition, { y: initialLandY, duration: 0.03, ease: 'power1.out' }, timing.startTiltSlamTime)
  timeline.to(cap.currentRotation, { z: 0, duration: 0.03, ease: 'power1.out' }, timing.startTiltSlamTime)

  timeline.to(
    cap.currentPosition,
    { y: trajectory.maxBounceHeight, duration: trajectory.timeUp, ease: 'power1.out' },
    timing.bounceStartTime,
  )
  timeline.to(
    cap.currentPosition,
    { y: trajectory.finalTouchY, duration: trajectory.timeDown, ease: 'power2.in' },
    timing.bounceStartTime + trajectory.timeUp,
  )
  timeline.to(
    cap.currentPosition,
    { x: trajectory.randomTargetX, z: trajectory.randomTargetZ, duration: trajectory.totalFlyTime, ease: 'none' },
    timing.bounceStartTime,
  )
  timeline.to(
    cap.currentRotation,
    { x: trajectory.finalAirRotationX, duration: trajectory.totalFlyTime, ease: 'none' },
    timing.bounceStartTime,
  )

  timeline.to(
    cap.currentPosition,
    { y: trajectory.landY, duration: 0.05, ease: 'power2.out' },
    trajectory.thisFinalSlamTime,
  )
  timeline.to(
    cap.currentRotation,
    { x: trajectory.finalTargetXRot, duration: 0.05, ease: 'power2.out' },
    trajectory.thisFinalSlamTime,
  )

  if (sounds.onSlamFlat) {
    timeline.call(sounds.onSlamFlat, undefined, trajectory.thisFinalSlamTime)
  }

  timeline.to(
    cap.currentPosition,
    { y: trajectory.landY + 0.04, duration: 0.05, ease: 'power1.out' },
    trajectory.thisBounceDribbleTime,
  )
  timeline.to(
    cap.currentPosition,
    { y: trajectory.landY, duration: 0.08, ease: 'bounce.out' },
    trajectory.thisBounceDribbleTime + 0.05,
  )

  if (sounds.onDribble) {
    timeline.call(sounds.onDribble, undefined, trajectory.thisBounceDribbleTime)
  }
}

let watchersReady = false

export function useCapsManager(
  cameraRef?: ShallowRef<THREE.PerspectiveCamera | null> | { value: THREE.PerspectiveCamera | null }
) {
  const gameplay = useGameplay()
  const { emit } = useEventBus()
  const sounds = useCapsSounds()

  if (cameraRef) {
    activeCamera = cameraRef
  }

  function syncVisualToCurrent() {
    visualCaps.value.forEach((cap) => {
      cap.targetPosition.copy(cap.currentPosition)
      cap.targetRotation.copy(cap.currentRotation)
    })
  }

  function killThrowAnimation() {
    if (activeThrowTimeline) {
      activeThrowTimeline.kill()
      activeThrowTimeline = null
    }
    visualCaps.value.forEach((cap) => {
      gsap.killTweensOf(cap.currentPosition)
      gsap.killTweensOf(cap.currentRotation)
    })
  }

  function syncWithGameplay() {
    if (isThrowAnimating.value) return

    const allCapsMap = gameplay.allCaps.value
    for (const id of visualCaps.value.keys()) {
      if (!allCapsMap.has(id)) visualCaps.value.delete(id)
    }
    allCapsMap.forEach((cap, id) => {
      if (!visualCaps.value.has(id)) {
        visualCaps.value.set(id, {
          id,
          value: cap.value,
          isRare: !!cap.isRare,
          targetPosition: new THREE.Vector3(),
          targetRotation: new THREE.Euler(0, 0, 0),
          currentPosition: new THREE.Vector3(0, 10, 0),
          currentRotation: new THREE.Euler(0, 0, 0)
        })
      }
    })
    updateTargets()
  }

  function updateTargets() {
    if (isThrowAnimating.value) return

    const player = gameplay.participants.value.get('player')
    const bot = gameplay.participants.value.get('stas')
    const battleStack = gameplay.battleStack.value
    const camera = activeCamera?.value

    if (player) {
      const selectedIds = gameplay.proposedPlayerCaps?.value || []
      const carouselCaps = player.caps.filter(id => !selectedIds.includes(id))
      const totalCarouselCaps = carouselCaps.length

      let camPos = new THREE.Vector3()
      let camDir = new THREE.Vector3()
      let camRight = new THREE.Vector3()
      let camUp = new THREE.Vector3()

      if (isSelectionMode.value && camera) {
        camera.updateMatrixWorld()
        camPos.setFromMatrixPosition(camera.matrixWorld)
        camera.getWorldDirection(camDir)
        camUp.copy(camera.up).normalize()
        camRight.crossVectors(camDir, camUp).normalize()
      }

      if (isSelectionMode.value && camera) {
        let closestIndexInCarousel = 0
        let minAngleDist = Infinity
        const baseAngleStep = totalCarouselCaps > 0 ? (2 * Math.PI) / totalCarouselCaps : 0

        carouselCaps.forEach((capId, index) => {
          const rawAngle = (index - scrollOffset.value) * baseAngleStep
          let angle = ((rawAngle + Math.PI) % (2 * Math.PI))
          if (angle < 0) angle += 2 * Math.PI
          angle -= Math.PI

          const dist = Math.abs(angle)
          if (dist < minAngleDist) {
            minAngleDist = dist
            closestIndexInCarousel = index
          }
        })

        const dynamicRadiusX = Math.max(
          FAN_RELATIVE_CONFIG.minRadiusX,
          (totalCarouselCaps * FAN_RELATIVE_CONFIG.desiredSpacing) / (2 * Math.PI)
        )
        const radiusZ = FAN_RELATIVE_CONFIG.fixedRadiusZ

        player.caps.forEach((capId) => {
          const cap = visualCaps.value.get(capId)
          if (!cap) return

          const isSelected = selectedIds.includes(capId)

          if (isSelected) {
            const selectIndex = selectedIds.indexOf(capId)
            const noiseX = (getDeterministicNoise(capId, 1.5) - 0.5) * 0.05
            const noiseZ = (getDeterministicNoise(capId, 2.5) - 0.5) * 0.05
            const noiseRotY = (getDeterministicNoise(capId, 3.5) - 0.5) * 0.35

            const xLocalSelected = noiseX
            const yLocalSelected = FAN_RELATIVE_CONFIG.heightOffset + 0.65 + (selectIndex * 0.085)
            const zLocalSelected = -0.1 + noiseZ

            const targetWorldPos = camPos.clone()
              .addScaledVector(camDir, FAN_RELATIVE_CONFIG.distance - 0.5 + zLocalSelected)
              .addScaledVector(camRight, xLocalSelected)
              .addScaledVector(camUp, yLocalSelected)

            cap.targetPosition.copy(targetWorldPos)

            const qFinal = new THREE.Quaternion()
            const toCameraDir = camPos.clone().sub(targetWorldPos).normalize()
            const tempMatrix = new THREE.Matrix4()
            tempMatrix.lookAt(new THREE.Vector3(), toCameraDir, camUp)
            qFinal.setFromRotationMatrix(tempMatrix)

            const pitchTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI * 0.15)
            const yawSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), noiseRotY)
            qFinal.multiply(pitchTilt).multiply(yawSpin)

            const correction = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
            qFinal.multiply(correction)
            cap.targetRotation.setFromQuaternion(qFinal)
          } else {
            const indexInCarousel = carouselCaps.indexOf(capId)
            const rawAngle = (indexInCarousel - scrollOffset.value) * baseAngleStep
            let angle = ((rawAngle + Math.PI) % (2 * Math.PI))
            if (angle < 0) angle += 2 * Math.PI
            angle -= Math.PI

            let diff = indexInCarousel - closestIndexInCarousel
            const half = totalCarouselCaps / 2
            if (diff > half) diff -= totalCarouselCaps
            if (diff < -half) diff += totalCarouselCaps
            const absDiff = Math.abs(diff)

            let angularPush = 0
            const pocketActivity = Math.max(0, 1 - minAngleDist / baseAngleStep)
            if (absDiff !== 0 && totalCarouselCaps > 1) {
              const basePush = 0.58 / dynamicRadiusX
              if (absDiff === 1) angularPush = Math.sign(diff) * basePush * pocketActivity
              else if (absDiff === 2) angularPush = Math.sign(diff) * (basePush * 0.4) * pocketActivity
            }

            let finalAngle = angle + angularPush
            if (absDiff === 0) {
              const absFinalAngle = Math.abs(finalAngle)
              const magnetZone = 0.8
              if (absFinalAngle < magnetZone) {
                const t = absFinalAngle / magnetZone
                finalAngle = Math.sign(finalAngle) * Math.pow(t, 1.6) * magnetZone
              }
            }

            let centerFactor = 0
            if (absDiff === 0) {
              centerFactor = Math.max(0, 1 - Math.abs(finalAngle) / 0.8)
            }

            const xLocal = Math.sin(finalAngle) * dynamicRadiusX
            const zLocal = -Math.cos(finalAngle) * radiusZ
            const focusPushOffset = absDiff === 0 ? centerFactor * 0.95 : 0
            const focusHeightOffset = absDiff === 0 ? centerFactor * 0.38 : 0
            const yLocal = FAN_RELATIVE_CONFIG.heightOffset + focusHeightOffset

            const targetWorldPos = camPos.clone()
              .addScaledVector(camDir, (FAN_RELATIVE_CONFIG.distance - focusPushOffset) + zLocal)
              .addScaledVector(camRight, xLocal)
              .addScaledVector(camUp, yLocal)

            cap.targetPosition.copy(targetWorldPos)

            const qTangent = new THREE.Quaternion()
            const qFaceCamera = new THREE.Quaternion()
            const qFinal = new THREE.Quaternion()
            const tangentLocal = new THREE.Vector3(
              Math.cos(finalAngle) * dynamicRadiusX,
              0,
              Math.sin(finalAngle) * radiusZ
            ).normalize()
            const tangentWorld = tangentLocal.clone().applyQuaternion(camera.quaternion).normalize()
            const tempMatrix = new THREE.Matrix4()
            tempMatrix.lookAt(new THREE.Vector3(), tangentWorld, camUp)
            qTangent.setFromRotationMatrix(tempMatrix)

            const toCameraDir = camPos.clone().sub(targetWorldPos).normalize()
            tempMatrix.lookAt(new THREE.Vector3(), toCameraDir, camUp)
            qFaceCamera.setFromRotationMatrix(tempMatrix)

            const slerpFactor = absDiff === 0 ? Math.min(1, Math.sin(centerFactor * Math.PI * 0.5)) : 0
            qFinal.copy(qTangent).slerp(qFaceCamera, slerpFactor)

            const correction = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
            qFinal.multiply(correction)
            cap.targetRotation.setFromQuaternion(qFinal)
          }
        })
      } else {
        player.caps.forEach((capId, index) => {
          const cap = visualCaps.value.get(capId)
          if (!cap) return

          const noiseX = (getDeterministicNoise(capId, 5.1) - 0.5) * 0.04
          const noiseZ = (getDeterministicNoise(capId, 6.2) - 0.5) * 0.04
          const noiseRotY = (getDeterministicNoise(capId, 7.3) - 0.5) * 0.5

          cap.targetPosition.copy(STACK_POSITIONS.playerBank)
          cap.targetPosition.x += noiseX
          cap.targetPosition.z += noiseZ
          cap.targetPosition.y += index * CAPS_CONFIG.THICKNESS

          const noiseTiltX = (getDeterministicNoise(capId, 8.4) - 0.5) * 0.04
          const noiseTiltZ = (getDeterministicNoise(capId, 9.5) - 0.5) * 0.04
          cap.targetRotation.set(noiseTiltX, index * 0.1 + noiseRotY, noiseTiltZ)
        })
      }
    }

    if (bot) {
      bot.caps.forEach((capId, index) => {
        const cap = visualCaps.value.get(capId)
        if (!cap) return

        const noiseX = (getDeterministicNoise(capId, 10.1) - 0.5) * 0.04
        const noiseZ = (getDeterministicNoise(capId, 11.2) - 0.5) * 0.04
        const noiseRotY = (getDeterministicNoise(capId, 12.3) - 0.5) * 0.5

        cap.targetPosition.copy(STACK_POSITIONS.botBank)
        cap.targetPosition.x += noiseX
        cap.targetPosition.z += noiseZ
        cap.targetPosition.y += index * CAPS_CONFIG.THICKNESS

        const noiseTiltX = (getDeterministicNoise(capId, 13.4) - 0.5) * 0.04
        const noiseTiltZ = (getDeterministicNoise(capId, 14.5) - 0.5) * 0.04
        cap.targetRotation.set(noiseTiltX, index * -0.08 + noiseRotY, noiseTiltZ)
      })
    }

    // Кон: приподнятая стопка, готовая к удару
    const idleTiltZ = CAPS_CONFIG.IDLE_TILT_DEG * Math.PI / 180
    const waitingForPlayerThrow =
      !isSelectionMode.value &&
      battleStack.length > 0 &&
      gameplay.currentPlayerId.value === 'player'
    const bobY = waitingForPlayerThrow
      ? Math.sin(waitBobTime * CAPS_CONFIG.WAIT_BOB.SPEED) * CAPS_CONFIG.WAIT_BOB.AMPLITUDE
      : 0

    battleStack.forEach((capId, index) => {
      const cap = visualCaps.value.get(capId)
      if (!cap) return

      const noiseX = (getDeterministicNoise(capId, 15.1) - 0.5) * 0.03
      const noiseZ = (getDeterministicNoise(capId, 16.2) - 0.5) * 0.03
      const noiseRotY = (getDeterministicNoise(capId, 17.3) - 0.5) * 1.2

      cap.targetPosition.copy(STACK_POSITIONS.battleStack)
      cap.targetPosition.x += noiseX
      cap.targetPosition.z += noiseZ
      cap.targetPosition.y = CAPS_CONFIG.INITIAL_Y + index * CAPS_CONFIG.THICKNESS + bobY

      cap.targetRotation.set(0, noiseRotY, idleTiltZ * (index % 2 === 0 ? 1 : -1))
    })
  }

  function runScatterTimeline(
    trajectories: CapTrajectory[],
    timing: ThrowTiming,
    groupTiltZ: number,
    firstTouchY: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const origin = STACK_POSITIONS.battleStack
      const timeline = gsap.timeline({
        onComplete: () => {
          activeThrowTimeline = null
          resolve()
        },
      })
      activeThrowTimeline = timeline

      trajectories.forEach((trajectory) => {
        const cap = visualCaps.value.get(trajectory.capId)
        if (!cap) return

        appendCapTrajectoryToTimeline(
          timeline,
          cap,
          trajectory,
          timing,
          groupTiltZ,
          firstTouchY,
          origin,
          {
            onFirstHit: () => {
              sounds.resumeAudioContext()
              sounds.playFirstHit()
              emit('camera:action', { type: 'SHAKE', intensity: 0.55 })
              emit('fishka:hit', { force: 1, type: 'floor' })
            },
            onSlamFlat: () => {
              sounds.playSlamFlat()
            },
          },
        )
      })
    })
  }

  function runReturnTimeline(plan: ThrowPlan, trajectories: CapTrajectory[]): Promise<void> {
    return new Promise((resolve) => {
      const origin = STACK_POSITIONS.battleStack
      const targetTiltZ = CAPS_CONFIG.IDLE_TILT_DEG * Math.PI / 180
      const throwerBankSize = gameplay.participants.value.get(plan.throwerId)?.caps.length ?? 0
      const trajById = new Map(trajectories.map(t => [t.capId, t]))

      const timeline = gsap.timeline({
        onComplete: () => {
          activeThrowTimeline = null
          resolve()
        },
      })
      activeThrowTimeline = timeline

      let collectedSlot = throwerBankSize
      let collectedIndex = 0

      plan.flippedIds.forEach((capId) => {
        const cap = visualCaps.value.get(capId)
        if (!cap) return
        const position = getCollectedStackPosition(plan.throwerId, collectedSlot)
        const rotation = getCollectedStackRotation(plan.throwerId, collectedSlot, capId)
        collectedSlot += 1
        appendCollectedStackReturn(
          timeline,
          cap,
          position,
          rotation,
          collectedIndex * CAPS_CONFIG.RETURN_ANIMATION.COLLECTED_STAGGER,
        )
        collectedIndex += 1
      })

      plan.remainingIds.forEach((capId, throwStackIndex) => {
        const cap = visualCaps.value.get(capId)
        if (!cap) return
        const traj = trajById.get(capId)
        appendThrowStackReturn(
          timeline,
          cap,
          throwStackIndex,
          throwStackIndex * CAPS_CONFIG.RETURN_ANIMATION.THROW_STACK_STAGGER,
          traj?.idleRotationY ?? (getDeterministicNoise(capId, 17.3) - 0.5) * 1.2,
          targetTiltZ,
          origin,
        )
      })
    })
  }

  async function playThrow(flipChance = 0.5): Promise<boolean> {
    if (isThrowAnimating.value || isSelectionMode.value) return false

    const plan = gameplay.resolveThrow(flipChance)
    if (!plan) return false

    const stackIds = [...gameplay.battleStack.value]
    if (stackIds.length === 0) return false

    sounds.resumeAudioContext()
    isThrowAnimating.value = true
    killThrowAnimation()

    const timing = createThrowTiming()
    const groupTiltZ = randomSignedRange(CAPS_CONFIG.GROUP_TILT_DEG * Math.PI / 180)
    const firstTouchY = CAPS_CONFIG.FLOOR_Y + CAPS_CONFIG.RADIUS * Math.abs(Math.sin(groupTiltZ))
    const origin = STACK_POSITIONS.battleStack
    const flippedSet = new Set(plan.flippedIds)
    const placedCaps: PlacedCap[] = []

    const trajectories = stackIds.map((capId, throwStackIndex) => {
      const trajectory = generateCapTrajectory(
        capId,
        throwStackIndex,
        flippedSet.has(capId),
        placedCaps,
        timing.bounceStartTime,
        origin,
      )
      placedCaps.push({
        x: trajectory.randomTargetX,
        z: trajectory.randomTargetZ,
        finalY: trajectory.landY,
        bounceDelta: trajectory.bounceHeightDelta,
      })
      return trajectory
    })

    try {
      await runScatterTimeline(trajectories, timing, groupTiltZ, firstTouchY)
      await new Promise<void>((resolve) => {
        gsap.delayedCall(CAPS_CONFIG.RETURN_ANIMATION.POST_SCATTER_DELAY, () => resolve())
      })
      await runReturnTimeline(plan, trajectories)

      finishThrow(plan)
      return true
    } catch {
      finishThrow(plan)
      return false
    }
  }

  function finishThrow(plan: ThrowPlan) {
    syncVisualToCurrent()
    gameplay.applyThrow(plan)
    isThrowAnimating.value = false
    updateTargets()

    // Сразу ставим в финальные слоты банков/кона — без лишнего доворота после GSAP
    for (const id of [...plan.flippedIds, ...plan.remainingIds]) {
      const cap = visualCaps.value.get(id)
      if (!cap) continue
      cap.currentPosition.copy(cap.targetPosition)
      cap.currentRotation.copy(cap.targetRotation)
    }
  }

  if (!watchersReady) {
    watchersReady = true

    watch(() => gameplay.battleStack.value, () => {
      if (!isThrowAnimating.value) updateTargets()
    }, { deep: true })

    watch(() => gameplay.participantsList.value, () => {
      syncWithGameplay()
    }, { deep: true, immediate: true })

    watch(
      [isSelectionMode, scrollOffset, () => activeCamera?.value],
      () => {
        if (!isThrowAnimating.value) updateTargets()
      },
      { immediate: true }
    )

    watch(
      () => gameplay.proposedPlayerCaps.value,
      () => {
        if (!isThrowAnimating.value && isSelectionMode.value) updateTargets()
      },
      { deep: true }
    )
  }

  function updatePhysics(delta: number) {
    if (!isThrowAnimating.value) {
      const waitingForPlayerThrow =
        !isSelectionMode.value &&
        gameplay.battleStack.value.length > 0 &&
        gameplay.currentPlayerId.value === 'player'

      if (waitingForPlayerThrow) {
        waitBobTime += delta
        updateTargets()
      } else if (isSelectionMode.value && activeCamera?.value) {
        updateTargets()
      }

      const lerpFactor = 1 - Math.exp(-12 * delta)
      visualCaps.value.forEach((cap) => {
        cap.currentPosition.lerp(cap.targetPosition, lerpFactor)
        const curQuad = new THREE.Quaternion().setFromEuler(cap.currentRotation)
        const tgtQuad = new THREE.Quaternion().setFromEuler(cap.targetRotation)
        curQuad.slerp(tgtQuad, lerpFactor)
        cap.currentRotation.setFromQuaternion(curQuad)
      })
    }

    // Нужен и во время GSAP-удара: Vue не видит мутации THREE.Vector3 сами по себе
    animFrame.value = (animFrame.value + 1) % 1_000_000
  }

  return {
    visualCaps,
    isSelectionMode,
    scrollOffset,
    isThrowAnimating,
    animFrame,
    updatePhysics,
    updateTargets,
    syncWithGameplay,
    playThrow,
  }
}
