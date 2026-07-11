import * as THREE from 'three'
import { CAPS_CONFIG } from '@/constants/caps'

const edgeColor = new THREE.Color('#ffffff')

export function useCapMaterials(totalCaps = CAPS_CONFIG.TOTAL) {
  const textureLoader = new THREE.TextureLoader()

  const topTexture = textureLoader.load('/textures/test/1.png')

  const bottomTextures = Array.from({ length: totalCaps }, () => {
    const tex = textureLoader.load('/textures/test/top-shared.png')
    tex.center.set(0.5, 0.5)
    tex.repeat.x = -1
    return tex
  })

  const getCapMaterials = (capNumber: number) => [
    new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.4 }),
    new THREE.MeshStandardMaterial({ map: topTexture, roughness: 0.2 }),
    new THREE.MeshStandardMaterial({ map: bottomTextures[capNumber - 1], roughness: 0.2 }),
  ]

  return {
    radius: CAPS_CONFIG.RADIUS,
    thickness: CAPS_CONFIG.THICKNESS,
    getCapMaterials,
  }
}
