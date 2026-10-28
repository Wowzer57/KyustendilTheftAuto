import * as THREE from 'three'
import { createLandmarkLabel } from '../labels'
import { addBox, addFacadeWindows } from './buildingUtils'

const CREAM = 0xf0e6a8
const YELLOW = 0xe8c84a
const BLUE = 0x3d5a80
const WHITE = 0xf5f2ea
const STONE = 0x8a8a88
const GLASS = 0x1a222c
const ROOF = 0x4a5560

/**
 * Low-poly Kyustendil post office (Пощенска палата) —
 * cream/yellow civic block with blue accents and ПОЩА signage.
 * Front faces −Z.
 */
export function createPostOfficeBuilding(width = 40, depth = 18): THREE.Group {
  const g = new THREE.Group()
  g.name = 'PostOfficeKyustendil'

  const baseH = 0.9
  const wallH = 11
  const bodyY = baseH + wallH / 2

  addBox(g, width + 0.3, baseH, depth + 0.3, 0, baseH / 2, 0, STONE)
  addBox(g, width, wallH, depth, 0, bodyY, 0, CREAM)

  // Blue horizontal band + yellow cornice
  addBox(g, width + 0.4, 0.55, depth + 0.4, 0, baseH + wallH * 0.42, 0, BLUE)
  addBox(g, width + 0.5, 0.4, depth + 0.5, 0, baseH + wallH - 0.2, 0, YELLOW)

  // Slight central bay
  const bayW = width * 0.32
  addBox(g, bayW, wallH, depth + 1.6, 0, bodyY, -0.8, CREAM)
  addBox(g, bayW + 0.3, 0.55, depth + 2.0, 0, baseH + wallH * 0.42, -0.8, BLUE)

  // Windows
  const frontZ = -depth / 2 - 0.05
  addFacadeWindows(g, -width * 0.28, width * 0.28, baseH, wallH, frontZ, {
    cols: 4,
  })
  addFacadeWindows(g, width * 0.28, width * 0.28, baseH, wallH, frontZ, {
    cols: 4,
  })
  // Center bay large ground openings
  for (const x of [-3.5, 0, 3.5]) {
    addBox(g, 2.4, 3.0, 0.2, x, baseH + 2.2, -0.8 - (depth + 1.6) / 2 - 0.05, WHITE)
    addBox(g, 2.0, 2.5, 0.12, x, baseH + 2.15, -0.8 - (depth + 1.6) / 2 - 0.1, GLASS)
  }

  // Entrance
  const doorZ = -0.8 - (depth + 1.6) / 2 - 0.02
  addBox(g, 2.4, 3.2, 0.25, 0, baseH + 1.7, doorZ, BLUE)
  addBox(g, 1.8, 2.6, 0.12, 0, baseH + 1.7, doorZ - 0.05, 0x1a2838)

  // ПОЩА signage board
  addBox(g, 10, 1.4, 0.3, 0, baseH + wallH * 0.55, doorZ - 0.4, BLUE)
  const sign = createLandmarkLabel('ПОЩА', '#e8c84a')
  sign.position.set(0, baseH + wallH * 0.55, doorZ - 0.7)
  sign.scale.set(10, 2.6, 1)
  g.add(sign)

  // Flat roof parapet
  addBox(g, width * 0.98, 0.7, depth * 0.98, 0, baseH + wallH + 0.35, 0, ROOF)
  addBox(g, bayW + 0.2, 0.7, depth + 1.4, 0, baseH + wallH + 0.35, -0.8, ROOF)

  // Side postal horn / emblem suggestion (yellow disc)
  const emblem = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 12),
    new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.6 }),
  )
  emblem.position.set(-width * 0.35, baseH + wallH * 0.72, frontZ - 0.02)
  g.add(emblem)

  return g
}
