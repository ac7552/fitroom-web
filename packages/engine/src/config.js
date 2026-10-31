// Where the engine finds the two things it doesn't carry in its code: the Fitroom API (for the image proxy
// that lets the page read a shop's photos) and its 3D models (the mannequin, its poses, the studio light
// and the cloth textures, in assets/models).
//
//   import { configure } from "@fitroom/engine/config"
//   configure({ apiBase: "https://api.fitroom.example", modelsBase: "/models" })
//
// Both default to the page's own site: the API under /api, the models under /models.

let apiBase = ""
let modelsBase = "/models"

export function configure({ apiBase: api, modelsBase: models } = {}) {
  if (typeof api === "string") apiBase = api.replace(/\/+$/, "")
  if (typeof models === "string") modelsBase = models.replace(/\/+$/, "")
}

// A path on the API ("/api/v1/fits"), as a URL the page can fetch.
export const apiUrl = path => apiBase + path

// A file in the models folder ("mannequin.glb", "textures/suit.webp").
export const modelsUrl = file => `${modelsBase}/${file}`
