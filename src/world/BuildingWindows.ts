import * as THREE from 'three'
import type { Vec2 } from '../types'

export interface WindowPlacement {
  footprint: Vec2[]
  height: number
  levels: number
  area: number
}

const FRAME = 0xf2efe8
const GLASS = 0x1a222c
const SPACING = 4.2
const MAX_COLS = 7
const MAX_FLOORS = 5
/** How far windows sit inside the wall (avoids AABB pop-out). */
const INSET = 0.35

/**
 * Mesh windows placed along actual OSM footprint edges (not AABB),
 * inset toward the building interior so they sit in the wall.
 */
export class BuildingWindowBatch {
  private readonly frames: THREE.Matrix4[] = []
  private readonly glasses: THREE.Matrix4[] = []
  private readonly dummy = new THREE.Object3D()

  addBuilding(p: WindowPlacement) {
    if (p.height < 4 || p.area < 40) return
    const pts = openRing(p.footprint)
    if (pts.length < 3) return

    let cx = 0
    let cz = 0
    for (const [x, z] of pts) {
      cx += x
      cz += z
    }
    cx /= pts.length
    cz /= pts.length

    const floors = Math.min(MAX_FLOORS, Math.max(1, p.levels))
    const floorH = p.height / floors

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const ex = b[0] - a[0]
      const ez = b[1] - a[1]
      const len = Math.hypot(ex, ez)
      if (len < 4.5) continue

      // Outward normal (left of edge); flip so it points away from centroid
      let nx = -ez / len
      let nz = ex / len
      const mx = (a[0] + b[0]) / 2
      const mz = (a[1] + b[1]) / 2
      if (nx * (cx - mx) + nz * (cz - mz) > 0) {
        nx = -nx
        nz = -nz
      }

      // Skip edges that face almost entirely inward courtyards of huge footprints
      // (still decorate street/plaza edges)
      const cols = Math.min(MAX_COLS, Math.max(1, Math.floor(len / SPACING)))
      const margin = Math.min(1.4, len * 0.1)
      const usable = len - margin * 2
      if (usable < 1.4) continue

      const ux = ex / len
      const uz = ez / len
      // Face outward; position is inset inward from the wall
      const yaw = Math.atan2(nx, nz)

      for (let floor = 0; floor < floors; floor++) {
        const isGround = floor === 0
        const winH = isGround
          ? Math.min(2.2, floorH * 0.58)
          : Math.min(1.85, floorH * 0.48)
        const winW = Math.min(1.45, usable / cols - 0.55)
        if (winW < 0.65) continue
        const y = floor * floorH + (isGround ? 1.1 + winH / 2 : floorH * 0.52)

        for (let c = 0; c < cols; c++) {
          const t = margin + ((c + 0.5) / cols) * usable
          const x = a[0] + ux * t - nx * INSET
          const z = a[1] + uz * t - nz * INSET

          this.push(this.frames, x, y, z, yaw, winW + 0.22, winH + 0.22, 0.1)
          this.push(this.glasses, x, y, z, yaw, winW, winH, 0.06)
        }
      }
    }
  }

  private push(
    list: THREE.Matrix4[],
    x: number,
    y: number,
    z: number,
    yaw: number,
    w: number,
    h: number,
    depth: number,
  ) {
    this.dummy.position.set(x, y, z)
    this.dummy.rotation.set(0, yaw, 0)
    this.dummy.scale.set(w, h, depth)
    this.dummy.updateMatrix()
    list.push(this.dummy.matrix.clone())
  }

  build(parent: THREE.Group) {
    if (this.frames.length === 0) return

    const frameGeo = new THREE.BoxGeometry(1, 1, 1)
    const glassGeo = new THREE.BoxGeometry(1, 1, 1)
    const frameMat = new THREE.MeshStandardMaterial({
      color: FRAME,
      roughness: 0.75,
      metalness: 0.05,
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: GLASS,
      roughness: 0.35,
      metalness: 0.15,
    })

    const frameMesh = new THREE.InstancedMesh(frameGeo, frameMat, this.frames.length)
    const glassMesh = new THREE.InstancedMesh(glassGeo, glassMat, this.glasses.length)
    frameMesh.castShadow = false
    frameMesh.receiveShadow = false
    glassMesh.castShadow = false
    glassMesh.receiveShadow = false
    frameMesh.frustumCulled = true
    glassMesh.frustumCulled = true

    for (let i = 0; i < this.frames.length; i++) {
      frameMesh.setMatrixAt(i, this.frames[i])
    }
    for (let i = 0; i < this.glasses.length; i++) {
      glassMesh.setMatrixAt(i, this.glasses[i])
    }
    frameMesh.instanceMatrix.needsUpdate = true
    glassMesh.instanceMatrix.needsUpdate = true

    parent.add(frameMesh, glassMesh)
  }
}

function openRing(ring: Vec2[]): Vec2[] {
  if (ring.length < 2) return []
  const pts = ring.slice(0, -1)
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.5) {
    return ring.slice()
  }
  return pts
}

export function footprintArea(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): number {
  return Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ)
}
