import type { CityData, SpawnPoint } from '../types'

export interface MinimapPose {
  x: number
  z: number
  yaw: number
}

/**
 * FiveM / GTA-style circular radar for Kyustendil.
 * Player-facing-up, OSM roads, landmark letter blips, north marker, zone strip.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D
  private readonly range = 110
  private roads: CityData['roads']
  private buildings: CityData['buildings']
  private plazas: CityData['plazas']
  private spawns: SpawnPoint[]
  private zoneName = 'KYUSTENDIL'
  private streetHint = 'City Center'

  constructor(
    private readonly canvas: HTMLCanvasElement,
    city: CityData,
  ) {
    this.ctx = canvas.getContext('2d')!
    this.roads = city.roads
    this.buildings = city.buildings
    this.plazas = city.plazas || []
    this.spawns = city.spawns
    this.resize()
  }

  setZone(zone: string, street: string) {
    this.zoneName = zone
    this.streetHint = street
  }

  resize() {
    // Radar disc + zone strip below
    const size = Math.min(210, Math.max(160, Math.floor(window.innerWidth * 0.2)))
    const strip = 36
    const dpr = Math.min(window.devicePixelRatio, 2)
    this.canvas.width = Math.floor(size * dpr)
    this.canvas.height = Math.floor((size + strip) * dpr)
    this.canvas.style.width = `${size}px`
    this.canvas.style.height = `${size + strip}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  draw(player: MinimapPose, cars: MinimapPose[]) {
    const ctx = this.ctx
    const w = this.canvas.clientWidth
    const totalH = this.canvas.clientHeight
    const strip = 36
    const h = totalH - strip
    const cx = w / 2
    const cy = h / 2
    const radius = Math.min(w, h) / 2 - 3
    const scale = (radius * 0.92) / this.range

    ctx.clearRect(0, 0, w, totalH)

    // --- Radar disc ---
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.clip()

    // GTA-like dark radar wash
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius)
    grad.addColorStop(0, '#1c2a22')
    grad.addColorStop(1, '#0b1210')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    ctx.translate(cx, cy)
    ctx.rotate(-player.yaw)
    ctx.scale(scale, scale)
    ctx.translate(-player.x, -player.z)

    // Building footprints (dark blocks)
    ctx.fillStyle = 'rgba(55, 62, 58, 0.95)'
    const step = Math.max(1, Math.floor(this.buildings.length / 650))
    for (let i = 0; i < this.buildings.length; i += step) {
      const b = this.buildings[i]
      if (b.footprint.length < 3) continue
      const fx = b.footprint[0][0]
      const fz = b.footprint[0][1]
      if (Math.hypot(fx - player.x, fz - player.z) > this.range * 1.55) continue
      ctx.beginPath()
      ctx.moveTo(b.footprint[0][0], b.footprint[0][1])
      for (let j = 1; j < b.footprint.length; j++) {
        ctx.lineTo(b.footprint[j][0], b.footprint[j][1])
      }
      ctx.closePath()
      ctx.fill()
    }

    // Plazas
    ctx.fillStyle = 'rgba(160, 150, 130, 0.35)'
    for (const plaza of this.plazas) {
      if (plaza.footprint.length < 3) continue
      ctx.beginPath()
      ctx.moveTo(plaza.footprint[0][0], plaza.footprint[0][1])
      for (let j = 1; j < plaza.footprint.length; j++) {
        ctx.lineTo(plaza.footprint[j][0], plaza.footprint[j][1])
      }
      ctx.closePath()
      ctx.fill()
    }

    // Roads — FiveM style: thick light roads, yellow majors
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const road of this.roads) {
      if (road.path.length < 2) continue
      const mid = road.path[Math.floor(road.path.length / 2)]
      if (Math.hypot(mid[0] - player.x, mid[1] - player.z) > this.range * 1.7) continue
      const ped =
        road.kind === 'pedestrian' ||
        road.kind === 'footway' ||
        road.kind === 'path' ||
        road.kind === 'steps'
      const major =
        road.kind === 'primary' ||
        road.kind === 'trunk' ||
        road.kind === 'secondary'
      const tertiary = road.kind === 'tertiary'

      if (ped) {
        ctx.strokeStyle = 'rgba(190, 175, 145, 0.55)'
        ctx.lineWidth = road.width * 0.7
      } else if (major) {
        ctx.strokeStyle = '#e8c84a'
        ctx.lineWidth = road.width * 1.15
      } else if (tertiary) {
        ctx.strokeStyle = '#d8d8d0'
        ctx.lineWidth = road.width * 1.0
      } else {
        ctx.strokeStyle = '#c8c8c0'
        ctx.lineWidth = road.width * 0.85
      }

      ctx.beginPath()
      ctx.moveTo(road.path[0][0], road.path[0][1])
      for (let i = 1; i < road.path.length; i++) {
        ctx.lineTo(road.path[i][0], road.path[i][1])
      }
      ctx.stroke()
    }

    // Landmark blips (letter icons)
    for (const spawn of this.spawns) {
      this.drawBlipWorld(ctx, spawn.x, spawn.z, spawn.color, spawn.blip || '?')
    }

    // Nearby cars as small red diamonds
    for (const car of cars) {
      if (Math.hypot(car.x - player.x, car.z - player.z) > this.range) continue
      ctx.save()
      ctx.translate(car.x, car.z)
      ctx.rotate(car.yaw)
      ctx.fillStyle = '#ff3b3b'
      ctx.beginPath()
      ctx.moveTo(0, -2.4)
      ctx.lineTo(1.5, 2.2)
      ctx.lineTo(0, 1.2)
      ctx.lineTo(-1.5, 2.2)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    ctx.restore()

    // Soft vignette edge
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.clip()
    const vig = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // Outer ring (FiveM chrome-ish)
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(220, 220, 220, 0.55)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.lineWidth = 2
    ctx.stroke()

    // North indicator — geographic N stays correct as the radar rotates
    {
      const nx = Math.sin(player.yaw) * (radius - 14)
      const ny = -Math.cos(player.yaw) * (radius - 14)
      ctx.save()
      ctx.translate(cx + nx, cy + ny)
      ctx.fillStyle = '#e74c3c'
      ctx.beginPath()
      ctx.moveTo(0, -6)
      ctx.lineTo(4.5, 5)
      ctx.lineTo(0, 2)
      ctx.lineTo(-4.5, 5)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px "IBM Plex Sans", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('N', 0, 1)
      ctx.restore()
    }

    // Player arrow (always up) — FiveM-like cyan
    ctx.save()
    ctx.translate(cx, cy)
    ctx.fillStyle = '#5ad1ff'
    ctx.strokeStyle = '#041018'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, -10)
    ctx.lineTo(7, 9)
    ctx.lineTo(0, 5)
    ctx.lineTo(-7, 9)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    // --- Zone strip (under radar) ---
    const sy = h + 2
    ctx.fillStyle = 'rgba(8, 12, 10, 0.82)'
    ctx.fillRect(4, sy, w - 8, strip - 4)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.strokeRect(4.5, sy + 0.5, w - 9, strip - 5)

    ctx.fillStyle = '#f2efe6'
    ctx.font = 'bold 11px "IBM Plex Sans", system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.zoneName, 14, sy + (strip - 4) / 2 - 5)

    ctx.fillStyle = 'rgba(200, 210, 200, 0.75)'
    ctx.font = '10px "IBM Plex Sans", system-ui, sans-serif'
    const hint =
      this.streetHint.length > 28 ? `${this.streetHint.slice(0, 27)}…` : this.streetHint
    ctx.fillText(hint, 14, sy + (strip - 4) / 2 + 8)
  }

  private drawBlipWorld(
    ctx: CanvasRenderingContext2D,
    x: number,
    z: number,
    color: string,
    letter: string,
  ) {
    ctx.save()
    ctx.translate(x, z)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(0, 0, 3.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 0.75
    ctx.stroke()
    ctx.fillStyle = '#111'
    ctx.font = 'bold 3.4px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(letter, 0, 0.25)
    ctx.restore()
  }
}
