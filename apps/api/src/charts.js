// The size charts the API knows: the made-up samples in @fitroom/engine/assets/size_charts, as the Rails app's
// SizeChart has them. Charts describe garments, never the person using the app.
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { SIZE_MEASUREMENTS, TROUSER_MEASUREMENTS } from "@fitroom/engine/fit"

const DIR = dirname(fileURLToPath(import.meta.resolve("@fitroom/engine/assets/size_charts/sample_t_shirt.json")))
const NAVY = "#1f2a4a"

export class NotFound extends Error {}

export function findChart(key) {
  if (!/^[a-z0-9_]+$/.test(String(key))) throw new NotFound(`no size chart named ${key}`)
  let data
  try { data = JSON.parse(readFileSync(join(DIR, `${key}.json`), "utf8")) } catch { throw new NotFound(`no size chart named ${key}`) }
  return chartFrom(key, data)
}

export function allCharts() {
  return readdirSync(DIR).filter(name => name.endsWith(".json")).sort().map(name => findChart(name.slice(0, -5)))
}

function chartFrom(key, data) {
  const measures = data.garment === "trousers" ? TROUSER_MEASUREMENTS : SIZE_MEASUREMENTS
  const sizes = data.sizes.map(size => Object.fromEntries(["name", ...measures].filter(m => m in size).map(m => [m, size[m]])))
  const summary = { key, name: data.name, garment: data.garment, source: data.source }
  return {
    key, summary, sizes,
    json: () => ({ ...summary, sizes }),
    // The same shape a garment import returns, so the page treats built-in and imported clothes alike.
    asGarment: () => ({
      name: data.name, brand: null, color_name: data.color_name ?? "Navy", color: data.color ?? NAVY, source_url: null, garment: data.garment,
      ...(data.style ? { style: data.style } : {}), ...(data.fabric ? { fabric: data.fabric } : {}), ...(data.cut ? { cut: data.cut } : {}),
      chart: { sizes, unit: "cm", kind: "garment", missing: measures.filter(m => !sizes.some(size => size[m] !== undefined && size[m] !== null)) }
    })
  }
}
