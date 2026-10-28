import * as THREE from 'three'

let facadeMap: THREE.CanvasTexture | null = null
let pavementMap: THREE.CanvasTexture | null = null

/** Shared low-poly window-grid facade texture. */
export function getFacadeTexture(): THREE.CanvasTexture {
  if (facadeMap) return facadeMap
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#9a8570'
  ctx.fillRect(0, 0, 128, 128)
  // Window grid
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 10 + col * 30
      const y = 8 + row * 30
      ctx.fillStyle = row % 2 === 0 ? '#2a3540' : '#3a4a58'
      ctx.fillRect(x, y, 16, 18)
      ctx.fillStyle = 'rgba(220, 200, 140, 0.15)'
      ctx.fillRect(x + 2, y + 2, 6, 6)
    }
  }
  // Ground floor darker band
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(0, 100, 128, 28)

  facadeMap = new THREE.CanvasTexture(c)
  facadeMap.colorSpace = THREE.SRGBColorSpace
  facadeMap.wrapS = THREE.RepeatWrapping
  facadeMap.wrapT = THREE.RepeatWrapping
  facadeMap.repeat.set(2, 2)
  facadeMap.anisotropy = 4
  return facadeMap
}

export function getPavementTexture(): THREE.CanvasTexture {
  if (pavementMap) return pavementMap
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#b0a090'
  ctx.fillRect(0, 0, 64, 64)
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 64; i += 16) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 64)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(64, i)
    ctx.stroke()
  }
  pavementMap = new THREE.CanvasTexture(c)
  pavementMap.colorSpace = THREE.SRGBColorSpace
  pavementMap.wrapS = THREE.RepeatWrapping
  pavementMap.wrapT = THREE.RepeatWrapping
  pavementMap.repeat.set(4, 4)
  return pavementMap
}

export function facadeMaterial(colorHex: string): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    map: getFacadeTexture(),
    roughness: 0.88,
    metalness: 0.04,
  })
  return mat
}

export function roofMaterial(colorHex: string): THREE.MeshStandardMaterial {
  const c = new THREE.Color(colorHex)
  c.multiplyScalar(0.72)
  return new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.95,
    metalness: 0.02,
  })
}
