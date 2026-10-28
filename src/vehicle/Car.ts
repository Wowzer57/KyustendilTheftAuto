import * as THREE from 'three'
import type { CityWorld } from '../world/CityWorld'

const MAX_SPEED = 28
const ACCEL = 18
const BRAKE = 28
const DRAG = 4
const TURN_RATE = 2.1
const CAR_RADIUS = 1.6

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

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.65, 2.1),
      new THREE.MeshStandardMaterial({
        color: 0x1b2630,
        roughness: 0.3,
        metalness: 0.4,
      }),
    )
    cabin.position.set(0, 1.15, -0.2)
    cabin.castShadow = true

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 12)
    const wheels: THREE.Mesh[] = []
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
      wheels.push(w)
      this.group.add(w)
    }

    this.group.add(body, cabin)
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
    const throttle = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'))
    const brake = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'))
    const left = Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
    const right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight'))

    if (throttle) this.speed += ACCEL * dt
    if (brake) this.speed -= BRAKE * dt
    if (!throttle && !brake) {
      if (this.speed > 0) this.speed = Math.max(0, this.speed - DRAG * dt)
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + DRAG * dt)
    }
    this.speed = Math.max(-MAX_SPEED * 0.4, Math.min(MAX_SPEED, this.speed))

    if (Math.abs(this.speed) > 0.4) {
      const steer = (left - right) * TURN_RATE * dt * Math.sign(this.speed)
      this.yaw += steer
    }

    const dx = Math.sin(this.yaw) * this.speed * dt
    const dz = Math.cos(this.yaw) * this.speed * dt
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
