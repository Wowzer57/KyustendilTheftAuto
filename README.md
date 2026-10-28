# KyustendilTheftAuto

Browser MVP of a low-poly, recognizable **Kyustendil city center** you can walk (first person) and drive (third person).

Built with **Vite + TypeScript + Three.js**. Streets and building footprints come from OpenStreetMap.

## Play

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

1. **Start** → interactive center map (drag to pan, scroll to zoom)
2. Click a spawn (Velbazhd Square, Bulgaria Blvd, Ahmed Bey / Baths, Iron Bridge, History Museum)
3. **Spawn here** → click the game view to capture the mouse

### Controls

| Key | Action |
| --- | --- |
| W A S D | Move / steer |
| W | Gas (in car) |
| S | Brake / reverse (in car) |
| Mouse | Look (on foot) |
| Shift | Sprint |
| E | Enter / exit nearest car |
| Esc | Pause (Resume / Back to map / Main menu) |

While playing, a **FiveM-style radar** (bottom-left) shows Kyustendil streets (yellow majors), landmark letter blips, a north marker, and a KYUSTENDIL zone strip. Floating labels mark Velbazhd Square, Bulgaria Blvd, and other spawn landmarks.

**Map fidelity:** building footprints and road centerlines are **1:1 OpenStreetMap**. Heights, road widths, sidewalks, roofs, and facades are inferred / stylized low-poly — not photoreal.

## Refresh city data

Re-bake OSM for the center bbox:

```bash
npm run fetch-city
# or from a local .osm XML dump:
node scripts/fetch-osm.mjs path/to/map.osm
```

Output: `public/city/kyustendil-center.json`

## Scope

- City **center only** (not full municipal footprint)
- Low-poly extruded buildings + road ribbons
- Simple arcade car physics
- No NPCs / wanted system / multiplayer (yet)

Map data © OpenStreetMap contributors.
