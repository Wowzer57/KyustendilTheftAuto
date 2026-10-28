import * as THREE from 'three'
import type { CityData, GameMode, SpawnPoint } from '../types'
import { CityWorld } from '../world/CityWorld'
import { WalkController } from '../player/WalkController'
import { Car, carRight } from '../vehicle/Car'
import { Minimap } from '../ui/Minimap'

export type PauseAction = 'resume' | 'map' | 'menu'

export class Game {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private world: CityWorld
  private walker: WalkController
  private cars: Car[] = []
  private activeCar: Car | null = null
  private mode: GameMode = 'walk'
  private running = false
  private paused = false
  private last = 0
  private disposeFns: Array<() => void> = []
  private driveCam = new THREE.PerspectiveCamera(70, 1, 0.1, 1200)
  private readonly camOffset = new THREE.Vector3(0, 3.4, 8.2)
  private readonly lookTarget = new THREE.Vector3()
  private carInputDispose: (() => void) | null = null
  private minimap: Minimap
  private lastLocName = ''

  constructor(
    private readonly canvas: HTMLCanvasElement,
    city: CityData,
    private readonly hud: {
      setMode: (mode: GameMode) => void
      setPrompt: (text: string | null) => void
      setSpeed: (kmh: number | null) => void
      setLocation: (name: string) => void
      setPaused: (paused: boolean) => void
    },
    private readonly onLeave: (action: 'map' | 'menu') => void,
    minimapCanvas: HTMLCanvasElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight, false)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene.background = new THREE.Color(0x87a0b8)
    this.scene.fog = new THREE.Fog(0x87a0b8, 180, 520)

