import * as THREE from 'three'
import type { CityData, SpawnPoint, Vec2 } from '../types'
import { createLandmarkLabel } from './labels'
import {
  applyBuildingUVs,
  facadeMaterial,
  getPavementTexture,
  getPlazaMosaicTexture,
  roofMaterial,
  type FacadeStyle,
} from './materials'
import {
  footprintCentroid,
  isOnSquareRing,
  resolveLandmarkBuildings,
} from './landmarkOverrides'
import {
  createObshtinaBuilding,
  orientObshtinaToFootprint,
} from './landmarks/ObshtinaBuilding'

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
    this.buildPlazas()
    this.buildPlazaMosaic()
    this.buildWater()
    this.buildPavements()
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
      color: 0x4a5c42,
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

  private buildPlazas() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc2b49a,
      map: getPavementTexture(),
      roughness: 0.92,
    })
    for (const plaza of this.city.plazas || []) {
      const shape = shapeFromRing(plaza.footprint)
      if (!shape) continue
      const geo = new THREE.ShapeGeometry(shape)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0.025
      mesh.receiveShadow = true
      this.group.add(mesh)
    }
  }

  /** Central rectangle with drawings on Velbazhd plaza. */
  private buildPlazaMosaic() {
    const plazas = this.city.plazas || []
    // Prefer the large square near municipality (~ -210, 295)
    let best: { footprint: Vec2[]; score: number } | null = null
    for (const p of plazas) {
      const [cx, cz] = footprintCentroid(p.footprint)
      const d = Math.hypot(cx - -210, cz - 295)
      let area = 0
      for (let i = 0; i < p.footprint.length - 1; i++) {
        area +=
          p.footprint[i][0] * p.footprint[i + 1][1] -
          p.footprint[i + 1][0] * p.footprint[i][1]
      }
      area = Math.abs(area / 2)
      const score = area / (1 + d)
      if (!best || score > best.score) best = { footprint: p.footprint, score }
    }
    if (!best || best.score < 10) {
      // Fallback rectangle at plaza center if plaza list is empty
      this.addMosaicRect(-210, 295, 28, 18)
      return
    }
    const [cx, cz] = footprintCentroid(best.footprint)
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const [x, z] of best.footprint) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    const w = Math.max(16, (maxX - minX) * 0.42)
    const d = Math.max(12, (maxZ - minZ) * 0.42)
    this.addMosaicRect(cx, cz, w, d)
  }

  private addMosaicRect(cx: number, cz: number, width: number, depth: number) {
    const geo = new THREE.PlaneGeometry(width, depth)
    const mat = new THREE.MeshStandardMaterial({
      map: getPlazaMosaicTexture(),
      roughness: 0.85,
      metalness: 0.02,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(cx, 0.045, cz)
    mesh.receiveShadow = true
    this.group.add(mesh)

    // Low stone curb around the art rectangle
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.2, 0.18, depth + 1.2),
      new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.9 }),
    )
    edge.position.set(cx, 0.03, cz)
    edge.receiveShadow = true
    this.group.add(edge)
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

  private buildPavements() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb9ab97,
      map: getPavementTexture(),
      roughness: 0.95,
    })
    for (const pave of this.city.pavements || []) {
      if (pave.path.length < 2) continue
      const geo = roadRibbon(pave.path, pave.width)
      if (!geo) continue
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.y = 0.028
      mesh.receiveShadow = true
      this.group.add(mesh)
    }
  }

  private buildRoads() {
    const majorMat = new THREE.MeshStandardMaterial({
      color: 0x4e4e4e,
      roughness: 0.88,
    })
    const streetMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.92,
    })
    const alleyMat = new THREE.MeshStandardMaterial({
      color: 0x2e2e2e,
      roughness: 0.95,
    })
    const pedestrian = new THREE.MeshStandardMaterial({
      color: 0xc4b396,
      map: getPavementTexture(),
      roughness: 0.95,
    })
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x8a857c,
      roughness: 0.9,
    })
    const centerLine = new THREE.MeshStandardMaterial({
      color: 0xe6c84a,
      roughness: 0.7,
      emissive: 0xe6c84a,
      emissiveIntensity: 0.12,
    })

    for (const road of this.city.roads) {
      const isPed =
        road.kind === 'pedestrian' ||
        road.kind === 'footway' ||
        road.kind === 'path' ||
        road.kind === 'steps' ||
        road.kind === 'living_street'
      const isMajor =
        road.kind === 'primary' ||
        road.kind === 'trunk' ||
        road.kind === 'secondary'
      const isTertiary = road.kind === 'tertiary'
      const widthMul = isMajor ? 1.2 : isTertiary ? 1.08 : isPed ? 1.0 : 1.0
      const geo = roadRibbon(road.path, road.width * widthMul)
      if (!geo) continue
      const mat = isPed
        ? pedestrian
        : isMajor || isTertiary
          ? majorMat
          : road.kind === 'service'
            ? alleyMat
            : streetMat
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.y = isMajor ? 0.04 : 0.032
      mesh.receiveShadow = true
      this.group.add(mesh)

      // Soft curb edges on drivable streets
      if (!isPed && road.path.length >= 2) {
        const curbW = road.width * widthMul + 0.55
        const curbGeo = roadRibbon(road.path, curbW)
        if (curbGeo) {
          const curb = new THREE.Mesh(curbGeo, curbMat)
          curb.position.y = 0.018
          curb.receiveShadow = true
          this.group.add(curb)
        }
      }

      if (isMajor && road.path.length >= 2) {
        const stripe = roadRibbon(road.path, Math.max(0.3, road.width * 0.07))
        if (stripe) {
          const line = new THREE.Mesh(stripe, centerLine)
          line.position.y = 0.055
          this.group.add(line)
        }
      }
    }
  }

  private nearestSpawn(x: number, z: number): SpawnPoint | null {
    let best: SpawnPoint | null = null
    let bestD = Infinity
    for (const s of this.spawns) {
      const d = Math.hypot(s.x - x, s.z - z)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  private buildBuildings() {
    const landmarks = resolveLandmarkBuildings(this.city.buildings)
    // Shared buckets for non-landmark buildings (key: style|color)
    const buckets = new Map<string, BuildingDataBucket>()

    this.city.buildings.forEach((b, index) => {
      const [cx, cz] = footprintCentroid(b.footprint)
      const lm = landmarks.get(index)
      const onRing = isOnSquareRing(cx, cz)

      let height = b.height
      let color = b.color
      let style: FacadeStyle = 'default'

      if (lm) {
        height = Math.max(height * lm.heightMul, height + 2)
        color = lm.color
        style = lm.style
      } else if (onRing) {
        // Square ring storefronts share a coherent look
        height = Math.max(height * 1.15, height + 1.5)
        color = mixHex(b.color, '#c4a484', 0.25)
        style = 'center'
      } else {
        const near = this.nearestSpawn(cx, cz)
        const dist = near ? Math.hypot(near.x - cx, near.z - cz) : Infinity
        if (near && dist < 45) {
          height = Math.max(height * 1.2, height + 2)
          color = mixHex(b.color, near.color, 0.25)
        }
      }

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
      const fw = Math.max(1, maxX - minX)
      const fd = Math.max(1, maxZ - minZ)
      const levels = Math.max(1, b.levels || Math.round(height / 3.2))

      // Custom low-poly Obshtina — skip generic extrude
      if (lm?.id === 'municipality') {
        const obsH = 16
        this.colliders.push({
          minX,
          maxX,
          minZ,
          maxZ,
          height: obsH,
          footprint: b.footprint,
        })
        const orient = orientObshtinaToFootprint(b.footprint, -210, 295)
        const obshtina = createObshtinaBuilding(orient.width, orient.depth)
        obshtina.position.set(orient.cx, 0, orient.cz)
        obshtina.rotation.y = orient.yaw
        this.group.add(obshtina)
        return
      }

      const shape = shapeFromRing(b.footprint)
      if (!shape) return
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
      })
      geo.rotateX(-Math.PI / 2)
      applyBuildingUVs(geo, fw, fd, height, levels)

      const mesh = new THREE.Mesh(geo)
      mesh.castShadow = true
      mesh.receiveShadow = true

      const roofShape = shapeFromRing(b.footprint)
      let roof: THREE.Mesh | null = null
      if (roofShape) {
        const roofGeo = new THREE.ShapeGeometry(roofShape)
        roofGeo.rotateX(-Math.PI / 2)
        roof = new THREE.Mesh(roofGeo)
        roof.position.y = height + 0.02
        roof.castShadow = true
        roof.receiveShadow = true
      }

      this.colliders.push({
        minX,
        maxX,
        minZ,
        maxZ,
        height,
        footprint: b.footprint,
      })

      // Other landmarks get unique materials + signs
      if (lm) {
        const wallMat = facadeMaterial(color, style)
        const roofMat = roofMaterial(color)
        mesh.material = wallMat
        this.group.add(mesh)
        if (roof) {
          roof.material = roofMat
          this.group.add(roof)
        }
        const sign = createLandmarkLabel(lm.sign, lm.signColor)
        sign.position.set(cx, height + 3.2, cz)
        sign.scale.set(16, 4, 1)
        this.group.add(sign)
        return
      }

      const key = `${style}|${color}`
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { color, style, meshes: [], roofs: [] }
        buckets.set(key, bucket)
      }
      bucket.meshes.push(mesh)
      if (roof) bucket.roofs.push(roof)
    })

    for (const bucket of buckets.values()) {
      const wallMat = facadeMaterial(bucket.color, bucket.style)
      const roofMat = roofMaterial(bucket.color)
      for (const mesh of bucket.meshes) {
        mesh.material = wallMat
        this.group.add(mesh)
      }
      for (const roof of bucket.roofs) {
        roof.material = roofMat
        this.group.add(roof)
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
      // Flat spawn plate + stem + floating name label
      const plate = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), mat)
      plate.rotation.x = -Math.PI / 2
      plate.position.set(spawn.x, 0.05, spawn.z)
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8),
        mat,
      )
      stem.position.set(spawn.x, 1.1, spawn.z)
      const label = createLandmarkLabel(spawn.name, spawn.color)
      label.position.set(spawn.x, 5.2, spawn.z)
      this.group.add(plate, stem, label)
    }
  }

  /** Nearest landmark name for HUD orientation. */
  nearestLandmarkName(x: number, z: number, maxDist = 120): string | null {
    let best: SpawnPoint | null = null
    let bestD = maxDist
    for (const s of this.spawns) {
      const d = Math.hypot(s.x - x, s.z - z)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best?.name ?? null
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
  style: FacadeStyle
  meshes: THREE.Mesh[]
  roofs: THREE.Mesh[]
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace('#', ''), 16)
  const pb = parseInt(b.replace('#', ''), 16)
  const ar = (pa >> 16) & 0xff
  const ag = (pa >> 8) & 0xff
  const ab = pa & 0xff
  const br = (pb >> 16) & 0xff
  const bg = (pb >> 8) & 0xff
  const bb = pb & 0xff
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`
}
