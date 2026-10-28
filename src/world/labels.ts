import * as THREE from 'three'

/** Billboard label for landmarks — always faces camera. */
export function createLandmarkLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // Pill background
  const padX = 28
  ctx.font = 'bold 42px "IBM Plex Sans", system-ui, sans-serif'
  const metrics = ctx.measureText(text)
  const textW = metrics.width
  const boxW = textW + padX * 2
  const boxH = 64
  const boxX = (canvas.width - boxW) / 2
  const boxY = (canvas.height - boxH) / 2

  ctx.fillStyle = 'rgba(12, 20, 16, 0.82)'
  roundRect(ctx, boxX, boxY, boxW, boxH, 12)
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  roundRect(ctx, boxX, boxY, boxW, boxH, 12)
  ctx.stroke()

  ctx.fillStyle = '#f2efe6'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(14, 3.5, 1)
  sprite.renderOrder = 10
  return sprite
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
