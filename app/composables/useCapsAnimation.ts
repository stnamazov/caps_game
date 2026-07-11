import type { Ref } from 'vue'
import type { CapServerConfig, CapThrowResult, CapTrajectory, PlacedCap } from '@/types/caps'
import { CAPS_CONFIG, getCollectedStackPosition } from '@/constants/caps'
import { appendCollectedStackReturn, appendThrowStackReturn } from '@/composables/capsReturnAnimation'
import gsap from 'gsap'

interface CapsAnimationOptions {
  fishkiRefs: Ref<any[]>
  initialRotationY: number[]
  onFirstHit?: () => void
  onSlamFlat?: () => void
  onDribble?: () => void
}

interface TrajectoryContext {
  groupTiltZ: number
  firstTouchY: number
  aimEndTime: number
  windupEndTime: number
  startTiltSlamTime: number
  bounceStartTime: number
}

export function createThrowTiming() {
  const config = CAPS_CONFIG.THROW_ANIMATION
  const aimEndTime = config.AIM_DURATION
  const windupEndTime = aimEndTime + config.WINDUP_DURATION
  const startTiltSlamTime = windupEndTime + config.SLAM_DURATION
  const bounceStartTime = startTiltSlamTime + config.BOUNCE_DELAY

  return { aimEndTime, windupEndTime, startTiltSlamTime, bounceStartTime }
}

function isCapFlipped(rotationX: number) {
  const halfTurns = Math.round(rotationX / Math.PI)
  return halfTurns % 2 !== 0
}

function calculateCapRotation(config: CapServerConfig, forceLowRotation: boolean) {
  if (forceLowRotation) {
    return config.isFlipped ? 180 : 0
  }

  if (config.isFlipped) {
    return Math.random() > 0.5 ? 180 : 540
  }

  return Math.random() > 0.4 ? 360 : (15 + Math.random() * 20)
}

export function generateCapTrajectory(
  config: CapServerConfig,
  placedCaps: PlacedCap[],
  groupTiltZ: number,
  bounceStartTime: number,
): CapTrajectory {
  const capId = config.id
  const throwStackIndex = config.throwStackIndex
  const stackOffsetY = throwStackIndex * CAPS_CONFIG.THICKNESS
  const startY = CAPS_CONFIG.INITIAL_Y + stackOffsetY
  const minDistance = CAPS_CONFIG.RADIUS * 2

  const scatterForce = 0.6 + (throwStackIndex * 0.15)
  const randomTargetX = (Math.random() - 0.5) * 2 * scatterForce
  const randomTargetZ = (Math.random() - 0.5) * 2 * scatterForce

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

  const totalRotationDeg = calculateCapRotation(config, forceLowRotation)
  const finalAirRotationX = totalRotationDeg * Math.PI / 180
  const finalTouchY = landY + CAPS_CONFIG.RADIUS * Math.abs(Math.sin(finalAirRotationX))
  const finalTargetXRot = Math.round(finalAirRotationX / Math.PI) * Math.PI

  const timeUp = 0.2 + (bounceHeightDelta * 0.12)
  const timeDown = timeUp * 0.75
  const totalFlyTime = timeUp + timeDown
  const thisFinalSlamTime = bounceStartTime + totalFlyTime
  const thisBounceDribbleTime = thisFinalSlamTime + 0.05

  return {
    capId,
    throwStackIndex,
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
  }
}

export function generateCapTrajectories(
  serverData: CapServerConfig[],
  groupTiltZ: number,
  bounceStartTime: number,
): CapTrajectory[] {
  const placedCaps: PlacedCap[] = []

  return serverData.map((config) => {
    const trajectory = generateCapTrajectory(config, placedCaps, groupTiltZ, bounceStartTime)

    placedCaps.push({
      x: trajectory.randomTargetX,
      z: trajectory.randomTargetZ,
      finalY: trajectory.landY,
      bounceDelta: trajectory.bounceHeightDelta,
    })

    return trajectory
  })
}

