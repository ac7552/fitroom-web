// Fitroom's small API: the part of the Rails app's /api/v1 the page needs to try clothes on, in plain Node. It
// fits sizes to a body (POST /api/v1/fits), serves the sample garments and size charts, and says what the
// page should offer. Reading store links and the AI try-on stay with the Rails app: here they answer 501, and
// the page offers the samples and "give its sizes" instead.
//
// Stateless: no accounts, cookies or storage. Measurements are used for one answer and never logged or kept.
//
//   const handle = createApi()
//   http.createServer(async (req, res) => { if (!(await handle(req, res))) { /* not an /api request */ } })
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fitGuide, fitRequest } from "@fitroom/engine/fit"
import { NotFound, allCharts, findChart } from "./charts.js"

const MAX_BODY = 1_000_000   // bytes: a fit request is a few kilobytes
const MAX_BANK_ENTRY = 20_000_000   // a drape bank entry: a draped garment's points

// The samples the page's "try one of ours" offers, by the name its buttons use.
const SAMPLES = { garment: "sample_t_shirt", dress: "sample_dress", jacket: "sample_suit_jacket", trousers: "sample_trousers" }

// development: also save drape bank entries (POST /api/v1/drape_bank, as the Rails app's DrapeBankController
// does in development), into the folder `drapes` (the engine's assets/drapes). Never in production.
export function createApi({ development = false, drapes = null } = {}) {
  const routes = [
    ["GET", /^\/api\/v1\/setup$/, () => ok({ try_on: false, imports: false, samples: Object.fromEntries(Object.entries(SAMPLES).map(([name, key]) => [name, findChart(key).asGarment()])) })],
    ["GET", /^\/api\/v1\/fit_guide$/, () => ok(fitGuide())],
    ["GET", /^\/api\/v1\/size_charts$/, () => ok({ size_charts: allCharts().map(chart => chart.summary) })],
    ["GET", /^\/api\/v1\/size_charts\/([^/]+)$/, (_, [key]) => ok(findChart(key).json())],
    ["POST", /^\/api\/v1\/size_charts\/([^/]+)\/fits$/, async (req, [key]) => fit(await readJson(req), findChart(key))],
    ["POST", /^\/api\/v1\/fits$/, async req => fit(await readJson(req))],
    ["POST", /^\/api\/v1\/garment_imports$/, () => notHere("Adding clothes from a store link needs the full Fitroom server. Here, try one of our samples, or add the clothes by their sizes under \"Other ways to add clothes\".")],
    ["GET", /^\/api\/v1\/garment_imports\/image$/, () => notHere("The store photo pass-through needs the full Fitroom server.")],
    ["POST", /^\/api\/v1\/drape_bank$/, async req => (development && drapes ? saveBankEntry(drapes, await readJson(req, MAX_BANK_ENTRY)) : { status: 404, body: { error: "not_found" } })]
  ]

  return async function handle(req, res) {
    const path = new URL(req.url, "http://fitroom.local").pathname
    if (!path.startsWith("/api/")) return false
    let answer
    try {
      const matches = routes.map(([method, pattern, run]) => [method, path.match(pattern), run]).filter(([, match]) => match)
      const route = matches.find(([method]) => method === req.method)
      if (route) answer = await route[2](req, route[1].slice(1).map(decodeURIComponent))
      else if (matches.length) answer = { status: 405, body: { error: "method_not_allowed" }, headers: { Allow: matches.map(([method]) => method).join(", ") } }
      else answer = { status: 404, body: { error: "not_found", message: `Nothing at ${path}` } }
    } catch (error) {
      if (error instanceof NotFound || error instanceof URIError) answer = { status: 404, body: { error: "not_found", message: error instanceof NotFound ? error.message : "Nothing there" } }
      else if (error instanceof BadRequest) answer = { status: error.status, body: { error: error.code, message: error.message } }
      else {
        console.error("[api]", error)   // never the request body: it holds measurements
        answer = { status: 500, body: { error: "internal" } }
      }
    }
    send(res, answer)
    return true
  }
}

// A fit is for one person at one moment: never cached anywhere on the way.
function fit(params, chart = null) {
  const { status, body } = fitRequest(params, { chart })
  return { status, body, headers: { "Cache-Control": "no-store" } }
}

const ok = body => ({ status: 200, body })
const notHere = message => ({ status: 501, body: { error: "not_available", message } })

class BadRequest extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}

// Saves a drape bank entry (the engine's garments/drape_bank.js; apps/web/public/bank/build.js sends them) as
// <name>.json in the bank's folder, and lists it in index.json. The files are then committed and served as
// they are.
function saveBankEntry(dir, { entry, name }) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new BadRequest(422, "invalid", "Send the entry.")
  const file = `${String(name ?? "").replace(/[^a-z0-9_-]/gi, "-") || "entry"}.json`
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), JSON.stringify(entry))
  let index = []
  try { index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) } catch {}
  index = index.filter(meta => meta.file !== file)
  index.push({ file, style: entry.style, bodyType: entry.bodyType, panels: entry.panels, measures: entry.measures, name: entry.item?.name })
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 2))
  return ok({ file, entries: index.length })
}

async function readJson(req, limit = MAX_BODY) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new BadRequest(413, "too_large", "That request is too big.")
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString("utf8")
  if (!text.trim()) return {}
  try {
    const value = JSON.parse(text)
    if (value && typeof value === "object" && !Array.isArray(value)) return value
  } catch {}
  throw new BadRequest(400, "bad_json", "Send the request as a JSON object.")
}

function send(res, { status, body, headers = {} }) {
  const text = JSON.stringify(body)
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(text), "X-Content-Type-Options": "nosniff", ...headers })
  res.end(text)
}
