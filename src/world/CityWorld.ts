import * as THREE from 'three'
import type { CityData, SpawnPoint, Vec2 } from '../types'

export interface Collider {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  height: number
}

function shapeFromRing(ring: Vec2[]): THREE.Shape | null {
  if (ring.length < 4) return null
  // ExtrudeGeometry/ShapeGeometry live in XY, then we rotateX(-π/2) so shapeY → -worldZ.
  // Feed shapeY = -worldZ so buildings/parks land on the same XZ as roads + colliders.
  // Reverse winding after the Y flip so extruded normals still face outward.
  const pts: Vec2[] = ring.map(([x, z]) => [x, -z])
  pts.reverse()
  const shape = new THREE.Shape()
  shape.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1])
  }
  return shape
}

function roadRibbon(path: Vec2[], width: number): THREE.BufferGeometry | null {
  if (path.length < 2) return null
  const half = width * 0.5
  const left: THREE.Vector3[] = []
  const right: THREE.Vector3[] = []

  for (let i = 0; i < path.length; i++) {
    const curr = path[i]
    const prev = path[Math.max(0, i - 1)]
    const next = path[Math.min(path.length - 1, i + 1)]
    const dx = next[0] - prev[0]
    const dz = next[1] - prev[1]
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    left.push(new THREE.Vector3(curr[0] + nx * half, 0.04, curr[1] + nz * half))
    right.push(new THREE.Vector3(curr[0] - nx * half, 0.04, curr[1] - nz * half))
  }

  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i < path.length; i++) {
    positions.push(left[i].x, left[i].y, left[i].z)
    positions.push(right[i].x, right[i].y, right[i].z)
  }
  for (let i = 0; i < path.length - 1; i++) {
    const a = i * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    indices.push(a, b, c, b, d, c)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

export class CityWorld {
  readonly group = new THREE.Group()
  readonly colliders: Collider[] = []
  readonly spawns: SpawnPoint[]
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number }

  constructor(private readonly city: CityData) {
    this.spawns = city.spawns
    this.bounds = this.computeBounds()
    this.buildGround()
    this.buildParks()
    this.buildWater()
    this.buildRoads()
    this.buildBuildings()
    this.addLandmarkMarkers()
  }

  private computeBounds() {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    const push = (x: number, z: number) => {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    for (const b of this.city.buildings) {
      for (const [x, z] of b.footprint) push(x, z)
    }
    for (const r of this.city.roads) {
      for (const [x, z] of r.path) push(x, z)
    }
    if (!Number.isFinite(minX)) {
      return { minX: -400, maxX: 400, minZ: -400, maxZ: 400 }
    }
    return { minX, maxX, minZ, maxZ }
  }

  private buildGround() {
    const { minX, maxX, minZ, maxZ } = this.bounds
    const pad = 80
    const w = maxX - minX + pad * 2
    const d = maxZ - minZ + pad * 2
    const geo = new THREE.PlaneGeometry(w, d)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3d4f3a,
      roughness: 1,
      metalness: 0,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2)
    mesh.receiveShadow = true
    this.group.add(mesh)
  }

  private buildParks() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4f7a45,
      roughness: 1,
    })
    for (const park of this.city.parks) {
      const shape = shapeFromRing(park.footprint)
      if (!shape) continue
      const geo = new THREE.ShapeGeometry(shape)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0.02
      this.group.add(mesh)
    }
  }

  private buildWater() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a7ca5,
      roughness: 0.35,
      metalness: 0.1,
    })
    for (const area of this.city.water) {
      const shape = shapeFromRing(area.footprint)
      if (!shape) continue
      const geo = new THREE.ShapeGeometry(shape)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0.03
      this.group.add(mesh)
    }
  }

  private buildRoads() {
    const asphalt = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      roughness: 0.9,
    })
    const pedestrian = new THREE.MeshStandardMaterial({
      color: 0xb5a789,
      roughness: 0.95,
    })

    for (const road of this.city.roads) {
      const geo = roadRibbon(road.path, road.width)
      if (!geo) continue
      const isPed =
        road.kind === 'pedestrian' ||
        road.kind === 'footway' ||
        road.kind === 'path' ||
        road.kind === 'living_street'
      const mesh = new THREE.Mesh(geo, isPed ? pedestrian : asphalt)
      mesh.position.y = 0.02
      mesh.receiveShadow = true
      this.group.add(mesh)
    }
  }

  private buildBuildings() {
    // Merge by color buckets for fewer draw calls
    const buckets = new Map<string, BuildingDataBucket>()

    for (const b of this.city.buildings) {
      let bucket = buckets.get(b.color)
      if (!bucket) {
        bucket = { color: b.color, meshes: [] }
        buckets.set(b.color, bucket)
      }
      const shape = shapeFromRing(b.footprint)
      if (!shape) continue
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: b.height,
        bevelEnabled: false,
      })
      // Shape is in X/Y; extrude goes +Z. Rotate to stand on XZ ground.
      geo.rotateX(-Math.PI / 2)
      const mesh = new THREE.Mesh(geo)
      mesh.castShadow = true
      mesh.receiveShadow = true
      bucket.meshes.push(mesh)

      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      for (const [x, z] of b.footprint) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
      // Shrink slightly; keep a valid box on skinny footprints
      const padX = Math.min(0.35, Math.max(0, (maxX - minX) * 0.15))
      const padZ = Math.min(0.35, Math.max(0, (maxZ - minZ) * 0.15))
      this.colliders.push({
        minX: minX + padX,
        maxX: maxX - padX,
        minZ: minZ + padZ,
        maxZ: maxZ - padZ,
        height: b.height,
      })
    }

    for (const bucket of buckets.values()) {
      const mat = new THREE.MeshStandardMaterial({
        color: bucket.color,
        roughness: 0.85,
        metalness: 0.05,
      })
      for (const mesh of bucket.meshes) {
        mesh.material = mat
        this.group.add(mesh)
      }
    }
  }

  private addLandmarkMarkers() {
    for (const spawn of this.spawns) {
      const mat = new THREE.MeshStandardMaterial({
        color: spawn.color,
        emissive: spawn.color,
        emissiveIntensity: 0.25,
        roughness: 0.7,
      })
      // Flat spawn plate (not a car) + short stem so it reads as a map pin on the ground
      const plate = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), mat)
      plate.rotation.x = -Math.PI / 2
      plate.position.set(spawn.x, 0.05, spawn.z)
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8),
        mat,
      )
      stem.position.set(spawn.x, 1.1, spawn.z)
      this.group.add(plate, stem)
    }
  }

  resolveCollision(
    x: number,
    z: number,
    radius: number,
  ): { x: number; z: number } {
    let outX = x
    let outZ = z
    for (const c of this.colliders) {
      if (c.height < 1.2) continue
      const nearestX = Math.max(c.minX, Math.min(outX, c.maxX))
      const nearestZ = Math.max(c.minZ, Math.min(outZ, c.maxZ))
      const dx = outX - nearestX
      const dz = outZ - nearestZ
      const distSq = dx * dx + dz * dz
      if (distSq >= radius * radius) continue

      if (distSq < 1e-6) {
        // Center inside AABB — push out via smallest penetration
        const left = Math.abs(outX - c.minX)
        const right = Math.abs(c.maxX - outX)
        const top = Math.abs(outZ - c.minZ)
        const bottom = Math.abs(c.maxZ - outZ)
        const m = Math.min(left, right, top, bottom)
        if (m === left) outX = c.minX - radius
        else if (m === right) outX = c.maxX + radius
        else if (m === top) outZ = c.minZ - radius
        else outZ = c.maxZ + radius
      } else {
        const dist = Math.sqrt(distSq)
        const push = (radius - dist) / dist
        outX += dx * push
        outZ += dz * push
      }
    }
    return { x: outX, z: outZ }
  }
}

interface BuildingDataBucket {
  color: string
  meshes: THREE.Mesh[]
}