function appendCapTrajectoryToTimeline(
  timeline: gsap.core.Timeline,
  mesh: any,
  trajectory: CapTrajectory,
  context: TrajectoryContext,
  initialRotationY: number[],
  callbacks: Pick<CapsAnimationOptions, 'onFirstHit' | 'onSlamFlat' | 'onDribble'>,
) {
  const stackOffsetY = trajectory.throwStackIndex * CAPS_CONFIG.THICKNESS
  const initialLandY = CAPS_CONFIG.FLOOR_Y + stackOffsetY
  const throwConfig = CAPS_CONFIG.THROW_ANIMATION
  const aimY = trajectory.startY - throwConfig.AIM_DROP
  const windupY = trajectory.startY + throwConfig.WINDUP_LIFT
  const floorTouchY = context.firstTouchY + stackOffsetY

  timeline.set(mesh.position, { x: 0, y: trajectory.startY, z: 0 }, 0)
  timeline.set(mesh.rotation, { x: 0, y: initialRotationY[trajectory.capId], z: context.groupTiltZ }, 0)

  timeline.to(
    mesh.position,
    { y: aimY, duration: throwConfig.AIM_DURATION, ease: 'power1.inOut' },
    0,
  )

  timeline.to(
    mesh.position,
    { y: windupY, duration: throwConfig.WINDUP_DURATION, ease: 'power2.out' },
    context.aimEndTime,
  )

  timeline.to(
    mesh.position,
    { y: floorTouchY, duration: throwConfig.SLAM_DURATION, ease: 'power4.in' },
    context.windupEndTime,
  )

  if (trajectory.isFirstCap && callbacks.onFirstHit) {
    timeline.call(callbacks.onFirstHit, undefined, context.startTiltSlamTime)
  }

  timeline.to(mesh.position, { y: initialLandY, duration: 0.03, ease: 'power1.out' }, context.startTiltSlamTime)
  timeline.to(mesh.rotation, { z: 0, duration: 0.03, ease: 'power1.out' }, context.startTiltSlamTime)

  timeline.to(
    mesh.position,
    { y: trajectory.maxBounceHeight, duration: trajectory.timeUp, ease: 'power1.out' },
    context.bounceStartTime,
  )
  timeline.to(
    mesh.position,
    { y: trajectory.finalTouchY, duration: trajectory.timeDown, ease: 'power2.in' },
    context.bounceStartTime + trajectory.timeUp,
  )
  timeline.to(
    mesh.position,
    { x: trajectory.randomTargetX, z: trajectory.randomTargetZ, duration: trajectory.totalFlyTime, ease: 'none' },
    context.bounceStartTime,
  )
  timeline.to(
    mesh.rotation,
    { x: trajectory.finalAirRotationX, duration: trajectory.totalFlyTime, ease: 'none' },
    context.bounceStartTime,
  )

  timeline.to(
    mesh.position,
    { y: trajectory.landY, duration: 0.05, ease: 'power2.out' },
    trajectory.thisFinalSlamTime,
  )
  timeline.to(
    mesh.rotation,
    { x: trajectory.finalTargetXRot, duration: 0.05, ease: 'power2.out' },
    trajectory.thisFinalSlamTime,
  )

  if (callbacks.onSlamFlat) {
    timeline.call(callbacks.onSlamFlat, undefined, trajectory.thisFinalSlamTime)
  }

  timeline.to(
    mesh.position,
    { y: trajectory.landY + 0.04, duration: 0.05, ease: 'power1.out' },
    trajectory.thisBounceDribbleTime,
  )
  timeline.to(
    mesh.position,
    { y: trajectory.landY, duration: 0.08, ease: 'bounce.out' },
    trajectory.thisBounceDribbleTime + 0.05,
  )

  if (callbacks.onDribble) {
    timeline.call(callbacks.onDribble, undefined, trajectory.thisBounceDribbleTime)
  }
}

