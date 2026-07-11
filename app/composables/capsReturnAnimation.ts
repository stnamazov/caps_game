import { CAPS_CONFIG } from '@/constants/caps'
import gsap from 'gsap'

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randomSignedRange(max: number) {
  return (Math.random() - 0.5) * 2 * max
}

export function appendThrowStackReturn(
  timeline: gsap.core.Timeline,
  mesh: any,
  capId: number,
  throwStackIndex: number,
  startTime: number,
  initialRotationY: number[],
  targetTiltZ: number,
) {
  const config = CAPS_CONFIG.RETURN_ANIMATION
  const targetY = CAPS_CONFIG.INITIAL_Y + throwStackIndex * CAPS_CONFIG.THICKNESS
  const arcHeight = randomRange(config.THROW_STACK_LIFT_MIN, config.THROW_STACK_LIFT_MAX)
  const spreadX = randomSignedRange(config.THROW_STACK_SPREAD)
  const spreadZ = randomSignedRange(config.THROW_STACK_SPREAD)
  const liftDuration = randomRange(config.THROW_STACK_LIFT_DURATION_MIN, config.THROW_STACK_LIFT_DURATION_MAX)
  const settleDuration = randomRange(config.THROW_STACK_SETTLE_DURATION_MIN, config.THROW_STACK_SETTLE_DURATION_MAX)
  const liftY = Math.max(mesh.position.y, targetY) + arcHeight

  timeline.to(
    mesh.position,
    { x: spreadX, y: liftY, z: spreadZ, duration: liftDuration, ease: 'power2.out' },
    startTime,
  )

  timeline.to(
    mesh.rotation,
    { x: 0, y: initialRotationY[capId], z: targetTiltZ, duration: liftDuration, ease: 'power2.out' },
    startTime,
  )

  timeline.to(
    mesh.position,
    { x: 0, y: targetY, z: 0, duration: settleDuration, ease: 'power2.inOut' },
    startTime + liftDuration * 0.8,
  )
}

export function appendCollectedStackReturn(
  timeline: gsap.core.Timeline,
  mesh: any,
  target: { x: number, y: number, z: number },
  startTime: number,
) {
  const config = CAPS_CONFIG.RETURN_ANIMATION
  const arcHeight = randomRange(config.COLLECTED_ARC_HEIGHT_MIN, config.COLLECTED_ARC_HEIGHT_MAX)
  const approachOffsetX = randomSignedRange(config.COLLECTED_APPROACH_OFFSET)
  const approachOffsetZ = randomSignedRange(config.COLLECTED_APPROACH_OFFSET)
  const liftDuration = randomRange(config.COLLECTED_LIFT_DURATION_MIN, config.COLLECTED_LIFT_DURATION_MAX)
  const dropDuration = randomRange(config.COLLECTED_DROP_DURATION_MIN, config.COLLECTED_DROP_DURATION_MAX)
  const peakY = Math.max(mesh.position.y, target.y) + arcHeight
  const dropStart = startTime + liftDuration
  const landTime = dropStart + dropDuration

  timeline.to(
    mesh.position,
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
    mesh.position,
    { x: target.x, y: target.y, z: target.z, duration: dropDuration, ease: 'power2.in' },
    dropStart,
  )

  timeline.to(
    mesh.position,
    { y: target.y + 0.02, duration: 0.06, ease: 'power1.out' },
    landTime,
  )
  timeline.to(
    mesh.position,
    { y: target.y, duration: 0.1, ease: 'bounce.out' },
    landTime + 0.06,
  )

  timeline.to(
    mesh.rotation,
    { x: Math.PI, y: 0, z: 0, duration: liftDuration + dropDuration, ease: 'power2.inOut' },
    startTime,
  )
}
