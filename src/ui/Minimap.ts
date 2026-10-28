import type { CityData, SpawnPoint } from '../types'

export interface MinimapPose {
  x: number
  z: number
  yaw: number
}

/**
 * Top-down HUD minimap: player-facing-up, landmarks, nearby cars, simplified city.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D
  private readonly range = 95
  private roads: CityData['roads']
  private buildings: CityData['buildings']
  private spawns: SpawnPoint[]

  constructor(
    private readonly canvas: HTMLCanvasElement,
    city: CityData,
  ) {
    this.ctx = canvas.getContext('2d')!
    this.roads = city.roads
    this.buildings = city.buildings
    this.spawns = city.spawns
    this.resize()
  }

  resize() {
    const size = Math.min(188, Math.floor(window.innerWidth * 0.28))
    const dpr = Math.min(window.devicePixelRatio, 2)
    this.canvas.width = Math.floor(size * dpr)
    this.canvas.height = Math.floor(size * dpr)
    this.canvas.style.width = `${size}px`
    this.canvas.style.height = `${size}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  draw(player: MinimapPose, cars: MinimapPose[]) {
    const ctx = this.ctx
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    const cx = w / 2
    const cy = h / 2
    const scale = (Math.min(w, h) * 0.46) / this.range

    ctx.clearRect(0, 0, w, h)

    // Round clip
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, Math.min(w, h) / 2 - 1, 0, Math.PI * 2)
    ctx.clip()

    ctx.fillStyle = '#152018'
    ctx.fillRect(0, 0, w, h)

    // Rotate so player yaw faces up (screen -Y)
    ctx.translate(cx, cy)
    ctx.rotate(-player.yaw)
    ctx.scale(scale, scale)
    ctx.translate(-player.x, -player.z)

    // Buildings (sampled)
    ctx.fillStyle = 'rgba(180, 150, 120, 0.55)'
    const step = Math.max(1, Math.floor(this.buildings.length / 700))
    for (let i = 0; i < this.buildings.length; i += step) {
      const b = this.buildings[i]
      if (b.footprint.length < 3) continue
      // Cull far footprints roughly
      const fx = b.footprint[0][0]
      const fz = b.footprint[0][1]
      if (Math.hypot(fx - player.x, fz - player.z) > this.range * 1.6) continue
      ctx.beginPath()
      ctx.moveTo(b.footprint[0][0], b.footprint[0][1])
      for (let j = 1; j < b.footprint.length; j++) {
        ctx.lineTo(b.footprint[j][0], b.footprint[j][1])
      }
      ctx.closePath()
      ctx.fill()
    }

    // Roads
    for (const road of this.roads) {
      if (road.path.length < 2) continue
      const mid = road.path[Math.floor(road.path.length / 2)]
      if (Math.hypot(mid[0] - player.x, mid[1] - player.z) > this.range * 1.7) continue
      const ped =
        road.kind === 'pedestrian' ||
        road.kind === 'footway' ||
        road.kind === 'path' ||
        road.kind === 'living_street'
      const major =
        road.kind === 'primary' ||
        road.kind === 'trunk' ||
        road.kind === 'secondary' ||
        road.kind === 'tertiary'
      ctx.strokeStyle = ped
        ? 'rgba(210, 190, 150, 0.9)'
        : major
          ? 'rgba(230, 230, 230, 0.85)'
          : 'rgba(150, 150, 150, 0.65)'
      ctx.lineWidth = (major ? road.width * 1.1 : ped ? road.width * 0.9 : road.width * 0.75) 
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(road.path[0][0], road.path[0][1])
      for (let i = 1; i < road.path.length; i++) {
        ctx.lineTo(road.path[i][0], road.path[i][1])
      }
      ctx.stroke()
    }

    // Landmark dots
    for (const spawn of this.spawns) {
      ctx.fillStyle = spawn.color
      ctx.beginPath()
      ctx.arc(spawn.x, spawn.z, 2.8, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 0.7
      ctx.stroke()
    }

    // Other cars
    ctx.fillStyle = '#c1121f'
    for (const car of cars) {
      if (Math.hypot(car.x - player.x, car.z - player.z) > this.range) continue
      ctx.save()
      ctx.translate(car.x, car.z)
      ctx.rotate(car.yaw)
      ctx.fillRect(-1.2, -2.2, 2.4, 4.4)
      ctx.restore()
    }

    ctx.restore()

    // Player arrow (screen-space, always up)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.fillStyle = '#f4d35e'
    ctx.strokeStyle = '#1a1208'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(7, 8)
    ctx.lineTo(0, 4)
    ctx.lineTo(-7, 8)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    // Ring border
    ctx.strokeStyle = 'rgba(212, 160, 23, 0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, Math.min(w, h) / 2 - 1, 0, Math.PI * 2)
    ctx.stroke()
  }
}
