export type Vec2 = [number, number]

export interface SpawnPoint {
  id: string
  name: string
  lat: number
  lon: number
  color: string
  x: number
  z: number
}

export interface BuildingData {
  footprint: Vec2[]
  height: number
  color: string
  name: string | null
}

export interface RoadData {
  path: Vec2[]
  width: number
  kind: string
  name: string | null
}

export interface AreaData {
  footprint: Vec2[]
}

export interface CityData {
  meta: {
    name: string
    bbox: { south: number; west: number; north: number; east: number }
    origin: { lat: number; lon: number }
    generatedAt: string
    counts: {
      buildings: number
      roads: number
      parks: number
      water: number
    }
  }
  spawns: SpawnPoint[]
  buildings: BuildingData[]
  roads: RoadData[]
  parks: AreaData[]
  water: AreaData[]
}

export type GameMode = 'walk' | 'drive'
