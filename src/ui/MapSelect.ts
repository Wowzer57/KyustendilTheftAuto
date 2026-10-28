import type { SpawnPoint } from '../types'

export interface MapSelectOptions {
  root: HTMLElement
  spawns: SpawnPoint[]
  onBack: () => void
  onStart: (spawn: SpawnPoint) => void
}

/**
 * 2D top-down stylized map with pan/zoom and clickable spawn markers.
 * Coordinates map from world XZ meters into canvas space.
 */
export class MapSelect {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private markersEl: HTMLElement
  private selectionEl: HTMLElement
  private playBtn: HTMLButtonElement
  private selected: SpawnPoint | null = null
  private scale = 0.55
  private panX = 0
  private panY = 0
  private dragging = false
  private lastX = 0
  private lastY = 0
  private roads: Array<{ path: [number, number][]; width: number; kind: string }> = []
  private buildings: Array<{ footprint: [number, number][] }> = []
  private disposeFns: Array<() => void> = []

  constructor(private readonly opts: MapSelectOptions) {
    this.opts.root.innerHTML = `
      <div class="map-header">
        <div>
          <h2>Kyustendil Center</h2>
          <p>Drag to pan · scroll to zoom · pick a spawn</p>
        </div>
        <button type="button" class="btn" data-action="back">Back</button>
      </div>
      <div class="map-stage-wrap" id="map-stage">
        <canvas id="city-map"></canvas>
        <div id="map-markers"></div>
      </div>
      <div class="map-footer">
        <div class="selection" id="map-selection">No spawn selected</div>
        <button type="button" class="btn btn-primary" id="map-play" disabled>Spawn here</button>
      </div>
    `

    this.canvas = this.opts.root.querySelector('#city-map') as HTMLCanvasElement
    this.ctx = this.canvas.getContext('2d')!
    this.markersEl = this.opts.root.querySelector('#map-markers') as HTMLElement
    this.selectionEl = this.opts.root.querySelector('#map-selection') as HTMLElement
    this.playBtn = this.opts.root.querySelector('#map-play') as HTMLButtonElement

    this.opts.root.querySelector('[data-action="back"]')!.addEventListener('click', () => {
      this.opts.onBack()
    })
    this.playBtn.addEventListener('click', () => {
      if (this.selected) this.opts.onStart(this.selected)
    })

    this.bindGestures()
    this.fitToSpawns()
    this.renderMarkers()
    this.resize()
    this.draw()
  }

  setCityPreview(data: {
    roads: Array<{ path: [number, number][]; width: number; kind: string }>
    buildings: Array<{ footprint: [number, number][] }>
  }) {
    this.roads = data.roads
    this.buildings = data.buildings
    this.draw()
  }

