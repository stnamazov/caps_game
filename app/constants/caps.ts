export const CAPS_CONFIG = {
  TOTAL: 10,
  INITIAL_Y: 1.5,
  FLOOR_Y: 0.025,
  RADIUS: 0.4,
  THICKNESS: 0.03,
  IDLE_TILT_DEG: 1,
  IDLE_ROTATION_Y_MAX_DEG: 100,
  GROUP_TILT_DEG: 12,
  COLLECTED_STACK: {
    X: 1.7,
    Y: 0.025,
    Z: 1.7,
    PLANE_JITTER: 0.08,
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
    COLLECTED_STAGGER: 0.05,
    COLLECTED_ARC_HEIGHT_MIN: 0.5,
    COLLECTED_ARC_HEIGHT_MAX: 0.9,
    COLLECTED_APPROACH_OFFSET: 0.3,
    COLLECTED_LIFT_DURATION_MIN: 0.4,
    COLLECTED_LIFT_DURATION_MAX: 0.55,
    COLLECTED_DROP_DURATION_MIN: 0.45,
    COLLECTED_DROP_DURATION_MAX: 0.6,
  },
} as const

function randomSignedRange(max: number) {
  return (Math.random() - 0.5) * 2 * max
}

export function getCollectedStackPosition(slot: number) {
  const jitter = CAPS_CONFIG.COLLECTED_STACK.PLANE_JITTER

  return {
    x: CAPS_CONFIG.COLLECTED_STACK.X + randomSignedRange(jitter),
    y: CAPS_CONFIG.COLLECTED_STACK.Y + slot * CAPS_CONFIG.THICKNESS,
    z: CAPS_CONFIG.COLLECTED_STACK.Z + randomSignedRange(jitter),
  }
}

export function createIdleRotationY(total = CAPS_CONFIG.TOTAL) {
  const maxRad = CAPS_CONFIG.IDLE_ROTATION_Y_MAX_DEG * Math.PI / 180

  return Array.from({ length: total }, () => (Math.random() - 0.5) * 2 * maxRad)
}
