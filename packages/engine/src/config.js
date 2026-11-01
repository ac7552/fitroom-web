// Where the engine finds what it doesn't carry in its code: the Fitroom API (for the image proxy that lets the
// page read a shop's photos), its 3D models (the mannequin, its poses, the studio light and the cloth
// textures, in assets/models) and its drape bank (garments draped before, in assets/drapes).
//
//   import { configure } from "@fitroom/engine/config"
//   configure({ apiBase: "https://api.fitroom.example", modelsBase: "/models", drapesBase: "/drapes" })
//
// All default to the page's own site: the API under /api, the models under /models, the bank under /drapes.

let apiBase = ""
let modelsBase = "/models"
let drapesBase = "/drapes"

export function configure({ apiBase: api, modelsBase: models, drapesBase: drapes } = {}) {
  if (typeof api === "string") apiBase = api.replace(/\/+$/, "")
  if (typeof models === "string") modelsBase = models.replace(/\/+$/, "")
  if (typeof drapes === "string") drapesBase = drapes.replace(/\/+$/, "")
}

// Where the drape bank's index.json and entries are.
export const drapesUrl = () => drapesBase

// A path on the API ("/api/v1/fits"), as a URL the page can fetch.
export const apiUrl = path => apiBase + path

// A file in the models folder ("mannequin.glb", "textures/suit.webp").
export const modelsUrl = file => `${modelsBase}/${file}`
