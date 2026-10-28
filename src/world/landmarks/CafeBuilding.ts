import { createLandmarkLabel } from '../labels'
import { addBox, addFacadeWindows } from './buildingUtils'
import * as THREE from 'three'

const WALL = 0xc4a484
const AWNING = 0xc45c26
const WHITE = 0xf2efe8
const GLASS = 0x1a2228
const WOOD = 0x6b3a1f
const ROOF = 0x5a4030

/**
 * Low-poly café storefront (Слънчевата) — warm walls, striped awning, big ground windows.
 * Front faces −Z.
 */
export function createCafeBuilding(width = 16, depth = 12): THREE.Group {
  const g = new THREE.Group()
  g.name = 'CafeSlunchevata'

  const baseH = 0.4
  const wallH = 7.5
  const bodyY = baseH + wallH / 2

  addBox(g, width, wallH, depth, 0, bodyY, 0, WALL)
  addBox(g, width + 0.2, 0.35, depth + 0.2, 0, baseH + wallH - 0.15, 0, WOOD)

  const frontZ = -depth / 2 - 0.05
  // Big ground-floor café windows
  for (const x of [-width * 0.28, width * 0.28]) {
    addBox(g, width * 0.35, 3.2, 0.2, x, baseH + 2.0, frontZ, WHITE)
    addBox(g, width * 0.3, 2.8, 0.12, x, baseH + 1.95, frontZ - 0.06, GLASS)
  }
  // Door
  addBox(g, 1.6, 2.8, 0.2, 0, baseH + 1.5, frontZ, WOOD)
  addBox(g, 1.2, 2.3, 0.1, 0, baseH + 1.5, frontZ - 0.05, 0x2a1a10)

  // Upper windows
  addFacadeWindows(g, 0, width * 0.75, baseH + 3.2, wallH - 3.2, frontZ, {
    cols: 3,
    white: WHITE,
    glass: GLASS,
  })

  // Striped awning
  addBox(g, width * 0.92, 0.15, 2.2, 0, baseH + 3.6, frontZ - 1.0, AWNING)
  for (let i = 0; i < 6; i++) {
    const x = -width * 0.4 + (i / 5) * width * 0.8
    addBox(g, width * 0.06, 0.12, 2.15, x, baseH + 3.62, frontZ - 1.0, 0xf4d35e)
  }

  const sign = createLandmarkLabel('СЛЪНЧЕВАТА', '#c45c26')
  sign.position.set(0, baseH + wallH * 0.82, frontZ - 0.4)
  sign.scale.set(11, 2.8, 1)
  g.add(sign)

  addBox(g, width * 0.95, 0.5, depth * 0.95, 0, baseH + wallH + 0.25, 0, ROOF)

  // Outdoor tables (tiny)
  for (const x of [-3, 3]) {
    addBox(g, 1.1, 0.08, 1.1, x, 0.85, frontZ - 2.2, WOOD)
    addBox(g, 0.12, 0.8, 0.12, x, 0.4, frontZ - 2.2, WOOD)
  }

  return g
}