  private fitToSpawns() {
    if (!this.opts.spawns.length) return
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const s of this.opts.spawns) {
      minX = Math.min(minX, s.x)
      maxX = Math.max(maxX, s.x)
      minZ = Math.min(minZ, s.z)
      maxZ = Math.max(maxZ, s.z)
    }
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    this.panX = -cx
    this.panY = -cz
    this.scale = 0.7
  }

  private worldToScreen(x: number, z: number) {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    return {
      sx: w / 2 + (x + this.panX) * this.scale,
      sy: h / 2 + (z + this.panY) * this.scale,
    }
  }

  private renderMarkers() {
    this.markersEl.innerHTML = ''
    for (const spawn of this.opts.spawns) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'map-marker'
      btn.dataset.id = spawn.id
      btn.innerHTML = `<span class="pin" style="background:${spawn.color}"></span><span class="label">${spawn.name}</span>`
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.select(spawn)
      })
      this.markersEl.appendChild(btn)
    }
    this.layoutMarkers()
  }

  private layoutMarkers() {
    const buttons = this.markersEl.querySelectorAll<HTMLButtonElement>('.map-marker')
    for (const btn of buttons) {
      const spawn = this.opts.spawns.find((s) => s.id === btn.dataset.id)
      if (!spawn) continue
      const { sx, sy } = this.worldToScreen(spawn.x, spawn.z)
      btn.style.left = `${sx}px`
      btn.style.top = `${sy}px`
      btn.classList.toggle('selected', this.selected?.id === spawn.id)
    }
  }

  private select(spawn: SpawnPoint) {
    this.selected = spawn
    this.selectionEl.innerHTML = `Selected: <strong>${spawn.name}</strong>`
    this.playBtn.disabled = false
    this.layoutMarkers()
  }

  private bindGestures() {
    const onPointerDown = (e: PointerEvent) => {
      this.dragging = true
      this.canvas.classList.add('dragging')
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.canvas.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!this.dragging) return
      const dx = e.clientX - this.lastX
      const dy = e.clientY - this.lastY
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.panX += dx / this.scale
      this.panY += dy / this.scale
      this.draw()
      this.layoutMarkers()
    }
    const onPointerUp = (e: PointerEvent) => {
      this.dragging = false
      this.canvas.classList.remove('dragging')
      try {
        this.canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      this.scale = Math.max(0.2, Math.min(3.5, this.scale * factor))
      this.draw()
      this.layoutMarkers()
    }
    const onResize = () => {
      this.resize()
      this.draw()
      this.layoutMarkers()
    }

    this.canvas.addEventListener('pointerdown', onPointerDown)
    this.canvas.addEventListener('pointermove', onPointerMove)
    this.canvas.addEventListener('pointerup', onPointerUp)
    this.canvas.addEventListener('pointercancel', onPointerUp)
    this.canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('resize', onResize)

    this.disposeFns.push(() => {
      this.canvas.removeEventListener('pointerdown', onPointerDown)
      this.canvas.removeEventListener('pointermove', onPointerMove)
      this.canvas.removeEventListener('pointerup', onPointerUp)
      this.canvas.removeEventListener('pointercancel', onPointerUp)
      this.canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
    })
  }

  private resize() {
    const wrap = this.canvas.parentElement!
    const dpr = Math.min(window.devicePixelRatio, 2)
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    this.canvas.width = Math.floor(w * dpr)
    this.canvas.height = Math.floor(h * dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private draw() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    const ctx = this.ctx
    ctx.clearRect(0, 0, w, h)

    // Atmosphere wash
    const grad = ctx.createRadialGradient(w * 0.55, h * 0.4, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.7)
    grad.addColorStop(0, '#24352a')
    grad.addColorStop(1, '#0e1612')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    const to = (x: number, z: number) => this.worldToScreen(x, z)

    // Buildings (sampled for perf on map preview)
    ctx.fillStyle = 'rgba(196, 164, 132, 0.55)'
    const step = Math.max(1, Math.floor(this.buildings.length / 900))
    for (let i = 0; i < this.buildings.length; i += step) {
      const b = this.buildings[i]
      if (b.footprint.length < 3) continue
      ctx.beginPath()
      const p0 = to(b.footprint[0][0], b.footprint[0][1])
      ctx.moveTo(p0.sx, p0.sy)
      for (let j = 1; j < b.footprint.length; j++) {
        const p = to(b.footprint[j][0], b.footprint[j][1])
        ctx.lineTo(p.sx, p.sy)
      }
      ctx.closePath()
      ctx.fill()
    }

    // Roads
    for (const road of this.roads) {
      if (road.path.length < 2) continue
      const ped =
        road.kind === 'pedestrian' || road.kind === 'footway' || road.kind === 'path'
      ctx.strokeStyle = ped ? 'rgba(210, 190, 150, 0.85)' : 'rgba(210, 210, 210, 0.7)'
      ctx.lineWidth = Math.max(1.2, road.width * this.scale * 0.35)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      const p0 = to(road.path[0][0], road.path[0][1])
      ctx.moveTo(p0.sx, p0.sy)
      for (let i = 1; i < road.path.length; i++) {
        const p = to(road.path[i][0], road.path[i][1])
        ctx.lineTo(p.sx, p.sy)
      }
      ctx.stroke()
    }

    // Soft origin crosshair
    const o = to(0, 0)
    ctx.strokeStyle = 'rgba(212, 160, 23, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(o.sx - 12, o.sy)
    ctx.lineTo(o.sx + 12, o.sy)
    ctx.moveTo(o.sx, o.sy - 12)
    ctx.lineTo(o.sx, o.sy + 12)
    ctx.stroke()
  }

  destroy() {
    for (const fn of this.disposeFns) fn()
    this.disposeFns = []
    this.opts.root.innerHTML = ''
  }
}
