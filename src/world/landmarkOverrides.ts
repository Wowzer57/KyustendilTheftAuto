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
  /** World XZ target for nearest-footprint match */
  near?: { x: number; z: number; maxDist: number }
}

/**
 * Velbazhd Square ring landmarks.
 * Named OSM buildings matched by name; shops by proximity to known spots.
 * Coords are in the same projected meters as city JSON (origin 42.2835, 22.691).
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
    // Cafe on square / Отец Паисий edge — near plaza west-south
    near: { x: -240, z: 280, maxDist: 55 },
  },
  {
    id: 'a1',
    sign: 'A1',
    signColor: '#0d7377',
    style: 'a1',
    color: '#e8eef2',
    heightMul: 1.05,
    near: { x: -185, z: 310, maxDist: 50 },
  },
  {
    id: 'malkiyat-princ',
    sign: 'МАЛКИЯТ ПРИНЦ',
    signColor: '#7b5ea7',
    style: 'shop',
    color: '#d4b896',
    heightMul: 1.05,
    near: { x: -230, z: 250, maxDist: 55 },
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

export interface ResolvedLandmark {
  override: LandmarkOverride
  buildingIndex: number
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
    for (let i = 0; i < buildings.length; i++) {
      if (used.has(i)) continue
      const name = (buildings[i].name || '').toLowerCase()
      if (!name) continue
      if (lm.nameIncludes.some((s) => name.includes(s))) {
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
    for (let i = 0; i < buildings.length; i++) {
      if (used.has(i)) continue
      const [x, z] = centroid(buildings[i].footprint)
      const d = Math.hypot(x - lm.near.x, z - lm.near.z)
      // Prefer modest footprints for shops (not huge galleries)
      const area = footprintArea(buildings[i].footprint)
      if (area > 2500) continue
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
  // Plaza centroid ~ (-210, 295)
  return Math.hypot(x - -210, z - 295) < 110
}
