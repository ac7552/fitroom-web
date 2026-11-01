// Run with: npm test -w @fitroom/api
// The Rails app's test/controllers/api/fits_controller_test.rb (and its size chart and setup tests), against the
// small API on a real HTTP server.
import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { createApi } from "../src/api.js"

let server, base
before(async () => {
  const api = createApi()
  server = createServer(async (req, res) => { if (!(await api(req, res))) { res.writeHead(404); res.end() } })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

const MEASUREMENTS = { chest: 40, waist: 34, shoulders: 18, arm: 25.75, height: 70 }
const call = async (method, path, body) => {
  const response = await fetch(base + path, { method, headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, headers: response.headers, json: await response.json().catch(() => null) }
}
const postFit = (params, chart = "sample_suit_jacket") => call("POST", `/api/v1/size_charts/${chart}/fits`, params)

test("ranks sizes for a body in inches", async () => {
  const { status, headers, json } = await postFit({ unit: "in", cut: "regular", measurements: MEASUREMENTS })
  assert.equal(status, 200)
  assert.equal(headers.get("cache-control"), "no-store")
  assert.equal(json.best, "40R")
  assert.equal(json.units, "cm")
  assert.equal(json.sizes.length, 18)
  assert.deepEqual(json.sizes[0].checks.map(c => c.part), ["shoulders", "chest", "waist", "sleeve", "length"])
  const best = Object.fromEntries(json.sizes.find(s => s.size === "40R").checks.map(c => [c.part, c]))
  assert.equal(best.chest.good_cm.length, 2)
  assert.ok(best.chest.good_cm[0] < best.chest.good_cm[1])
  assert.deepEqual(best.sleeve.good_cm, [-1, 1])
})

test("explains what's missing or out of range", async () => {
  const { status, json } = await postFit({ unit: "cm", measurements: { chest: 101, waist: 86, shoulders: 3, arm: 65 } })
  assert.equal(status, 422)
  assert.equal(json.errors.height, "is required")
  assert.match(json.errors.shoulders, /between/)
})

test("rejects unknown cuts and units", async () => {
  const { status, json } = await postFit({ unit: "ft", cut: "baggy", measurements: MEASUREMENTS })
  assert.equal(status, 422)
  assert.ok("cut" in json.errors)
  assert.ok("unit" in json.errors)
})

test("an unknown chart is a 404", async () => {
  assert.equal((await postFit({ measurements: MEASUREMENTS }, "nope")).status, 404)
  assert.equal((await postFit({ measurements: MEASUREMENTS }, "..%2Fpackage")).status, 404)
})

test("the API sets no cookies", async () => {
  const { headers } = await postFit({ unit: "in", measurements: MEASUREMENTS })
  assert.equal(headers.get("set-cookie"), null)
})

test("fits sizes sent in the request, such as an imported garment's", async () => {
  const sizes = [
    { name: "40R", chest: 113, waist: 100.3, shoulders: 45.7, sleeve: 63.5, length: null },
    { name: "42R", chest: 118.1, waist: 105.4, shoulders: 47, sleeve: 64.1, length: null }
  ]
  const { status, json } = await call("POST", "/api/v1/fits", { unit: "in", measurements: MEASUREMENTS, sizes })
  assert.equal(status, 200)
  assert.equal(json.best, "40R")
  assert.equal(json.size_chart, null)
  assert.equal(json.sizes[0].checks.find(c => c.part === "length").status, "unknown")
})

test("checks the sizes sent in the request", async () => {
  const { status, json } = await call("POST", "/api/v1/fits", { measurements: MEASUREMENTS, sizes: [{ name: "", chest: "big" }] })
  assert.equal(status, 422)
  assert.equal(json.errors["sizes.0.name"], "is required")
  assert.equal(json.errors["sizes.0.chest"], "must be a number")
})

test("fits trousers, using hips and inseam when given", async () => {
  const sizes = [{ name: "34", waist: 88.9, seat: 107, thigh: 62, inseam: 81.3, leg_opening: 40 }]
  const { status, json } = await call("POST", "/api/v1/fits", { unit: "in", garment: "trousers", measurements: { ...MEASUREMENTS, hips: 39.5, inseam: 32.25 }, sizes })
  assert.equal(status, 200)
  const checks = json.sizes[0].checks
  assert.deepEqual(checks.map(c => c.part), ["waist", "seat", "inseam", "leg_opening"])
  assert.equal(checks.at(-1).note, "Cut with a straight leg")
})

test("micro shorts with an inch-long inseam are fitted; other measurements still need 5 cm", async () => {
  const sizes = [{ name: "S", waist: 81.3, seat: 90.2, inseam: 2.54, leg_opening: 63.5 }]
  const shorts = await call("POST", "/api/v1/fits", { unit: "in", garment: "trousers", style: "shorts", measurements: { ...MEASUREMENTS, hips: 39.5, inseam: 32.25 }, sizes })
  assert.equal(shorts.status, 200)
  assert.equal(shorts.json.best, "S")
  const tiny = await call("POST", "/api/v1/fits", { unit: "in", garment: "trousers", measurements: MEASUREMENTS, sizes: [{ name: "S", waist: 3, seat: 90 }] })
  assert.equal(tiny.status, 422)
})

test("trousers without hips or inseam say what's missing", async () => {
  const { json } = await call("POST", "/api/v1/fits", { garment: "trousers", unit: "in", measurements: MEASUREMENTS, sizes: [{ name: "34", waist: 88.9, seat: 107 }] })
  const seat = json.sizes[0].checks.find(c => c.part === "seat")
  assert.deepEqual([seat.status, seat.note], ["unknown", "Add your hips to check this"])
})

test("warns about measurements most people don't have", async () => {
  const { json } = await postFit({ unit: "in", measurements: { ...MEASUREMENTS, shoulders: 25 } })
  assert.equal(json.warnings.length, 1)
  assert.equal(json.warnings[0].part, "shoulders")
  assert.match(json.warnings[0].message, /not around the arms/)
})

test("lists charts without their sizes, and shows one with them", async () => {
  const list = await call("GET", "/api/v1/size_charts")
  const chart = list.json.size_charts.find(c => c.key === "sample_suit_jacket")
  assert.equal(chart.garment, "jacket")
  assert.equal(chart.sizes, undefined)
  assert.equal((await call("GET", "/api/v1/size_charts/sample_suit_jacket")).json.sizes.length, 18)
})

test("the fit guide lists measurements and cuts", async () => {
  const { json } = await call("GET", "/api/v1/fit_guide")
  assert.deepEqual(json.measurements.map(m => m.key), ["chest", "waist", "shoulders", "arm", "height", "hips", "inseam"])
  assert.deepEqual([json.measurements[0].optional, json.measurements[5].optional], [false, true])
  assert.deepEqual(json.cuts.map(c => c.key), ["slim", "regular", "classic"])
})

test("the setup gives the page its four samples, and says there's no try-on or store import here", async () => {
  const { json } = await call("GET", "/api/v1/setup")
  assert.equal(json.try_on, false)
  assert.equal(json.imports, false)
  assert.deepEqual(Object.keys(json.samples), ["garment", "dress", "jacket", "trousers"])
  for (const garment of Object.values(json.samples)) assert.ok(garment.chart.sizes.length > 0)
  assert.equal(json.samples.trousers.garment, "trousers")
  assert.deepEqual(json.samples.trousers.cut, { hem: "unfinished" })
  // The sample trousers fit, their unfinished hem said as a note.
  const fit = await call("POST", "/api/v1/fits", { unit: "in", garment: "trousers", style: "trousers", details: json.samples.trousers.cut,
    measurements: { ...MEASUREMENTS, hips: 39.5, inseam: 32 }, sizes: json.samples.trousers.chart.sizes })
  assert.equal(fit.status, 200)
  assert.match(fit.json.sizes[0].checks.find(c => c.part === "inseam").note, /unhemmed/)
})

test("store links and the photo pass-through answer that they need the full server", async () => {
  const imported = await call("POST", "/api/v1/garment_imports", { url: "https://example.com/products/tee" })
  assert.equal(imported.status, 501)
  assert.match(imported.json.message, /full Fitroom server/)
  assert.equal((await call("GET", "/api/v1/garment_imports/image?url=https://example.com/a.jpg")).status, 501)
})

test("answers bad requests plainly", async () => {
  const bad = await fetch(`${base}/api/v1/fits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" })
  assert.equal(bad.status, 400)
  assert.equal((await call("GET", "/api/v1/fits")).status, 405)
  assert.equal((await call("GET", "/api/v1/nothing")).status, 404)
  const huge = await fetch(`${base}/api/v1/fits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pad: "x".repeat(1_100_000) }) })
  assert.equal(huge.status, 413)
})

