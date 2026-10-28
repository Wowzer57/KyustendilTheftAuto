#!/usr/bin/env node
/**
 * Fetch Kyustendil city-center OSM data and bake a lightweight JSON
 * for the Three.js runtime.
 *
 * Prefers the official OSM map API; falls back to Overpass mirrors.
 * Layout (footprints / centerlines) is 1:1 OSM. Heights, widths, and
 * generated sidewalks are inferred from tags + heuristics.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '../public/city/kyustendil-center.json')

const BBOX = {
  south: 42.278,
  west: 22.678,
  north: 42.292,
  east: 22.7,
}

const ORIGIN = {
  lat: 42.2835,
  lon: 22.691,
}

const LANDMARKS = [
  {
    id: 'velbazhd',
    name: 'Velbazhd Square',
    // Large OSM plaza by municipality / post (not the old southern guess)
    lat: 42.28085,
    lon: 22.68845,
    color: '#c45c26',
    blip: 'V',
  },
  {
    id: 'bulgaria-blvd',
    name: 'Bulgaria Blvd',
    lat: 42.2859,
    lon: 22.6869,
    color: '#2f6fed',
    blip: 'B',
  },
  {
    id: 'ahmed-bey',
    name: 'Ahmed Bey / Baths',
    lat: 42.2814,
    lon: 22.6933,
    color: '#2a9d8f',
    blip: 'A',
  },
  {
    id: 'iron-bridge',
    name: 'Iron Bridge',
    lat: 42.28417,
    lon: 22.68627,
    color: '#7b5ea7',
    blip: 'I',
  },
  {
    id: 'museum',
    name: 'History Museum',
    lat: 42.28739,
    lon: 22.68508,
    color: '#e9c46a',
    blip: 'M',
  },
]

const METERS_PER_DEG_LAT = 111320

function project(lat, lon) {
  const metersPerDegLon =
    METERS_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180)
  const x = (lon - ORIGIN.lon) * metersPerDegLon
  const z = -(lat - ORIGIN.lat) * METERS_PER_DEG_LAT
  return [x, z]
}

function wayCoords(nodeIds, nodes) {
  const coords = []
  for (const id of nodeIds) {
    const n = nodes.get(id)
    if (!n) continue
    coords.push(project(n.lat, n.lon))
  }
  return coords
}

function polygonArea(ring) {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return a / 2
}

function ensureClosed(ring) {
  if (ring.length < 3) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, [first[0], first[1]]]
  }
  return ring
}

function isClosedArea(ring) {
  if (ring.length < 4) return false
  const first = ring[0]
  const last = ring[ring.length - 1]
  return Math.abs(first[0] - last[0]) < 0.5 && Math.abs(first[1] - last[1]) < 0.5
}

function levelsFromTags(tags = {}) {
  if (tags['building:levels']) {
    const levels = parseFloat(tags['building:levels'])
    if (!Number.isNaN(levels) && levels > 0) return Math.min(levels, 20)
  }
  if (tags.height) {
    const h = parseFloat(String(tags.height).replace(/m$/i, ''))
    if (!Number.isNaN(h) && h > 0) return Math.max(1, Math.round(h / 3.2))
  }
  if (tags.building === 'church' || tags.building === 'mosque') return 4
  if (tags.building === 'apartments' || tags.building === 'residential') return 5
  if (tags.building === 'industrial' || tags.building === 'warehouse') return 2
  if (tags.building === 'retail' || tags.building === 'commercial') return 3
  return 3
}

function heightFromTags(tags = {}) {
  if (tags.height) {
    const h = parseFloat(String(tags.height).replace(/m$/i, ''))
    if (!Number.isNaN(h) && h > 0) return Math.min(h, 60)
  }
  return Math.min(levelsFromTags(tags) * 3.2, 60)
}

function buildingKind(tags = {}) {
  if (tags.building && tags.building !== 'yes') return tags.building
  if (tags.amenity === 'place_of_worship') return 'church'
  return 'yes'
}

function buildingColor(tags = {}, centroid) {
  const name = (tags.name || tags['name:en'] || '').toLowerCase()
  const kind = buildingKind(tags)
  if (
    name.includes('ahmed') ||
    name.includes('mosque') ||
    kind === 'mosque'
  ) {
    return '#5c7a5a'
  }
  if (kind === 'church' || tags.amenity === 'place_of_worship') return '#8b7355'
  if (kind === 'apartments' || kind === 'residential') return '#a89078'
  if (kind === 'retail' || kind === 'commercial') return '#b8a090'
  if (kind === 'industrial' || kind === 'warehouse') return '#8a8a88'
  if (kind === 'school' || kind === 'university') return '#c2b280'
  const dist = Math.hypot(centroid[0], centroid[1])
  if (dist < 120) return '#c4a484'
  if (dist < 280) return '#b08968'
  return '#9a8b7a'
}

function centroidOf(ring) {
  let x = 0
  let z = 0
  const n = Math.max(ring.length - 1, 1)
  for (let i = 0; i < n; i++) {
    x += ring[i][0]
    z += ring[i][1]
  }
  return [x / n, z / n]
}

function roadWidth(tags = {}) {
  const hwy = tags.highway || ''
  if (tags.width) {
    const w = parseFloat(tags.width)
    if (!Number.isNaN(w) && w > 0) return Math.min(Math.max(w, 2.5), 18)
  }
  if (hwy === 'primary' || hwy === 'trunk') return 10
  if (hwy === 'secondary') return 8.5
  if (hwy === 'tertiary') return 7
  if (hwy === 'residential' || hwy === 'unclassified') return 6
  if (hwy === 'service' || hwy === 'living_street') return 4.2
  if (hwy === 'pedestrian') return 4
  if (hwy === 'footway' || hwy === 'path' || hwy === 'steps') return 2.4
  if (hwy === 'cycleway') return 2
  return 5.5
}

function sidewalkFromTags(tags = {}) {
  const s = (tags.sidewalk || tags['sidewalk:both'] || '').toLowerCase()
  if (s === 'no' || s === 'none') return 'none'
  if (s === 'left') return 'left'
  if (s === 'right') return 'right'
  if (s === 'both' || s === 'yes') return 'both'
  const hwy = tags.highway || ''
  // Kyustendil center: assume sidewalks on most public streets
  if (
    hwy === 'primary' ||
    hwy === 'secondary' ||
    hwy === 'tertiary' ||
    hwy === 'residential' ||
    hwy === 'unclassified' ||
    hwy === 'living_street'
  ) {
    return 'both'
  }
  return 'none'
}

/** Offset a polyline by meters to the left (positive) in XZ. */
function offsetPath(path, offset) {
  if (path.length < 2) return []
  const out = []
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)]
    const next = path[Math.min(path.length - 1, i + 1)]
    const dx = next[0] - prev[0]
    const dz = next[1] - prev[1]
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    out.push([path[i][0] + nx * offset, path[i][1] + nz * offset])
  }
  return out
}

