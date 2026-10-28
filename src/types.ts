export type Vec2 = [number, number]

export interface SpawnPoint {
  id: string
  name: string
  lat: number
  lon: number
  color: string
  x: number
  z: number
  blip: string
}

export interface BuildingData {
  footprint: Vec2[]
  height: number
  color: string
  name: string | null
  levels: number
  kind: string
}

export interface RoadData {
  path: Vec2[]
  width: number
  kind: string
  name: string | null
  /** both | left | right | none — used to generate pavement strips */
  sidewalk: 'both' | 'left' | 'right' | 'none'
}

export interface AreaData {
  footprint: Vec2[]
  kind?: string
}

export interface PoiData {
  id: string
  name: string | null
  shop: string | null
  amenity: string | null
  office: string | null
  brand: string | null
  lat: number
  lon: number
  x: number
  z: number
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
      plazas: number
      pavements: number
      pois?: number
      poiNamesSnapped?: number
    }
  }
  spawns: SpawnPoint[]
  buildings: BuildingData[]
  roads: RoadData[]
  parks: AreaData[]
  water: AreaData[]
  plazas: AreaData[]
  /** Offset sidewalk ribbons generated from OSM roads */
  pavements: RoadData[]
  /** Shop / amenity / office nodes from OSM (1:1). */
  pois?: PoiData[]
}

export type GameMode = 'walk' | 'drive'
