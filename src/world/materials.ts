import * as THREE from 'three'

const cache = new Map<string, THREE.CanvasTexture>()

function texFromCanvas(key: string, canvas: HTMLCanvasElement): THREE.CanvasTexture {
  let t = cache.get(key)
  if (t) return t
  t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  t.needsUpdate = true
  cache.set(key, t)
  return t
}

/** Ground pavement tiles (not building facades). */
export function getPavementTexture(): THREE.CanvasTexture {
  return texFromCanvas('pavement', (() => {
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
    return c
  })())
}

/** Mosaic / drawings for Velbazhd plaza center rectangle. */
export function getPlazaMosaicTexture(): THREE.CanvasTexture {
  return texFromCanvas('plaza-mosaic', (() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const ctx = c.getContext('2d')!

    ctx.fillStyle = '#cbb89a'
    ctx.fillRect(0, 0, 512, 512)
    ctx.strokeStyle = 'rgba(90, 70, 50, 0.2)'
    for (let i = 0; i <= 512; i += 32) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, 512)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(512, i)
      ctx.stroke()
    }

    ctx.strokeStyle = '#8b4518'
    ctx.lineWidth = 10
    ctx.strokeRect(28, 28, 456, 456)
    ctx.strokeStyle = '#2a6b4a'
    ctx.lineWidth = 6
    ctx.strokeRect(48, 48, 416, 416)

    const cx = 256
    const cy = 256
    ctx.fillStyle = '#e8a317'
    ctx.beginPath()
    ctx.arc(cx, cy, 54, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#c45c26'
    ctx.lineWidth = 5
    ctx.stroke()
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      ctx.strokeStyle = '#e8a317'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70)
      ctx.lineTo(cx + Math.cos(a) * 110, cy + Math.sin(a) * 110)
      ctx.stroke()
    }

    const corners: Array<[number, number]> = [
      [110, 110],
      [402, 110],
      [110, 402],
      [402, 402],
    ]
    for (const [x, y] of corners) {
      ctx.fillStyle = '#2f6fed'
      ctx.beginPath()
      ctx.moveTo(x, y - 28)
      ctx.lineTo(x + 28, y)
      ctx.lineTo(x, y + 28)
      ctx.lineTo(x - 28, y)
      ctx.closePath()
      ctx.fill()
    }

    ctx.fillStyle = 'rgba(42, 157, 143, 0.55)'
    ctx.fillRect(80, 200, 60, 112)
    ctx.fillStyle = 'rgba(123, 94, 167, 0.5)'
    ctx.fillRect(372, 200, 60, 112)
    ctx.fillStyle = 'rgba(196, 92, 38, 0.45)'
    ctx.fillRect(200, 80, 112, 48)
    ctx.fillRect(200, 384, 112, 48)

    return c
  })())
}

export type FacadeStyle =
  | 'default'
  | 'civic'
  | 'post'
  | 'gallery'
  | 'cafe'
  | 'a1'
  | 'shop'
  | 'center'

const STYLE_COLORS: Record<FacadeStyle, string | null> = {
  default: null,
  civic: '#d8d2c4',
  post: '#f0e6a8',
  gallery: '#cfc6b4',
  cafe: '#c4a484',
  a1: '#e8eef2',
  shop: '#d4b896',
  center: null,
}

/** Flat wall color only — windows are separate meshes (Obshtina-style). */
export function facadeMaterial(
  colorHex: string,
  style: FacadeStyle = 'default',
): THREE.MeshStandardMaterial {
  const color = STYLE_COLORS[style] ?? colorHex
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0.04,
  })
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
