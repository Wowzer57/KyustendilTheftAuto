import * as THREE from 'three'
import type { Vec2 } from '../../types'

export function wallMat(color: number, roughness = 0.85, metalness = 0.04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

export function addBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
  roughness = 0.85,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    wallMat(color, roughness),
  )
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** Large framed windows along a facade strip (Obshtina-style). */
export function addFacadeWindows(
  g: THREE.Group,
  cx: number,
  span: number,
  baseH: number,
  wallH: number,
  z: number,
  opts?: { cols?: number; white?: number; glass?: number },
) {
  const WHITE = opts?.white ?? 0xf2efe8
  const GLASS = opts?.glass ?? 0x1a222c
  const count = opts?.cols ?? Math.max(3, Math.floor(span / 3.6))
  const start = cx - span / 2 + span / (count * 2)
  for (let i = 0; i < count; i++) {
    const x = start + (i * span) / count
    addBox(g, 1.7, 2.5, 0.2, x, baseH + 2.0, z, WHITE)
    addBox(g, 1.35, 2.05, 0.12, x, baseH + 1.95, z - 0.06, GLASS)
    addBox(g, 1.6, 2.0, 0.2, x, baseH + wallH * 0.7, z, WHITE)
    addBox(g, 1.25, 1.6, 0.12, x, baseH + wallH * 0.7, z - 0.06, GLASS)
  }
}

export interface OrientClamp {
  minW?: number
  maxW?: number
  minD?: number
  maxD?: number
}

function openRing(footprint: Vec2[]): Vec2[] {
  if (footprint.length < 2) return []
  const first = footprint[0]
  const last = footprint[footprint.length - 1]
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.5) {
    return footprint.slice(0, -1)
  }
  return footprint.slice()
}

function centroidOf(pts: Vec2[]): [number, number] {
  let cx = 0
  let cz = 0
  for (const [x, z] of pts) {
    cx += x
    cz += z
  }
  return [cx / pts.length, cz / pts.length]
}

/**
 * Longest footprint edge that faces toward (faceX, faceZ).
 * Used so custom meshes align with the street/plaza front, not PCA alone.
 */
export function frontEdgeOfFootprint(
  footprint: Vec2[],
  faceX: number,
  faceZ: number,
): {
  yaw: number
  width: number
  depth: number
  cx: number
  cz: number
  midX: number
  midZ: number
} | null {
  const pts = openRing(footprint)
  if (pts.length < 3) return null
  const [cx, cz] = centroidOf(pts)

  let best: {
    score: number
    len: number
    yaw: number
    mx: number
    mz: number
    nx: number
    nz: number
  } | null = null

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const ex = b[0] - a[0]
    const ez = b[1] - a[1]
    const len = Math.hypot(ex, ez)
    if (len < 6) continue

    const mx = (a[0] + b[0]) / 2
    const mz = (a[1] + b[1]) / 2
    // Candidate outward normal (left of directed edge)
    let nx = -ez / len
    let nz = ex / len
    // Flip so outward points away from centroid
    if (nx * (cx - mx) + nz * (cz - mz) > 0) {
      nx = -nx
      nz = -nz
    }
    const toward = nx * (faceX - mx) + nz * (faceZ - mz)
    if (toward <= 0) continue
    const score = len * toward
    // Front faces −Z after yaw: (-sin yaw, -cos yaw) = outward
    const yaw = Math.atan2(-nx, -nz)
    if (!best || score > best.score) {
      best = { score, len, yaw, mx, mz, nx, nz }
    }
  }

  if (!best) return null

  // Depth = extent along outward axis; width = front edge length
  let minD = Infinity
  let maxD = -Infinity
  let minW = Infinity
  let maxW = -Infinity
  const tx = -best.nz // tangent along front (= edge dir approx)
  const tz = best.nx
  for (const [x, z] of pts) {
    const dx = x - cx
    const dz = z - cz
    const along = dx * tx + dz * tz
    const deep = dx * best.nx + dz * best.nz
    minW = Math.min(minW, along)
    maxW = Math.max(maxW, along)
    minD = Math.min(minD, deep)
    maxD = Math.max(maxD, deep)
  }

  return {
    yaw: best.yaw,
    width: Math.max(8, maxW - minW),
    depth: Math.max(6, maxD - minD),
    cx,
    cz,
    midX: best.mx,
    midZ: best.mz,
  }
}

/**
 * Orient a front-faces−Z building to an OSM footprint using the
 * plaza/street-facing edge (preferred over PCA for irregular footprints).
 */
export function orientBuildingToFootprint(
  footprint: Vec2[],
  faceX: number,
  faceZ: number,
  clamp: OrientClamp = {},
): { yaw: number; width: number; depth: number; cx: number; cz: number } {
  const edge = frontEdgeOfFootprint(footprint, faceX, faceZ)
  if (edge) {
    const minW = clamp.minW ?? 12
    const maxW = clamp.maxW ?? 64
    const minD = clamp.minD ?? 8
    const maxD = clamp.maxD ?? 36
    return {
      yaw: edge.yaw,
      width: Math.max(minW, Math.min(maxW, edge.width)),
      depth: Math.max(minD, Math.min(maxD, edge.depth)),
      cx: edge.cx,
      cz: edge.cz,
    }
  }

  // Fallback: PCA
  const pts = openRing(footprint)
  const [cx, cz] = centroidOf(pts)
  let cxx = 0
  let czz = 0
  let cxz = 0
  for (const [x, z] of pts) {
    const dx = x - cx
    const dz = z - cz
    cxx += dx * dx
    czz += dz * dz
    cxz += dx * dz
  }
  const theta = 0.5 * Math.atan2(2 * cxz, cxx - czz)
  let yaw = -theta
  const pickFront = (y: number) => {
    const fx = -Math.sin(y)
    const fz = -Math.cos(y)
    return fx * (faceX - cx) + fz * (faceZ - cz)
  }
  if (pickFront(yaw) < pickFront(yaw + Math.PI)) yaw += Math.PI
  return {
    yaw,
    width: clamp.minW ?? 28,
    depth: clamp.minD ?? 14,
    cx,
    cz,
  }
}