function parseOsmXml(xml) {
  const nodes = new Map()
  const ways = []
  const relations = []

  const nodeRe =
    /<node\s+id="(\d+)"[^>]*\slat="([^"]+)"[^>]*\slon="([^"]+)"[^>]*\/?>/g
  let m
  while ((m = nodeRe.exec(xml))) {
    nodes.set(Number(m[1]), { id: Number(m[1]), lat: Number(m[2]), lon: Number(m[3]) })
  }

  const wayRe = /<way\s+id="(\d+)"[\s\S]*?<\/way>/g
  while ((m = wayRe.exec(xml))) {
    const block = m[0]
    const id = Number(m[1])
    const nds = [...block.matchAll(/<nd\s+ref="(\d+)"\s*\/>/g)].map((x) => Number(x[1]))
    const tags = {}
    for (const t of block.matchAll(/<tag\s+k="([^"]*)"\s+v="([^"]*)"\s*\/>/g)) {
      tags[t[1]] = t[2]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
    }
    ways.push({ id, nodes: nds, tags })
  }

  const relRe = /<relation\s+id="(\d+)"[\s\S]*?<\/relation>/g
  while ((m = relRe.exec(xml))) {
    const block = m[0]
    const id = Number(m[1])
    const members = [
      ...block.matchAll(/<member\s+type="([^"]+)"\s+ref="(\d+)"\s+role="([^"]*)"\s*\/>/g),
    ].map((x) => ({ type: x[1], ref: Number(x[2]), role: x[3] }))
    const tags = {}
    for (const t of block.matchAll(/<tag\s+k="([^"]*)"\s+v="([^"]*)"\s*\/>/g)) {
      tags[t[1]] = t[2]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
    }
    relations.push({ id, members, tags })
  }

  return { nodes, ways, relations }
}

function bakeBuilding(tags, ring) {
  const c = centroidOf(ring)
  return {
    footprint: ring,
    height: heightFromTags(tags),
    levels: levelsFromTags(tags),
    kind: buildingKind(tags),
    color: buildingColor(tags, c),
    name: tags.name || tags['name:en'] || null,
  }
}

function bakeFromMaps(nodes, ways, relations) {
  const buildings = []
  const roads = []
  const parks = []
  const water = []
  const plazas = []
  const pavements = []

  for (const way of ways) {
    const tags = way.tags || {}
    const coords = wayCoords(way.nodes || [], nodes)
    if (coords.length < 2) continue
    const ring = ensureClosed(coords)

    if (tags.building) {
      if (ring.length < 4) continue
      buildings.push(bakeBuilding(tags, ring))
      continue
    }

    // Plaza / square / pedestrian areas (closed)
    if (
      (tags.place === 'square' ||
        tags.landuse === 'plaza' ||
        tags.highway === 'pedestrian' ||
        tags.area === 'yes' ||
        tags['area:highway'] === 'pedestrian') &&
      isClosedArea(ring) &&
      Math.abs(polygonArea(ring)) > 40
    ) {
      if (tags.highway === 'pedestrian' && tags.area !== 'yes' && !tags.place && !tags.landuse) {
        // open pedestrian ways handled as roads below unless closed with area
      } else {
        plazas.push({ footprint: ring, kind: tags.place || tags.landuse || 'pedestrian' })
        if (tags.highway === 'pedestrian' && (tags.area === 'yes' || tags.place || tags.landuse)) {
          continue
        }
      }
    }

    if (tags.highway) {
      // Closed pedestrian plaza already stored; skip ribbon if area=yes
      if (
        tags.highway === 'pedestrian' &&
        (tags.area === 'yes' || tags.place === 'square') &&
        isClosedArea(ring)
      ) {
        continue
      }
      const road = {
        path: coords,
        width: roadWidth(tags),
        kind: tags.highway,
        name: tags.name || tags['name:en'] || null,
        sidewalk: sidewalkFromTags(tags),
      }
      roads.push(road)

      // Generate pavement strips from centerline (OSM rarely has separate sidewalk ways)
      if (road.sidewalk !== 'none') {
        const half = road.width * 0.5 + 1.35
        const paveW = 1.8
        if (road.sidewalk === 'both' || road.sidewalk === 'left') {
          pavements.push({
            path: offsetPath(coords, half),
            width: paveW,
            kind: 'sidewalk',
            name: road.name,
            sidewalk: 'none',
          })
        }
        if (road.sidewalk === 'both' || road.sidewalk === 'right') {
          pavements.push({
            path: offsetPath(coords, -half),
            width: paveW,
            kind: 'sidewalk',
            name: road.name,
            sidewalk: 'none',
          })
        }
      }
      continue
    }

    if (
      tags.leisure === 'park' ||
      tags.leisure === 'garden' ||
      tags.landuse === 'grass' ||
      tags.landuse === 'recreation_ground' ||
      tags.landuse === 'village_green'
    ) {
      if (ring.length >= 4) parks.push({ footprint: ring, kind: tags.leisure || tags.landuse })
      continue
    }

    if (
      tags.natural === 'water' ||
      tags.waterway === 'riverbank' ||
      tags.waterway === 'river' ||
      tags.landuse === 'basin'
    ) {
      if (ring.length >= 4) water.push({ footprint: ring, kind: 'water' })
    }
  }

  for (const rel of relations) {
    const tags = rel.tags || {}
    if (!tags.building) continue
    const outers = (rel.members || []).filter(
      (member) => member.type === 'way' && member.role === 'outer',
    )
    for (const member of outers) {
      const way = ways.find((w) => w.id === member.ref)
      if (!way) continue
      const ring = ensureClosed(wayCoords(way.nodes || [], nodes))
      if (ring.length < 4) continue
      buildings.push(bakeBuilding({ ...tags, ...way.tags }, ring))
    }
  }

  const seen = new Set()
  const uniqueBuildings = []
  for (const b of buildings.sort(
    (a, b) => Math.abs(polygonArea(b.footprint)) - Math.abs(polygonArea(a.footprint)),
  )) {
    const c = centroidOf(b.footprint)
    const key = `${c[0].toFixed(1)},${c[1].toFixed(1)}`
    if (seen.has(key)) continue
    seen.add(key)
    uniqueBuildings.push(b)
  }

  const spawns = LANDMARKS.map((l) => {
    const [x, z] = project(l.lat, l.lon)
    return { ...l, x, z }
  })

  return {
    meta: {
      name: 'Kyustendil City Center',
      source: 'OpenStreetMap',
      note: 'Footprints/centerlines are OSM 1:1; heights/widths/sidewalks are inferred.',
      bbox: BBOX,
      origin: ORIGIN,
      generatedAt: new Date().toISOString(),
      counts: {
        buildings: uniqueBuildings.length,
        roads: roads.length,
        parks: parks.length,
        water: water.length,
        plazas: plazas.length,
        pavements: pavements.length,
      },
    },
    spawns,
    buildings: uniqueBuildings,
    roads,
    parks,
    water,
    plazas,
    pavements,
  }
}

async function fetchOsmApi() {
  const { west, south, east, north } = BBOX
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${west},${south},${east},${north}`
  console.log(`Fetching OSM API: ${url}`)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'KyustendilTheftAuto/0.1 (city bake script)' },
  })
  if (!res.ok) throw new Error(`OSM API HTTP ${res.status}`)
  return parseOsmXml(await res.text())
}

async function fetchOverpass() {
  const { south, west, north, east } = BBOX
  const query = `
[out:json][timeout:90];
(
  way["building"](${south},${west},${north},${east});
  way["highway"](${south},${west},${north},${east});
  way["natural"="water"](${south},${west},${north},${east});
  way["waterway"="riverbank"](${south},${west},${north},${east});
  way["landuse"](${south},${west},${north},${east});
  way["leisure"="park"](${south},${west},${north},${east});
  way["leisure"="garden"](${south},${west},${north},${east});
  way["place"="square"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
);
(._;>;);
out body;
`
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]

  let lastError
  for (const url of endpoints) {
    try {
      console.log(`Fetching Overpass: ${url}`)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      })
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} from ${url}`)
        continue
      }
      const json = await res.json()
      const nodes = new Map()
      const ways = []
      const relations = []
      for (const el of json.elements || []) {
        if (el.type === 'node') nodes.set(el.id, el)
        else if (el.type === 'way') ways.push(el)
        else if (el.type === 'relation') relations.push(el)
      }
      return { nodes, ways, relations }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('Overpass fetch failed')
}

async function main() {
  const localXml = process.argv[2]
  let maps
  if (localXml) {
    console.log(`Reading local OSM XML: ${localXml}`)
    maps = parseOsmXml(await readFile(localXml, 'utf8'))
  } else {
    try {
      maps = await fetchOsmApi()
    } catch (err) {
      console.warn('OSM API failed, trying Overpass…', err.message || err)
      maps = await fetchOverpass()
    }
  }

  console.log(
    `Parsed nodes=${maps.nodes.size} ways=${maps.ways.length} relations=${maps.relations.length}`,
  )
  const city = bakeFromMaps(maps.nodes, maps.ways, maps.relations)
  console.log('Baked:', city.meta.counts)
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(city))
  console.log(`Wrote ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
