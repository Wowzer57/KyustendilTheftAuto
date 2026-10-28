#!/usr/bin/env node
/**
 * Fetch Kyustendil city-center OSM data and bake a lightweight JSON
 * for the Three.js runtime.
 *
 * Prefers the official OSM map API; falls back to Overpass mirrors.
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
    // Pedestrian core near square / Bulgaria Blvd start
    lat: 42.28355,
    lon: 22.68855,
    color: '#c45c26',
  },
  {
    id: 'bulgaria-blvd',
    name: 'Bulgaria Blvd',
    lat: 42.2859,
    lon: 22.6869,
    color: '#2f6fed',
  },
  {
    id: 'ahmed-bey',
    name: 'Ahmed Bey / Baths',
    lat: 42.2814,
    lon: 22.6933,
    color: '#2a9d8f',
  },
  {
    id: 'iron-bridge',
    name: 'Iron Bridge',
    lat: 42.28417,
    lon: 22.68627,
    color: '#7b5ea7',
  },
  {
    id: 'museum',
    name: 'History Museum',
    lat: 42.28739,
    lon: 22.68508,
    color: '#e9c46a',
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

function heightFromTags(tags = {}) {
  if (tags.height) {
    const h = parseFloat(String(tags.height).replace(/m$/i, ''))
    if (!Number.isNaN(h) && h > 0) return Math.min(h, 60)
  }
  if (tags['building:levels']) {
    const levels = parseFloat(tags['building:levels'])
    if (!Number.isNaN(levels) && levels > 0) return Math.min(levels * 3.2, 60)
  }
  if (tags.building === 'church' || tags.building === 'mosque') return 14
  if (tags.building) return 9
  return 8
}

function buildingColor(tags = {}, centroid) {
  const name = (tags.name || tags['name:en'] || '').toLowerCase()
  if (
    name.includes('ahmed') ||
    name.includes('mosque') ||
    tags.building === 'mosque'
  ) {
    return '#5c7a5a'
  }
  if (tags.amenity === 'place_of_worship' || tags.building === 'church') {
    return '#8b7355'
  }
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
  if (hwy === 'primary' || hwy === 'trunk') return 9
  if (hwy === 'secondary') return 7.5
  if (hwy === 'tertiary') return 6.5
  if (hwy === 'residential' || hwy === 'unclassified') return 5.5
  if (hwy === 'service' || hwy === 'living_street') return 4
  if (hwy === 'pedestrian' || hwy === 'footway' || hwy === 'path') return 3.2
  return 5
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

function bakeFromMaps(nodes, ways, relations) {
  const buildings = []
  const roads = []
  const parks = []
  const water = []

  for (const way of ways) {
    const tags = way.tags || {}
    const ring = ensureClosed(wayCoords(way.nodes || [], nodes))
    if (ring.length < 2) continue

    if (tags.building) {
      if (ring.length < 4) continue
      const c = centroidOf(ring)
      buildings.push({
        footprint: ring,
        height: heightFromTags(tags),
        color: buildingColor(tags, c),
        name: tags.name || tags['name:en'] || null,
      })
      continue
    }

    if (tags.highway) {
      roads.push({
        path: ring,
        width: roadWidth(tags),
        kind: tags.highway,
        name: tags.name || tags['name:en'] || null,
      })
      continue
    }

    if (
      tags.leisure === 'park' ||
      tags.leisure === 'garden' ||
      tags.landuse === 'grass' ||
      tags.landuse === 'recreation_ground'
    ) {
      if (ring.length >= 4) parks.push({ footprint: ring })
      continue
    }

    if (tags.natural === 'water' || tags.waterway === 'riverbank') {
      if (ring.length >= 4) water.push({ footprint: ring })
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
      const merged = { ...tags, ...way.tags }
      const c = centroidOf(ring)
      buildings.push({
        footprint: ring,
        height: heightFromTags(merged),
        color: buildingColor(merged, c),
        name: tags.name || way.tags?.name || null,
      })
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
      bbox: BBOX,
      origin: ORIGIN,
      generatedAt: new Date().toISOString(),
      counts: {
        buildings: uniqueBuildings.length,
        roads: roads.length,
        parks: parks.length,
        water: water.length,
      },
    },
    spawns,
    buildings: uniqueBuildings,
    roads,
    parks,
    water,
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
  way["landuse"="grass"](${south},${west},${north},${east});
  way["landuse"="recreation_ground"](${south},${west},${north},${east});
  way["leisure"="park"](${south},${west},${north},${east});
  way["leisure"="garden"](${south},${west},${north},${east});
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
