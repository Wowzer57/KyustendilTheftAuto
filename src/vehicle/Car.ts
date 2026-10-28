import * as THREE from 'three'
import type { CityWorld } from '../world/CityWorld'

const MAX_SPEED = 28
const ACCEL = 18
const BRAKE = 28
const DRAG = 4
const TURN_RATE = 2.1
const CAR_RADIUS = 1.6

/** Forward in local car space is −Z (Three.js convention). */
export function carForward(yaw: number): { x: number; z: number } {
  return {
    x: -Math.sin(yaw),
    z: -Math.cos(yaw),
  }
}

/** Right vector for exiting beside the car. */
export function carRight(yaw: number): { x: number; z: number } {
  return {
    x: Math.cos(yaw),
    z: -Math.sin(yaw),
  }
}

export class Car {
  readonly group = new THREE.Group()
  readonly cameraPivot = new THREE.Object3D()
  speed = 0
  private yaw = 0
  private readonly keys = new Set<string>()

  constructor(
    private readonly world: CityWorld,
    x: number,
    z: number,
    yaw = 0,
    color = 0xc1121f,
  ) {
    this.yaw = yaw
    this.group.position.set(x, 0, z)
    this.group.rotation.y = yaw
    this.buildMesh(color)
    // Chase pivot sits behind the car (+Z local while forward is −Z)
    this.cameraPivot.position.set(0, 3.2, 7.5)
    this.group.add(this.cameraPivot)
  }

  private buildMesh(color: number) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.7, 4.2),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 }),
    )
    body.position.y = 0.55
    body.castShadow = true

    // Cabin toward +Z (rear) so the nose faces −Z / forward
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.65, 2.1),
      new THREE.MeshStandardMaterial({
        color: 0x1b2630,
        roughness: 0.3,
        metalness: 0.4,
      }),
    )
    cabin.position.set(0, 1.15, 0.35)
    cabin.castShadow = true

    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.25, 1.1),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 }),
    )
    hood.position.set(0, 0.95, -1.35)
    hood.castShadow = true

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 12)
    const spots: Array<[number, number, number]> = [
      [-0.95, 0.35, 1.3],
      [0.95, 0.35, 1.3],
      [-0.95, 0.35, -1.3],
      [0.95, 0.35, -1.3],
    ]
    for (const [wx, wy, wz] of spots) {
      const w = new THREE.Mesh(wheelGeo, wheelMat)
      w.rotation.z = Math.PI / 2
      w.position.set(wx, wy, wz)
      w.castShadow = true
      this.group.add(w)
    }

    this.group.add(body, cabin, hood)
  }

  attachInput() {
    const onKeyDown = (e: KeyboardEvent) => this.keys.add(e.code)
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }

  get position() {
    return this.group.position
  }

  get yawAngle() {
    return this.yaw
  }

  distanceTo(x: number, z: number) {
    return Math.hypot(this.group.position.x - x, this.group.position.z - z)
  }

  update(dt: number) {
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      // Gas: accelerate forward (positive speed)
      this.speed += ACCEL * dt
    } else if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      // Brake / reverse: slow down, then go backward
      if (this.speed > 0.5) this.speed -= BRAKE * dt
      else this.speed -= ACCEL * 0.7 * dt
    } else {
      if (this.speed > 0) this.speed = Math.max(0, this.speed - DRAG * dt)
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + DRAG * dt)
    }
    this.speed = Math.max(-MAX_SPEED * 0.4, Math.min(MAX_SPEED, this.speed))

    const left = Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
    const right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight'))
    if (Math.abs(this.speed) > 0.4) {
      const steer = (left - right) * TURN_RATE * dt * Math.sign(this.speed)
      this.yaw += steer
    }

    const fwd = carForward(this.yaw)
    const dx = fwd.x * this.speed * dt
    const dz = fwd.z * this.speed * dt
    let x = this.group.position.x + dx
    let z = this.group.position.z + dz
    const resolved = this.world.resolveCollision(x, z, CAR_RADIUS)
    if (Math.hypot(resolved.x - x, resolved.z - z) > 0.01) {
      this.speed *= 0.35
    }
    this.group.position.set(resolved.x, 0, resolved.z)
    this.group.rotation.y = this.yaw
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6
  }
}
