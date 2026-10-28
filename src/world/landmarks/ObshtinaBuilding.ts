import * as THREE from 'three'
import { createLandmarkLabel } from '../labels'

const RED = 0xc43c36
const WHITE = 0xf2efe8
const ROOF = 0x8fa89a
const STONE = 0x8a8a88
const GLASS = 0x1a222c
const WOOD = 0x3a2818

/**
 * Low-poly Kyustendil Municipality (Obshtina) — red/white neoclassical
 * with green mansard roof and clock tower, based on the real building.
 *
 * Local space: front facade faces −Z, Y up. Caller positions/rotates the group.
 */
export function createObshtinaBuilding(
  width = 46,
  depth = 18,
): THREE.Group {
  const g = new THREE.Group()
  g.name = 'ObshtinaKyustendil'

  const wallH = 10.5
  const baseH = 1.1
  const wingDepth = depth
  const centerW = width * 0.28
  const wingW = (width - centerW) / 2

  // --- Stone base ---
  addBox(g, width + 0.4, baseH, depth + 0.4, 0, baseH / 2, 0, STONE)

  // --- Main wings (left / right) ---
  const bodyY = baseH + wallH / 2
  addBox(g, wingW - 0.3, wallH, wingDepth, -width / 2 + wingW / 2, bodyY, 0, RED)
  addBox(g, wingW - 0.3, wallH, wingDepth, width / 2 - wingW / 2, bodyY, 0, RED)

  // --- Central protruding bay ---
  const centerDepth = depth + 2.4
  addBox(g, centerW, wallH, centerDepth, 0, bodyY, -1.2, RED)

  // White horizontal cornice bands
  const bandY1 = baseH + wallH * 0.48
  const bandY2 = baseH + wallH - 0.25
  addBox(g, width + 0.5, 0.35, depth + 0.6, 0, bandY1, 0, WHITE)
  addBox(g, centerW + 0.4, 0.35, centerDepth + 0.5, 0, bandY1, -1.2, WHITE)
  addBox(g, width + 0.6, 0.45, depth + 0.7, 0, bandY2, 0, WHITE)
  addBox(g, centerW + 0.5, 0.45, centerDepth + 0.6, 0, bandY2, -1.2, WHITE)

  // Corner quoins (simplified white vertical strips)
  const quoinH = wallH
  const qy = baseH + wallH / 2
  for (const x of [-width / 2 + 0.35, width / 2 - 0.35]) {
    addBox(g, 0.7, quoinH, 0.7, x, qy, -depth / 2 + 0.2, WHITE)
    addBox(g, 0.7, quoinH, 0.7, x, qy, depth / 2 - 0.2, WHITE)
  }
  // Center bay corners
  for (const x of [-centerW / 2 + 0.2, centerW / 2 - 0.2]) {
    addBox(g, 0.55, quoinH, 0.55, x, qy, -1.2 - centerDepth / 2 + 0.25, WHITE)
  }

  // --- Windows ---
  addWingWindows(g, -width / 2 + wingW / 2, wingW - 1.5, baseH, wallH, -depth / 2 - 0.05)
  addWingWindows(g, width / 2 - wingW / 2, wingW - 1.5, baseH, wallH, -depth / 2 - 0.05)
  addCenterWindows(g, centerW, baseH, wallH, -1.2 - centerDepth / 2 - 0.05)

  // --- Portico / entrance ---
  const porticoZ = -1.2 - centerDepth / 2 - 1.6
  const colH = 4.2
  const colY = baseH + colH / 2
  for (const x of [-2.4, -0.9, 0.9, 2.4]) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, colH, 8),
      mat(WHITE),
    )
    col.position.set(x, colY, porticoZ)
    col.castShadow = true
    g.add(col)
  }
  // Portico roof slab
  addBox(g, 6.2, 0.35, 3.2, 0, baseH + colH + 0.15, porticoZ, WHITE)
  // Door
  addBox(g, 2.2, 3.4, 0.25, 0, baseH + 1.7, -1.2 - centerDepth / 2 - 0.02, WOOD)
  // Arched transom suggestion
  addBox(g, 2.0, 0.9, 0.2, 0, baseH + 3.7, -1.2 - centerDepth / 2 - 0.03, GLASS)

  // Gold-ish sign above entrance
  const sign = createLandmarkLabel('ОБЩИНА КЮСТЕНДИЛ', '#d4a017')
  sign.position.set(0, baseH + colH + 1.4, porticoZ - 0.2)
  sign.scale.set(12, 2.8, 1)
  g.add(sign)

  // --- Mansard roof ---
  addMansard(g, width, depth, baseH + wallH, false)
  addMansard(g, centerW + 0.6, centerDepth + 0.4, baseH + wallH, true, -1.2)

  // Dormers on front roof slope
  for (const x of [-width * 0.32, -width * 0.12, width * 0.12, width * 0.32]) {
    addDormer(g, x, baseH + wallH + 1.6, -depth / 2 + 1.2)
  }

  // --- Clock tower on center ---
  const towerBaseY = baseH + wallH + 2.8
  addBox(g, 3.2, 2.4, 3.2, 0, towerBaseY, -1.2, ROOF)
  addBox(g, 2.6, 2.2, 2.6, 0, towerBaseY + 2.2, -1.2, WHITE)
  // Clock faces
  addClockFace(g, 0, towerBaseY + 2.2, -1.2 - 1.32)
  addClockFace(g, 0, towerBaseY + 2.2, -1.2 + 1.32, true)
  // Cupola / spire
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 8), mat(ROOF))
  spire.position.set(0, towerBaseY + 4.0, -1.2)
  spire.castShadow = true
  g.add(spire)
  // Flag pole + Bulgarian flag
  addBox(g, 0.08, 3.2, 0.08, 0, towerBaseY + 5.8, -1.2, 0x333333)
  addBulgarianFlag(g, 0.9, towerBaseY + 6.6, -1.2)

  // Side wing roof towers (simplified)
  addBox(g, 2.4, 1.8, 2.4, -width / 2 + 3, baseH + wallH + 2.2, -depth / 2 + 2, ROOF)
  addBox(g, 2.4, 1.8, 2.4, width / 2 - 3, baseH + wallH + 2.2, -depth / 2 + 2, ROOF)

  return g
}

