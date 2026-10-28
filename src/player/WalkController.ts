import * as THREE from 'three'
import type { CityWorld } from '../world/CityWorld'

const EYE_HEIGHT = 1.7
const SPEED = 7.5
const SPRINT = 12
const RADIUS = 0.4

export class WalkController {
  readonly camera: THREE.PerspectiveCamera
  readonly object = new THREE.Object3D()
  private readonly direction = new THREE.Vector3()
  private readonly keys = new Set<string>()
  private yaw = 0
  private pitch = 0
  private locked = false

  constructor(
    private readonly world: CityWorld,
    aspect: number,
  ) {
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1200)
    this.object.add(this.camera)
    this.camera.position.set(0, EYE_HEIGHT, 0)
  }

  setSpawn(x: number, z: number, facingYaw = 0) {
    // Prefer nearby open ground so spawns are not buried in building footprints
    let best = this.world.resolveCollision(x, z, RADIUS)
    let bestScore = Math.hypot(best.x - x, best.z - z)
    for (let ring = 2; ring <= 16; ring += 2) {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4
        const tx = x + Math.cos(a) * ring
        const tz = z + Math.sin(a) * ring
        const resolved = this.world.resolveCollision(tx, tz, RADIUS)
        const drift = Math.hypot(resolved.x - tx, resolved.z - tz)
        const score = drift + ring * 0.05
        if (drift < 0.15 && score < bestScore) {
          best = resolved
          bestScore = score
        }
      }
    }
    this.object.position.set(best.x, 0, best.z)
    this.yaw = facingYaw
    this.pitch = 0
    this.syncRotation()
  }

  attachInput(target: HTMLElement) {
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys.add(e.code)
      if (e.code === 'KeyR' && !this.locked) {
        target.requestPointerLock()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code)
    const onMove = (e: MouseEvent) => {
      if (!this.locked) return
      this.yaw -= e.movementX * 0.0022
      this.pitch -= e.movementY * 0.0022
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch))
      this.syncRotation()
    }
    const onLockChange = () => {
      this.locked = document.pointerLockElement === target
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('pointerlockchange', onLockChange)

    target.addEventListener('click', () => {
      if (!this.locked) target.requestPointerLock()
    })

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('pointerlockchange', onLockChange)
    }
  }

  private syncRotation() {
    this.object.rotation.y = this.yaw
    this.camera.rotation.x = this.pitch
  }

  get yawAngle() {
    return this.yaw
  }

  get position() {
    return this.object.position
  }

  update(dt: number) {
    if (!this.locked) return

    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'))
    const back = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'))
    const left = Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
    const right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight'))

    this.direction.set(right - left, 0, back - forward)
    if (this.direction.lengthSq() > 0) {
      this.direction.normalize()
      const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? SPRINT : SPEED
      const move = this.direction
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)
        .multiplyScalar(speed * dt)

      let x = this.object.position.x + move.x
      let z = this.object.position.z + move.z
      // Axis-separated resolution for smoother sliding
      const rx = this.world.resolveCollision(x, this.object.position.z, RADIUS)
      x = rx.x
      const rz = this.world.resolveCollision(x, z, RADIUS)
      x = rz.x
      z = rz.z
      this.object.position.set(x, 0, z)
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }
}