export function useCapsAnimation(options: CapsAnimationOptions) {
  let isAnimating = false
  const collectedCapIds = new Set<number>()

  const getActiveCapIds = () => {
    return Array.from({ length: CAPS_CONFIG.TOTAL }, (_, id) => id)
      .filter(id => !collectedCapIds.has(id))
  }

  const resetStackToWait = () => {
    if (options.fishkiRefs.value.length < CAPS_CONFIG.TOTAL) return

    collectedCapIds.clear()

    const idleTiltZ = CAPS_CONFIG.IDLE_TILT_DEG * Math.PI / 180

    options.fishkiRefs.value.forEach((mesh, capId) => {
      if (!mesh) return

      const stackOffsetY = capId * CAPS_CONFIG.THICKNESS
      gsap.set(mesh.position, { x: 0, y: CAPS_CONFIG.INITIAL_Y + stackOffsetY, z: 0 })
      gsap.set(mesh.rotation, { x: 0, y: options.initialRotationY[capId], z: idleTiltZ })
    })

    isAnimating = false
  }

  const animateAllToThrowStack = () => {
    const returnTimeline = gsap.timeline({
      onComplete: () => {
        collectedCapIds.clear()
        isAnimating = false
      },
    })

    const targetTiltZ = CAPS_CONFIG.IDLE_TILT_DEG * Math.PI / 180
    const stagger = CAPS_CONFIG.RETURN_ANIMATION.THROW_STACK_STAGGER

    options.fishkiRefs.value.forEach((mesh, capId) => {
      if (!mesh) return

      appendThrowStackReturn(
        returnTimeline,
        mesh,
        capId,
        capId,
        capId * stagger,
        options.initialRotationY,
        targetTiltZ,
      )
    })
  }

  const animateReturnToStack = (throwResults: CapThrowResult[]) => {
    const returnTimeline = gsap.timeline()
    const targetTiltZ = CAPS_CONFIG.IDLE_TILT_DEG * Math.PI / 180
    let collectedSlot = collectedCapIds.size
    let collectedIndex = 0

    throwResults.forEach((result) => {
      if (!result.isFlipped) return

      collectedCapIds.add(result.capId)

      const mesh = options.fishkiRefs.value[result.capId]
      if (!mesh) return

      const position = getCollectedStackPosition(collectedSlot)
      collectedSlot += 1

      appendCollectedStackReturn(
        returnTimeline,
        mesh,
        position,
        collectedIndex * CAPS_CONFIG.RETURN_ANIMATION.COLLECTED_STAGGER,
      )
      collectedIndex += 1
    })

    const activeCapIds = getActiveCapIds()
    activeCapIds.forEach((capId, throwStackIndex) => {
      const mesh = options.fishkiRefs.value[capId]
      if (!mesh) return

      appendThrowStackReturn(
        returnTimeline,
        mesh,
        capId,
        throwStackIndex,
        throwStackIndex * CAPS_CONFIG.RETURN_ANIMATION.THROW_STACK_STAGGER,
        options.initialRotationY,
        targetTiltZ,
      )
    })

    returnTimeline.eventCallback('onComplete', () => {
      if (collectedCapIds.size >= CAPS_CONFIG.TOTAL) {
        animateAllToThrowStack()
        return
      }

      isAnimating = false
    })
  }

  const throwCaps = (serverData: CapServerConfig[]) => {
    if (options.fishkiRefs.value.length < CAPS_CONFIG.TOTAL) return
    if (serverData.length === 0) return

    isAnimating = true

    const groupTiltZ = (Math.random() - 0.5) * 2 * (CAPS_CONFIG.GROUP_TILT_DEG * Math.PI / 180)
    const throwTiming = createThrowTiming()
    const firstTouchY = CAPS_CONFIG.FLOOR_Y + CAPS_CONFIG.RADIUS * Math.abs(Math.sin(groupTiltZ))

    const trajectories = generateCapTrajectories(serverData, groupTiltZ, throwTiming.bounceStartTime)
    const throwResults: CapThrowResult[] = trajectories.map(trajectory => ({
      capId: trajectory.capId,
      isFlipped: isCapFlipped(trajectory.finalTargetXRot),
    }))

    const context: TrajectoryContext = {
      groupTiltZ,
      firstTouchY,
      ...throwTiming,
    }

    const mainTimeline = gsap.timeline({
      onComplete: () => {
        gsap.delayedCall(2.0, () => animateReturnToStack(throwResults))
      },
    })

    trajectories.forEach((trajectory) => {
      const mesh = options.fishkiRefs.value[trajectory.capId]
      if (!mesh) return

      appendCapTrajectoryToTimeline(
        mainTimeline,
        mesh,
        trajectory,
        context,
        options.initialRotationY,
        options,
      )
    })
  }

  const getIsAnimating = () => isAnimating

  return {
    resetStackToWait,
    throwCaps,
    getActiveCapIds,
    getIsAnimating,
  }
}
