export interface CapServerConfig {
  id: number
  throwStackIndex: number
  isFlipped: boolean
}

export interface CapThrowResult {
  capId: number
  isFlipped: boolean
}

export interface PlacedCap {
  x: number
  z: number
  finalY: number
  bounceDelta: number
}

export interface CapTrajectory {
  capId: number
  throwStackIndex: number
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
}