    const hemi = new THREE.HemisphereLight(0xe8f1ff, 0x3d4f3a, 0.85)
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.15)
    sun.position.set(120, 180, 60)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 10
    sun.shadow.camera.far = 500
    sun.shadow.camera.left = -200
    sun.shadow.camera.right = 200
    sun.shadow.camera.top = 200
    sun.shadow.camera.bottom = -200
    this.scene.add(hemi, sun)

    this.world = new CityWorld(city)
    this.scene.add(this.world.group)

    this.walker = new WalkController(
      this.world,
      window.innerWidth / window.innerHeight,
    )
    this.scene.add(this.walker.object)

    this.driveCam.aspect = window.innerWidth / window.innerHeight
    this.driveCam.updateProjectionMatrix()

    this.minimap = new Minimap(minimapCanvas, city)
    this.spawnCarsNearSpawns(city.spawns)

    const onResize = () => this.resize()
    window.addEventListener('resize', onResize)
    this.disposeFns.push(() => window.removeEventListener('resize', onResize))

    this.disposeFns.push(this.walker.attachInput(canvas))

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        this.togglePause()
        return
      }
      if (this.paused) return
      if (e.code === 'KeyE') this.tryEnterExit()
    }
    window.addEventListener('keydown', onKey)
    this.disposeFns.push(() => window.removeEventListener('keydown', onKey))
  }

  private placeCar(x: number, z: number, yaw: number, color: number): Car | null {
    const candidates: Array<[number, number]> = [[x, z]]
    for (let i = 0; i < 8; i++) {
      const a = yaw + (i * Math.PI) / 4
      candidates.push([x + Math.cos(a) * 6, z + Math.sin(a) * 6])
      candidates.push([x + Math.cos(a) * 10, z + Math.sin(a) * 10])
    }
    for (const [cx, cz] of candidates) {
      const resolved = this.world.resolveCollision(cx, cz, 1.8)
      const drift = Math.hypot(resolved.x - cx, resolved.z - cz)
      if (drift < 2.5) {
        const car = new Car(this.world, resolved.x, resolved.z, yaw, color)
        this.cars.push(car)
        this.scene.add(car.group)
        return car
      }
    }
    const fallback = this.world.resolveCollision(x, z, 1.8)
    const car = new Car(this.world, fallback.x, fallback.z, yaw, color)
    this.cars.push(car)
    this.scene.add(car.group)
    return car
  }

  private spawnCarsNearSpawns(spawns: SpawnPoint[]) {
    const colors = [0xc1121f, 0x0077b6, 0x2a9d8f, 0xe9c46a, 0x6d4c41]
    spawns.forEach((spawn, i) => {
      const yaw = (i * 0.9) % (Math.PI * 2)
      this.placeCar(spawn.x + 5, spawn.z + 5, yaw + Math.PI / 2, colors[i % colors.length])
    })
  }

  startAt(spawn: SpawnPoint) {
    this.walker.setSpawn(spawn.x, spawn.z + 3, 0)
    // Guaranteed car beside the player so enter/exit is discoverable
    this.placeCar(spawn.x + 4.5, spawn.z + 3, Math.PI / 2, 0xf4a261)
    this.hud.setLocation(spawn.name)
    this.setMode('walk')
    this.paused = false
    this.hud.setPaused(false)
    this.running = true
    this.last = performance.now()
    this.loop(this.last)
    setTimeout(() => {
      if (!this.paused) this.canvas.requestPointerLock()
    }, 250)
  }

  private setMode(mode: GameMode) {
    this.mode = mode
    this.hud.setMode(mode)
    if (mode === 'walk') {
      this.hud.setSpeed(null)
    }
  }

  private nearestCar(maxDist = 7): Car | null {
    const p = this.walker.position
    let best: Car | null = null
    let bestD = maxDist
    for (const car of this.cars) {
      const d = car.distanceTo(p.x, p.z)
      if (d < bestD) {
        bestD = d
        best = car
      }
    }
    return best
  }

  private tryEnterExit() {
    if (this.mode === 'walk') {
      const car = this.nearestCar()
      if (!car) return
      this.activeCar = car
      this.walker.exitPointerLock()
      this.walker.object.visible = false
      this.carInputDispose?.()
      this.carInputDispose = car.attachInput()
      this.setMode('drive')
      this.hud.setPrompt(null)
    } else if (this.activeCar) {
      const car = this.activeCar
      const right = carRight(car.yawAngle)
      const exitX = car.position.x + right.x * 2.8
      const exitZ = car.position.z + right.z * 2.8
      this.carInputDispose?.()
      this.carInputDispose = null
      car.speed = 0
      this.walker.setSpawn(exitX, exitZ, car.yawAngle)
      this.walker.object.visible = true
      this.activeCar = null
      this.setMode('walk')
      this.canvas.requestPointerLock()
    }
  }

  togglePause() {
    if (!this.running) return
    if (this.paused) this.resume()
    else this.pause()
  }

  pause() {
    if (this.paused) return
    this.paused = true
    this.walker.exitPointerLock()
    this.hud.setPaused(true)
    this.hud.setPrompt(null)
  }

  resume() {
    if (!this.paused) return
    this.paused = false
    this.hud.setPaused(false)
    this.last = performance.now()
    if (this.mode === 'walk') {
      this.canvas.requestPointerLock()
    }
  }

  handlePauseAction(action: PauseAction) {
    if (action === 'resume') {
      this.resume()
      return
    }
    this.stop()
    this.onLeave(action)
  }

  private resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.walker.camera.aspect = w / h
    this.walker.camera.updateProjectionMatrix()
    this.driveCam.aspect = w / h
    this.driveCam.updateProjectionMatrix()
    this.minimap.resize()
  }

  private playerPose(): { x: number; z: number; yaw: number } {
    if (this.mode === 'drive' && this.activeCar) {
      return {
        x: this.activeCar.position.x,
        z: this.activeCar.position.z,
        yaw: this.activeCar.yawAngle,
      }
    }
    return {
      x: this.walker.position.x,
      z: this.walker.position.z,
      yaw: this.walker.yawAngle,
    }
  }

  private updateOrientationHud() {
    const pose = this.playerPose()
    const name = this.world.nearestLandmarkName(pose.x, pose.z) ?? 'City Center'
    if (name !== this.lastLocName) {
      this.lastLocName = name
      this.hud.setLocation(name)
    }
    this.minimap.setZone('KYUSTENDIL', name)
    const carPoses = this.cars
      .filter((c) => c !== this.activeCar)
      .map((c) => ({
        x: c.position.x,
        z: c.position.z,
        yaw: c.yawAngle,
      }))
    this.minimap.draw(pose, carPoses)
  }

  private updatePrompt() {
    if (this.paused) {
      this.hud.setPrompt(null)
      return
    }
    if (this.mode === 'walk') {
      const car = this.nearestCar()
      this.hud.setPrompt(car ? 'Press E to enter vehicle' : null)
    } else {
      this.hud.setPrompt('Press E to exit vehicle')
    }
  }

  private updateDriveCamera() {
    if (!this.activeCar) return
    const car = this.activeCar
    const offset = this.camOffset
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), car.yawAngle)
    this.driveCam.position.set(
      car.position.x + offset.x,
      car.position.y + offset.y,
      car.position.z + offset.z,
    )
    this.lookTarget.set(car.position.x, 1.2, car.position.z)
    this.driveCam.lookAt(this.lookTarget)
  }

  private loop = (now: number) => {
    if (!this.running) return
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now

    if (!this.paused) {
      if (this.mode === 'walk') {
        this.walker.update(dt)
      } else if (this.activeCar) {
        this.activeCar.update(dt)
        this.updateDriveCamera()
        this.hud.setSpeed(this.activeCar.speedKmh)
      }
      this.updatePrompt()
      this.updateOrientationHud()
    } else {
      // Keep minimap/camera frozen but still paint last frame orientation once
      this.updateOrientationHud()
    }

    if (this.mode === 'walk') {
      this.renderer.render(this.scene, this.walker.camera)
    } else {
      this.renderer.render(this.scene, this.driveCam)
    }

    requestAnimationFrame(this.loop)
  }

  stop() {
    this.running = false
    this.paused = false
    this.hud.setPaused(false)
    this.walker.exitPointerLock()
    this.carInputDispose?.()
    this.carInputDispose = null
    for (const fn of this.disposeFns) fn()
    this.disposeFns = []
    this.renderer.dispose()
  }
}
