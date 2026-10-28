import * as THREE from 'three'

const cache = new Map<string, THREE.CanvasTexture>()

function makeFacadeCanvas(opts: {
  wall: string
  window: string
  sill: string
  ground: string
  cols: number
}): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')!
  // Wall
  ctx.fillStyle = opts.wall
  ctx.fillRect(0, 0, 256, 256)

  // One floor tile: large windows (cols across)
  const marginX = 18
  const marginY = 28
  const gap = 16
  const usableW = 256 - marginX * 2 - gap * (opts.cols - 1)
  const winW = usableW / opts.cols
  const winH = 256 - marginY * 2 - 36

  for (let col = 0; col < opts.cols; col++) {
    const x = marginX + col * (winW + gap)
    const y = marginY
    // Frame
    ctx.fillStyle = opts.sill
    ctx.fillRect(x - 4, y - 4, winW + 8, winH + 12)
    // Glass
    ctx.fillStyle = opts.window
    ctx.fillRect(x, y, winW, winH)
    // Reflection highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(x + 6, y + 6, winW * 0.28, winH * 0.35)
    // Mullion
    ctx.fillStyle = opts.sill
    ctx.fillRect(x + winW * 0.48, y, 3, winH)
    ctx.fillRect(x, y + winH * 0.45, winW, 3)
  }

  // Ground-floor shop band (bottom of tile when stacked — used via separate material too)
  ctx.fillStyle = opts.ground
  ctx.fillRect(0, 220, 256, 36)

  return c
}

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

/** Default city facade: 2 large windows per floor tile. */
export function getFacadeTexture(): THREE.CanvasTexture {
  return texFromCanvas(
    'facade-default',
    makeFacadeCanvas({
      wall: '#9a8570',
      window: '#1e2a36',
      sill: '#6a5a4a',
      ground: '#5a4a3c',
      cols: 2,
    }),
  )
}

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

    // Warm stone base
    ctx.fillStyle = '#cbb89a'
    ctx.fillRect(0, 0, 512, 512)
    // Tile grid
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

    // Outer decorative border
    ctx.strokeStyle = '#8b4518'
    ctx.lineWidth = 10
    ctx.strokeRect(28, 28, 456, 456)
    ctx.strokeStyle = '#2a6b4a'
    ctx.lineWidth = 6
    ctx.strokeRect(48, 48, 416, 416)

    // Sun motif (Kyustendil orchard / square vibe)
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

    // Corner geometric drawings
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
      ctx.strokeStyle = '#1a3a7a'
      ctx.lineWidth = 3
      ctx.stroke()
    }

    // Abstract “mural” strips
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

export function facadeMaterial(
  colorHex: string,
  style: FacadeStyle = 'default',
): THREE.MeshStandardMaterial {
  const presets: Record<
    FacadeStyle,
    { wall: string; window: string; sill: string; ground: string; cols: number }
  > = {
    default: {
      wall: colorHex,
      window: '#1e2a36',
      sill: '#5a4a3c',
      ground: '#4a3a30',
      cols: 2,
    },
    civic: {
      wall: '#d8d2c4',
      window: '#2a3548',
      sill: '#8a8070',
      ground: '#6a6558',
      cols: 2,
    },
    post: {
      wall: '#f0e6a8',
      window: '#1a2838',
      sill: '#c4a017',
      ground: '#3d5a80',
      cols: 2,
    },
    gallery: {
      wall: '#cfc6b4',
      window: '#111820',
      sill: '#7a6a55',
      ground: '#5a4a38',
      cols: 1,
    },
    cafe: {
      wall: '#c4a484',
      window: '#1a2228',
      sill: '#8b5a2b',
      ground: '#6b3a1f',
      cols: 2,
    },
    a1: {
      wall: '#e8eef2',
      window: '#0a2a30',
      sill: '#1a9b9b',
      ground: '#0d7377',
      cols: 2,
    },
    shop: {
      wall: '#d4b896',
      window: '#1e2830',
      sill: '#7b5ea7',
      ground: '#5c3d7a',
      cols: 2,
    },
    center: {
      wall: colorHex,
      window: '#1a2430',
      sill: '#6a5a48',
      ground: '#3a3028',
      cols: 2,
    },
  }
  const p = presets[style]
  const map = texFromCanvas(
    `facade-${style}-${p.wall}`,
    makeFacadeCanvas({ ...p, wall: p.wall }),
  )
  return new THREE.MeshStandardMaterial({
    color: style === 'default' || style === 'center' ? colorHex : '#ffffff',
    map,
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

/** Apply UV so ~1 floor = 1 texture row, ~4m = 1 window column. */
export function applyBuildingUVs(
  geo: THREE.BufferGeometry,
  footprintWidth: number,
  footprintDepth: number,
  height: number,
  levels: number,
) {
  const uv = geo.attributes.uv
  if (!uv) return
  const floors = Math.max(1, levels || Math.round(height / 3.2))
  // Horizontal repeats: perimeter proxy / ~8m (2 windows ~ 4m each in tile)
  const peri = 2 * (footprintWidth + footprintDepth)
  const uScale = Math.max(1.2, peri / 16)
  const vScale = floors
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale)
  }
  uv.needsUpdate = true
}
