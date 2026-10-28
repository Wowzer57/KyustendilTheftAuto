import * as THREE from 'three'

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

/**
 * Orient a front-faces−Z building to an OSM footprint:
 * long local-X along PCA, front toward faceTarget.
 */
export function orientBuildingToFootprint(
  footprint: Array<[number, number]>,
  faceX: number,
  faceZ: number,
  clamp: OrientClamp = {},
): { yaw: number; width: number; depth: number; cx: number; cz: number } {
  const minW = clamp.minW ?? 28
  const maxW = clamp.maxW ?? 56
  const minD = clamp.minD ?? 12
  const maxD = clamp.maxD ?? 24

  const pts = footprint.slice(0, -1)
  let cx = 0
  let cz = 0
  for (const [x, z] of pts) {
    cx += x
    cz += z
  }
  cx /= pts.length
  cz /= pts.length

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
  const ax = Math.cos(theta)
  const az = Math.sin(theta)

  let minMajor = Infinity
  let maxMajor = -Infinity
  let minMinor = Infinity
  let maxMinor = -Infinity
  for (const [x, z] of pts) {
    const dx = x - cx
    const dz = z - cz
    const major = dx * ax + dz * az
    const minor = -dx * az + dz * ax
    minMajor = Math.min(minMajor, major)
    maxMajor = Math.max(maxMajor, major)
    minMinor = Math.min(minMinor, minor)
    maxMinor = Math.max(maxMinor, minor)
  }
  const width = Math.max(minW, Math.min(maxW, maxMajor - minMajor))
  const depth = Math.max(minD, Math.min(maxD, maxMinor - minMinor))

  let yaw = -theta
  const pickFront = (y: number) => {
    const fx = -Math.sin(y)
    const fz = -Math.cos(y)
    return fx * (faceX - cx) + fz * (faceZ - cz)
  }
  if (pickFront(yaw) < pickFront(yaw + Math.PI)) {
    yaw += Math.PI
  }

  return { yaw, width, depth, cx, cz }
}