test("saves drape bank entries in development only", async () => {
  const { mkdtempSync, readFileSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const dir = mkdtempSync(join(tmpdir(), "drapes-"))
  const entry = { style: "tee", bodyType: "men", panels: "back,front,sleeve", measures: { chest: 104 }, item: { name: "Tee" }, points: [1, 2, 3] }
  const serve = async api => {
    const s = createServer(async (req, res) => { if (!(await api(req, res))) { res.writeHead(404); res.end() } })
    await new Promise(resolve => s.listen(0, "127.0.0.1", resolve))
    return s
  }
  const dev = await serve(createApi({ development: true, drapes: dir }))
  const post = async (s, body) => fetch(`http://127.0.0.1:${s.address().port}/api/v1/drape_bank`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const saved = await post(dev, { entry, name: "men tee/104" })
  assert.equal(saved.status, 200)
  assert.deepEqual(await saved.json(), { file: "men-tee-104.json", entries: 1 })
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "men-tee-104.json"), "utf8")), entry)
  await post(dev, { entry: { ...entry, measures: { chest: 106 } }, name: "men tee/104" })
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"))
  assert.deepEqual(index, [{ file: "men-tee-104.json", style: "tee", bodyType: "men", panels: "back,front,sleeve", measures: { chest: 106 }, name: "Tee" }])
  dev.close()
  // Anywhere else (npm start, a preview of the build), there's nothing there.
  assert.equal((await post(server, { entry, name: "x" })).status, 404)
})
