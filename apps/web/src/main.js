// The page's start: points the engine at the API and the 3D models, starts the hero at once, then asks the
// API what it offers (the sample garments, whether the AI try-on is set up) and starts the fitting room.
import "./styles/application.css"
import { Application } from "@hotwired/stimulus"
import { apiUrl, configure, modelsUrl } from "@fitroom/engine/config"
import FittingRoomController from "./controllers/fitting_room_controller.js"
import HeroController from "./controllers/hero_controller.js"
import { loadSetup } from "./setup.js"

configure({
  apiBase: import.meta.env.VITE_API_URL ?? "",
  modelsBase: import.meta.env.VITE_MODELS_URL || "/models"
})

// Our sample pages, by the setup's sample each one is.
const SAMPLE_PAGES = { "/samples/grey-t-shirt.html": "garment", "/samples/navy-suit-jacket.html": "jacket", "/samples/grey-trousers.html": "trousers" }

const application = Application.start()
window.Stimulus = application   // (as the Rails app's page has it: handy in the console)

const hero = document.querySelector('[data-controller="hero"]')
if (hero) hero.dataset.heroModelValue = modelsUrl("jacket.glb")
application.register("hero", HeroController)

async function startFittingRoom() {
  const room = document.querySelector('[data-setup="fitting-room"]')
  if (!room) return
  const setup = await loadSetup(apiUrl("/api/v1/setup"))

  const values = {
    fitsUrl: apiUrl("/api/v1/fits"),
    importUrl: apiUrl("/api/v1/garment_imports"),
    studioUrl: apiUrl("/api/v1/studio_photos"),
    garment: JSON.stringify(setup.samples.garment ?? {}),
    dress: JSON.stringify(setup.samples.dress ?? {}),
    samples: JSON.stringify(setup.samples)
  }
  if (setup.try_on) Object.assign(values, { tryOnUrl: apiUrl("/api/v1/try_ons"), warmUrl: apiUrl("/api/v1/try_ons/warm") })
  for (const [key, value] of Object.entries(values)) room.dataset[`fittingRoom${key[0].toUpperCase()}${key.slice(1)}Value`] = value
  if (!setup.try_on) room.querySelectorAll('[data-needs="try-on"]').forEach(element => element.remove())
  // An API that can't read store links (the small Node API, apps/api) gives its samples ready-made: the "try one
  // of ours" buttons, which otherwise read our sample pages as links, take those instead.
  if (setup.imports === false) {
    for (const button of room.querySelectorAll('[data-action="fitting-room#useSample"]')) {
      const name = SAMPLE_PAGES[button.dataset.path]
      if (!setup.samples[name]) continue
      button.dataset.action = "fitting-room#useSampleGarment"
      button.dataset.fittingRoomSampleParam = name
    }
  }

  room.dataset.controller = "fitting-room"
  application.register("fitting-room", FittingRoomController)
}

startFittingRoom()