function mat(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: color === ROOF ? 0.25 : 0.04,
  })
}

function addBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function addWingWindows(
  g: THREE.Group,
  cx: number,
  span: number,
  baseH: number,
  wallH: number,
  z: number,
) {
  const count = Math.max(3, Math.floor(span / 3.6))
  const start = cx - span / 2 + span / (count * 2)
  for (let i = 0; i < count; i++) {
    const x = start + (i * span) / count
    // Ground floor arched (box + half suggestion via taller white frame)
    addBox(g, 1.7, 2.6, 0.2, x, baseH + 2.0, z, WHITE)
    addBox(g, 1.35, 2.1, 0.12, x, baseH + 1.95, z - 0.06, GLASS)
    // Upper rectangular
    addBox(g, 1.6, 2.1, 0.2, x, baseH + wallH * 0.72, z, WHITE)
    addBox(g, 1.25, 1.7, 0.12, x, baseH + wallH * 0.72, z - 0.06, GLASS)
    // Pediment lick
    addBox(g, 1.8, 0.25, 0.22, x, baseH + wallH * 0.72 + 1.2, z, WHITE)
  }
}

function addCenterWindows(
  g: THREE.Group,
  centerW: number,
  baseH: number,
  wallH: number,
  z: number,
) {
  // Three large upper arches on center (photo: iconic)
  for (const x of [-3.2, 0, 3.2]) {
    if (Math.abs(x) > centerW / 2 - 1) continue
    addBox(g, 2.4, 3.4, 0.22, x, baseH + wallH * 0.7, z, WHITE)
    addBox(g, 1.9, 2.8, 0.12, x, baseH + wallH * 0.7, z - 0.06, GLASS)
  }
  // Ground flanking the door
  for (const x of [-4.0, 4.0]) {
    if (Math.abs(x) > centerW / 2 - 1) continue
    addBox(g, 1.8, 2.5, 0.2, x, baseH + 2.0, z, WHITE)
    addBox(g, 1.4, 2.0, 0.12, x, baseH + 1.95, z - 0.06, GLASS)
  }
}

function addMansard(
  g: THREE.Group,
  width: number,
  depth: number,
  y0: number,
  raised: boolean,
  zOff = 0,
) {
  // Steep lower slope as a flattened box + wedge feel via scaled boxes
  const h = raised ? 3.2 : 2.6
  addBox(g, width * 0.98, h, depth * 0.98, 0, y0 + h / 2, zOff, ROOF)
  // Flatter top cap
  addBox(g, width * 0.72, 0.5, depth * 0.72, 0, y0 + h + 0.2, zOff, ROOF)
}

function addDormer(g: THREE.Group, x: number, y: number, z: number) {
  addBox(g, 1.4, 1.3, 1.5, x, y, z, ROOF)
  addBox(g, 0.9, 0.8, 0.15, x, y, z - 0.8, GLASS)
}

function addClockFace(g: THREE.Group, x: number, y: number, z: number, flip = false) {
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 16),
    new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.7 }),
  )
  face.position.set(x, y, z)
  if (!flip) face.rotation.y = Math.PI
  g.add(face)
  // Simple hands
  addBox(g, 0.08, 0.55, 0.05, x, y + 0.15, z + (flip ? 0.02 : -0.02), 0x111111)
  addBox(g, 0.4, 0.08, 0.05, x + 0.12, y, z + (flip ? 0.02 : -0.02), 0x111111)
}

function addBulgarianFlag(g: THREE.Group, x: number, y: number, z: number) {
  const w = 1.6
  const h = 1.0
  const white = addBox(g, w, h / 3, 0.04, x, y + h / 6, z, 0xffffff)
  void white
  addBox(g, w, h / 3, 0.04, x, y, z, 0x00966e)
  addBox(g, w, h / 3, 0.04, x, y - h / 6, z, 0xd62612)
}

/**
 * Orient the Obshtina to the OSM footprint like on the map:
 * long local-X axis follows the footprint PCA, front (−Z) toward the plaza.
 */
export function orientObshtinaToFootprint(
  footprint: Array<[number, number]>,
  faceX: number,
  faceZ: number,
): { yaw: number; width: number; depth: number; cx: number; cz: number } {
  const pts = footprint.slice(0, -1)
  let cx = 0
  let cz = 0
  for (const [x, z] of pts) {
    cx += x
    cz += z
  }
  cx /= pts.length
  cz /= pts.length

  // Principal axis (major) via 2D covariance
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
  // Major axis unit vector in XZ
  const ax = Math.cos(theta)
  const az = Math.sin(theta)

  // Extent along major / minor axes
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
  const width = Math.max(36, Math.min(56, maxMajor - minMajor))
  const depth = Math.max(14, Math.min(22, maxMinor - minMinor))

  // Align local +X with major axis: local (1,0,0) → (cos yaw, -sin yaw)
  // Want (cos yaw, -sin yaw) ∥ (ax, az) → yaw = -theta  OR  yaw = -theta + π
  let yaw = -theta

  // Front local −Z after yaw: (-sin yaw, -cos yaw)
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
