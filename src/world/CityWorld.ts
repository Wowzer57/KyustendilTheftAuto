import * as THREE from 'three'
import type { CityData, SpawnPoint, Vec2 } from '../types'

export interface Collider {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  height: number
  /** Closed or open ring in world XZ; used after AABB broadphase. */
  footprint: Vec2[]
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
      // AABB is a loose broadphase; footprint drives the real push-out
      this.colliders.push({
        minX,
        maxX,
        minZ,
        maxZ,
        height: b.height,
        footprint: b.footprint,
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
    // A couple passes so overlapping footprints settle cleanly
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (c.height < 1.2) continue
        // Broadphase: expanded AABB
        if (
          outX + radius < c.minX ||
          outX - radius > c.maxX ||
          outZ + radius < c.minZ ||
          outZ - radius > c.maxZ
        ) {
          continue
        }
        const pushed = pushCircleFromPolygon(outX, outZ, radius, c.footprint)
        outX = pushed.x
        outZ = pushed.z
      }
    }
    return { x: outX, z: outZ }
  }
}

function pointInPoly(x: number, z: number, ring: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const zi = ring[i][1]
    const xj = ring[j][0]
    const zj = ring[j][1]
    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number; distSq: number } {
  const abx = bx - ax
  const abz = bz - az
  const apx = px - ax
  const apz = pz - az
  const abLenSq = abx * abx + abz * abz || 1e-12
  let t = (apx * abx + apz * abz) / abLenSq
  t = Math.max(0, Math.min(1, t))
  const x = ax + abx * t
  const z = az + abz * t
  const dx = px - x
  const dz = pz - z
  return { x, z, distSq: dx * dx + dz * dz }
}

/** Push a circle outside a polygon footprint (edges + interior). */
function pushCircleFromPolygon(
  x: number,
  z: number,
  radius: number,
  ring: Vec2[],
): { x: number; z: number } {
  if (ring.length < 3) return { x, z }

  let bestDistSq = Infinity
  let bestX = x
  let bestZ = z
  const n = ring.length
  const closed =
    Math.abs(ring[0][0] - ring[n - 1][0]) < 1e-6 &&
    Math.abs(ring[0][1] - ring[n - 1][1]) < 1e-6
  const verts = closed ? ring.slice(0, -1) : ring
  const count = verts.length
  if (count < 3) return { x, z }

  for (let i = 0; i < count; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % count]
    const hit = closestPointOnSegment(x, z, a[0], a[1], b[0], b[1])
    if (hit.distSq < bestDistSq) {
      bestDistSq = hit.distSq
      bestX = hit.x
      bestZ = hit.z
    }
  }

  const inside = pointInPoly(x, z, verts)
  if (!inside && bestDistSq >= radius * radius) {
    return { x, z }
  }

  const dx = x - bestX
  const dz = z - bestZ
  const dist = Math.sqrt(bestDistSq)
  if (dist < 1e-8) {
    // Degenerate: nudge along AABB-ish fallback from polygon centroid
    let cx = 0
    let cz = 0
    for (let i = 0; i < count; i++) {
      cx += verts[i][0]
      cz += verts[i][1]
    }
    cx /= count
    cz /= count
    let nx = x - cx
    let nz = z - cz
    const nlen = Math.hypot(nx, nz) || 1
    nx /= nlen
    nz /= nlen
    return { x: bestX + nx * radius, z: bestZ + nz * radius }
  }

  const nx = dx / dist
  const nz = dz / dist
  // Inside: dx points inward from the edge → push the opposite way (outward)
  if (inside) {
    return { x: bestX - nx * radius, z: bestZ - nz * radius }
  }
  // Outside but overlapping the circle: push away from the edge
  const push = radius - dist
  return { x: x + nx * push, z: z + nz * push }
}

interface BuildingDataBucket {
  color: string
  meshes: THREE.Mesh[]
}
