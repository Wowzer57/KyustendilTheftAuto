import * as THREE from 'three'

export interface WindowPlacement {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  height: number
  levels: number
  area: number
}

const FRAME = 0xf2efe8
const GLASS = 0x1a222c
const SPACING = 3.8
const MAX_COLS = 8
const MAX_FLOORS = 5

/**
 * Collect Obshtina-style window transforms for an AABB building,
 * then bake into two InstancedMeshes (frame + glass).
 */
export class BuildingWindowBatch {
  private readonly frames: THREE.Matrix4[] = []
  private readonly glasses: THREE.Matrix4[] = []
  private readonly dummy = new THREE.Object3D()

  addBuilding(p: WindowPlacement) {
    if (p.height < 4 || p.area < 40) return
    const w = p.maxX - p.minX
    const d = p.maxZ - p.minZ
    if (w < 3 || d < 3) return

    const floors = Math.min(MAX_FLOORS, Math.max(1, p.levels))
    const floorH = p.height / floors

    // Four sides: +Z, -Z, +X, -X (outward)
    this.addSide(p.minX, p.maxX, p.maxZ, 0, floors, floorH, 'z+', w)
    this.addSide(p.minX, p.maxX, p.minZ, Math.PI, floors, floorH, 'z-', w)
    this.addSide(p.minZ, p.maxZ, p.maxX, -Math.PI / 2, floors, floorH, 'x+', d)
    this.addSide(p.minZ, p.maxZ, p.minX, Math.PI / 2, floors, floorH, 'x-', d)
  }

  private addSide(
    alongMin: number,
    alongMax: number,
    fixed: number,
    yaw: number,
    floors: number,
    floorH: number,
    side: 'z+' | 'z-' | 'x+' | 'x-',
    sideLen: number,
  ) {
    const cols = Math.min(MAX_COLS, Math.max(1, Math.floor(sideLen / SPACING)))
    const span = alongMax - alongMin
    const margin = Math.min(1.2, span * 0.08)
    const usable = span - margin * 2
    if (usable < 1.2) return

    for (let floor = 0; floor < floors; floor++) {
      const isGround = floor === 0
      const winH = isGround ? Math.min(2.4, floorH * 0.62) : Math.min(2.0, floorH * 0.52)
      const winW = Math.min(1.6, usable / cols - 0.45)
      if (winW < 0.7) continue
      const y = floor * floorH + (isGround ? 1.15 + winH / 2 : floorH * 0.55)

      for (let c = 0; c < cols; c++) {
        const t = (c + 0.5) / cols
        const along = alongMin + margin + t * usable
        let x = 0
        let z = 0
        const inset = 0.08
        if (side === 'z+' || side === 'z-') {
          x = along
          z = fixed + (side === 'z+' ? inset : -inset)
        } else {
          z = along
          x = fixed + (side === 'x+' ? inset : -inset)
        }

        // Frame (slightly larger)
        this.push(this.frames, x, y, z, yaw, winW + 0.28, winH + 0.28, 0.14)
        // Glass
        this.push(this.glasses, x, y, z, yaw, winW, winH, 0.08)
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

export function footprintArea(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): number {
  return Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ)
}
