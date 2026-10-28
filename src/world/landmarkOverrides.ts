import type { BuildingData, Vec2 } from '../types'
import type { FacadeStyle } from './materials'

export interface LandmarkOverride {
  id: string
  sign: string
  signColor: string
  style: FacadeStyle
  color: string
  /** Multiplier on OSM height */
  heightMul: number
  /** Match by substring of OSM name (case-insensitive) */
  nameIncludes?: string[]
  /**
   * World XZ target for nearest-footprint match.
   * Prefer verified lat/lon projected into city space (see comments).
   */
  near?: { x: number; z: number; maxDist: number }
  /** Prefer modest footprints for shops (skip huge civic shells). */
  maxArea?: number
}

/**
 * Velbazhd Square ring landmarks — positions from Nominatim / public listings
 * projected with origin (42.2835, 22.691), same as the OSM bake.
 *
 *  Plaza      42.28080, 22.68848  →  (~-207, 300)
 *  Obshtina   42.28121, 22.68893  →  (~-171, 254)
 *  Post       42.28133, 22.68795  →  (~-252, 242)
 *  A1         42.28016, 22.68871  →  (~-189, 372)  ул. Демокрация 37
 *  Слънчевата 42.28070, 22.68778  →  (~-265, 312)  ул. Отец Паисий 33
 *  Малкият Принц — ул. Полк. Стефан Манов 34 (OSM street ~ -96, 505)
 */
export const SQUARE_LANDMARKS: LandmarkOverride[] = [
  {
    id: 'municipality',
    sign: 'ОБЩИНА КЮСТЕНДИЛ',
    signColor: '#d4a017',
    style: 'civic',
    color: '#c43c36',
    heightMul: 1.55,
    nameIncludes: ['община кюстендил', 'община'],
  },
  {
    id: 'post',
    sign: 'ПОЩА',
    signColor: '#3d5a80',
    style: 'post',
    color: '#f0e6a8',
    heightMul: 1.35,
    nameIncludes: ['пс кюстендил', 'поща'],
    near: { x: -252, z: 242, maxDist: 45 },
  },
  {
    id: 'gallery',
    sign: 'ГАЛЕРИЯ',
    signColor: '#8b7355',
    style: 'gallery',
    color: '#cfc6b4',
    heightMul: 1.2,
    nameIncludes: ['галерия', 'димитров'],
  },
  {
    id: 'slunchevata',
    sign: 'СЛЪНЧЕВАТА',
    signColor: '#c45c26',
    style: 'cafe',
    color: '#c4a484',
    heightMul: 1.05,
    near: { x: -265, z: 312, maxDist: 55 },
    maxArea: 600,
  },
  {
    id: 'a1',
    sign: 'A1',
    signColor: '#0d7377',
    style: 'a1',
    color: '#e8eef2',
    heightMul: 1.05,
    near: { x: -189, z: 372, maxDist: 30 },
    maxArea: 500,
  },
  {
    id: 'malkiyat-princ',
    sign: 'МАЛКИЯТ ПРИНЦ',
    signColor: '#7b5ea7',
    style: 'shop',
    color: '#d4b896',
    heightMul: 1.05,
    // ул. Полк. Стефан Манов 34 — not on Velbazhd plaza
    near: { x: -96, z: 505, maxDist: 35 },
    maxArea: 800,
  },
]

function centroid(ring: Vec2[]): [number, number] {
  let x = 0
  let z = 0
  const n = Math.max(ring.length - 1, 1)
  for (let i = 0; i < n; i++) {
    x += ring[i][0]
    z += ring[i][1]
  }
  return [x / n, z / n]
}

/** Assign each override to at most one building (name match wins, else nearest). */
export function resolveLandmarkBuildings(
  buildings: BuildingData[],
): Map<number, LandmarkOverride> {
  const assigned = new Map<number, LandmarkOverride>()
  const used = new Set<number>()

  // Pass 1: name matches
  for (const lm of SQUARE_LANDMARKS) {
    if (!lm.nameIncludes?.length) continue
    let hit = -1
    let bestD = Infinity
    for (let i = 0; i < buildings.length; i++) {
      if (used.has(i)) continue
      const name = (buildings[i].name || '').toLowerCase()
      if (!name) continue
      if (!lm.nameIncludes.some((s) => name.includes(s))) continue
      // Prefer the name hit closest to near-target when provided
      if (lm.near) {
        const [x, z] = centroid(buildings[i].footprint)
        const d = Math.hypot(x - lm.near.x, z - lm.near.z)
        if (d < bestD) {
          bestD = d
          hit = i
        }
      } else {
        hit = i
        break
      }
    }
    if (hit >= 0) {
      assigned.set(hit, lm)
      used.add(hit)
    }
  }

  // Pass 2: proximity for remaining landmarks
  for (const lm of SQUARE_LANDMARKS) {
    if ([...assigned.values()].includes(lm)) continue
    if (!lm.near) continue
    let best = -1
    let bestD = lm.near.maxDist
    const maxArea = lm.maxArea ?? 2500
    for (let i = 0; i < buildings.length; i++) {
      if (used.has(i)) continue
      const [x, z] = centroid(buildings[i].footprint)
      const d = Math.hypot(x - lm.near.x, z - lm.near.z)
      const area = footprintArea(buildings[i].footprint)
      if (area > maxArea) continue
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best >= 0) {
      assigned.set(best, lm)
      used.add(best)
    }
  }

  return assigned
}

function footprintArea(ring: Vec2[]): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return Math.abs(a / 2)
}

export function footprintCentroid(ring: Vec2[]): [number, number] {
  return centroid(ring)
}

/** True if building sits on the Velbazhd square ring (near plaza). */
export function isOnSquareRing(x: number, z: number): boolean {
  return Math.hypot(x - -207, z - 300) < 120
}
