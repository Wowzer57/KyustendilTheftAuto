import './style.css'
import type { CityData, GameMode, SpawnPoint } from './types'
import { MapSelect } from './ui/MapSelect'
import { Game } from './game/Game'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <section id="main-menu" class="screen">
    <div class="menu-card">
      <h1 class="brand">Kyustendil<br/>Theft Auto</h1>
      <p class="tagline">Low-poly Kyustendil city center — walk the streets, steal a ride.</p>
      <div class="menu-actions">
        <button type="button" class="btn btn-primary" id="btn-start">Start</button>
        <button type="button" class="btn" id="btn-controls">Controls</button>
      </div>
      <p class="menu-hint">Recognizable OSM layout · browser MVP</p>
    </div>
  </section>

  <section id="map-select" class="screen" hidden></section>

  <div id="game-canvas-wrap" hidden>
    <canvas id="game-canvas"></canvas>
  </div>

  <div id="hud" hidden>
    <div class="hud-top">
      <div class="hud-panel">Mode: <strong id="hud-mode">Walk</strong></div>
      <div class="hud-panel">Near: <strong id="hud-loc">—</strong></div>
    </div>
    <div class="crosshair" id="crosshair"></div>
    <div class="prompt" id="prompt"></div>
    <div class="speedo" id="speedo">0 <span style="font-size:1rem">km/h</span></div>
  </div>

  <div class="controls-modal" id="controls-modal" hidden>
    <div class="controls-card">
      <h3>Controls</h3>
      <ul>
        <li><strong>W A S D</strong> — move / steer</li>
        <li><strong>W</strong> — gas (in car)</li>
        <li><strong>S</strong> — brake / reverse (in car)</li>
        <li><strong>Mouse</strong> — look (click to capture)</li>
        <li><strong>Shift</strong> — sprint (on foot)</li>
        <li><strong>E</strong> — enter / exit car</li>
        <li><strong>Esc</strong> — pause</li>
      </ul>
      <button type="button" class="btn btn-primary" id="btn-controls-close">Got it</button>
    </div>
  </div>

  <div class="pause-modal" id="pause-modal" hidden>
    <div class="controls-card pause-card">
      <h3>Paused</h3>
      <div class="menu-actions">
        <button type="button" class="btn btn-primary" id="btn-resume">Resume</button>
        <button type="button" class="btn" id="btn-back-map">Back to map</button>
        <button type="button" class="btn" id="btn-main-menu">Main menu</button>
      </div>
    </div>
  </div>
`

const mainMenu = app.querySelector<HTMLElement>('#main-menu')!
const mapSelectEl = app.querySelector<HTMLElement>('#map-select')!
const gameWrap = app.querySelector<HTMLElement>('#game-canvas-wrap')!
const canvas = app.querySelector<HTMLCanvasElement>('#game-canvas')!
const hud = app.querySelector<HTMLElement>('#hud')!
const controlsModal = app.querySelector<HTMLElement>('#controls-modal')!
const pauseModal = app.querySelector<HTMLElement>('#pause-modal')!

const hudMode = app.querySelector<HTMLElement>('#hud-mode')!
const hudLoc = app.querySelector<HTMLElement>('#hud-loc')!
const promptEl = app.querySelector<HTMLElement>('#prompt')!
const speedo = app.querySelector<HTMLElement>('#speedo')!
const crosshair = app.querySelector<HTMLElement>('#crosshair')!

let city: CityData | null = null
let mapSelect: MapSelect | null = null
let game: Game | null = null

function show(el: HTMLElement) {
  el.hidden = false
}
function hide(el: HTMLElement) {
  el.hidden = true
}

async function loadCity(): Promise<CityData> {
  const res = await fetch('/city/kyustendil-center.json')
  if (!res.ok) throw new Error('Failed to load city data')
  return (await res.json()) as CityData
}

function leaveGame() {
  hide(gameWrap)
  hide(hud)
  hide(pauseModal)
  game = null
}

function openMapSelect() {
  if (!city) return
  hide(mainMenu)
  show(mapSelectEl)
  mapSelect?.destroy()
  mapSelect = new MapSelect({
    root: mapSelectEl,
    spawns: city.spawns,
    onBack: () => {
      mapSelect?.destroy()
      mapSelect = null
      hide(mapSelectEl)
      show(mainMenu)
    },
    onStart: (spawn) => startGame(spawn),
  })
  mapSelect.setCityPreview({
    roads: city.roads,
    buildings: city.buildings,
  })
}

function startGame(spawn: SpawnPoint) {
  if (!city) return
  mapSelect?.destroy()
  mapSelect = null
  hide(mapSelectEl)
  hide(mainMenu)
  hide(pauseModal)
  show(gameWrap)
  show(hud)

  game?.stop()
  game = new Game(
    canvas,
    city,
    {
      setMode: (mode: GameMode) => {
        hudMode.textContent = mode === 'walk' ? 'Walk' : 'Drive'
        crosshair.style.opacity = mode === 'walk' ? '0.7' : '0'
      },
      setPrompt: (text) => {
        if (!text) {
          promptEl.classList.remove('visible')
          promptEl.textContent = ''
          return
        }
        promptEl.textContent = text
        promptEl.classList.add('visible')
      },
      setSpeed: (kmh) => {
        if (kmh == null) {
          speedo.classList.remove('visible')
          return
        }
        speedo.classList.add('visible')
        speedo.innerHTML = `${Math.round(kmh)} <span style="font-size:1rem">km/h</span>`
      },
      setLocation: (name) => {
        hudLoc.textContent = name
      },
      setPaused: (paused) => {
        if (paused) show(pauseModal)
        else hide(pauseModal)
      },
    },
    (action) => {
      leaveGame()
      if (action === 'map') openMapSelect()
      else show(mainMenu)
    },
  )
  game.startAt(spawn)
}

app.querySelector('#btn-start')!.addEventListener('click', () => {
  if (!city) return
  openMapSelect()
})
app.querySelector('#btn-controls')!.addEventListener('click', () => {
  show(controlsModal)
})
app.querySelector('#btn-controls-close')!.addEventListener('click', () => {
  hide(controlsModal)
})
app.querySelector('#btn-resume')!.addEventListener('click', () => {
  game?.handlePauseAction('resume')
})
app.querySelector('#btn-back-map')!.addEventListener('click', () => {
  game?.handlePauseAction('map')
})
app.querySelector('#btn-main-menu')!.addEventListener('click', () => {
  game?.handlePauseAction('menu')
})

const boot = app.querySelector<HTMLElement>('.tagline')!
boot.textContent = 'Loading Kyustendil center…'

loadCity()
  .then((data) => {
    city = data
    boot.textContent = `Low-poly Kyustendil · ${data.meta.counts.buildings} buildings · pick a spawn and drive.`
  })
  .catch((err) => {
    console.error(err)
    boot.textContent = 'Failed to load city data. Check /public/city/kyustendil-center.json'
  })
