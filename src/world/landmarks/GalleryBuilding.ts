import * as THREE from 'three'
import { createLandmarkLabel } from '../labels'
import { addBox, addFacadeWindows } from './buildingUtils'

const STONE = 0xcfc6b4
const TRIM = 0x8b7355
const WHITE = 0xf4f0e8
const GLASS = 0x111820
const ROOF = 0x5a5348
const BASE = 0x7a7568

/**
 * Low-poly Art Gallery "Vladimir Dimitrov — The Master"
 * Cream public building with large display windows and gallery signage.
 * Front faces −Z.
 */
export function createGalleryBuilding(width = 42, depth = 20): THREE.Group {
  const g = new THREE.Group()
  g.name = 'GalleryKyustendil'

  const baseH = 1.0
  const wallH = 10
  const bodyY = baseH + wallH / 2

  addBox(g, width + 0.4, baseH, depth + 0.4, 0, baseH / 2, 0, BASE)
  addBox(g, width, wallH, depth, 0, bodyY, 0, STONE)

  // Dark trim bands
  addBox(g, width + 0.35, 0.4, depth + 0.35, 0, baseH + 0.2, 0, TRIM)
  addBox(g, width + 0.45, 0.45, depth + 0.45, 0, baseH + wallH - 0.2, 0, TRIM)

  // Protruding glass lobby
  const lobbyW = width * 0.4
  const lobbyD = 3.5
  addBox(g, lobbyW, wallH * 0.85, lobbyD, 0, baseH + (wallH * 0.85) / 2, -depth / 2 - lobbyD / 2 + 0.2, WHITE)
  // Big display glass panels on lobby
  for (const x of [-lobbyW * 0.28, 0, lobbyW * 0.28]) {
    addBox(
      g,
      lobbyW * 0.22,
      wallH * 0.65,
      0.15,
      x,
      baseH + wallH * 0.42,
      -depth / 2 - lobbyD + 0.05,
      GLASS,
    )
  }

  const frontZ = -depth / 2 - 0.05
  addFacadeWindows(g, -width * 0.3, width * 0.25, baseH, wallH, frontZ, {
    cols: 3,
    white: WHITE,
    glass: GLASS,
  })
  addFacadeWindows(g, width * 0.3, width * 0.25, baseH, wallH, frontZ, {
    cols: 3,
    white: WHITE,
    glass: GLASS,
  })

  // Entrance
  addBox(g, 2.6, 3.4, 0.2, 0, baseH + 1.8, -depth / 2 - lobbyD + 0.08, TRIM)
  addBox(g, 2.1, 2.9, 0.12, 0, baseH + 1.8, -depth / 2 - lobbyD + 0.02, 0x1a1510)

  const sign = createLandmarkLabel('ГАЛЕРИЯ', '#8b7355')
  sign.position.set(0, baseH + wallH * 0.78, -depth / 2 - lobbyD - 0.3)
  sign.scale.set(12, 3, 1)
  g.add(sign)

  // Flat roof + skylight strip
  addBox(g, width * 0.98, 0.55, depth * 0.98, 0, baseH + wallH + 0.28, 0, ROOF)
  addBox(g, width * 0.35, 0.25, depth * 0.5, 0, baseH + wallH + 0.55, 0, GLASS)

  return g
}
