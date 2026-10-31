// The drape in a Web Worker, from the page's side (the worker's side is drape_worker.js, started by
// drape_worker_entry.js as a module worker, which a bundler such as Vite builds from the `new URL(...,
// import.meta.url)` below). Nothing leaves the device: the cloth and the body stay in the browser.
//
//   const remote = RemoteDrape.start()       // null where workers aren't there (remote.ready once they've loaded)
//   const job = remote.sew(id, { item, body, over, egg, measures, arms })
//   job.x (the newest points, or null once taken), job.sewn, job.frames, job.phase
//   const step = remote.pose(id, { posed, before, now, bottom, last, long })   // step.done, step.x, step.field
//   remote.drop(id)
import { SkinField } from "./body.js"

// How many workers: one for each garment draped at once (pants and a top; a jacket waits for both).
const WORKERS = 2

export class RemoteDrape {
  // Workers running the drape (one a garment at a time: pants being posed and the top over them being sewn
  // go on side by side), or null where there's no Worker to start them in.
  static start(count = WORKERS) {
    if (typeof Worker === "undefined") return null
    try {
      // Written out in full each time: that's the form a bundler recognises and builds the worker from.
      return new RemoteDrape(Array.from({ length: count }, () => new Worker(new URL("./drape_worker_entry.js", import.meta.url), { type: "module" })))
    } catch {
      return null
    }
  }

  constructor(workers) {
    this.workers = workers
    this.jobs = new Map()
    this.steps = new Map()
    this.failed = null
    this.started = 0
    for (const worker of workers) {
      worker.onmessage = event => this.receive(event.data)
      worker.onerror = event => this.fail(event.message || "the drape worker stopped")
    }
  }

  get ready() {
    return this.started === this.workers.length
  }

  receive(message) {
    if (message.type === "ready") { this.started++; return }
    if (message.type === "failed") { this.fail(message.error); return }
    const step = this.steps.get(message.id)
    const job = this.jobs.get(message.id)
    if (message.type === "error") {
      console.warn("[drape] worker:", message.error)
      if (job) job.failed = true
      if (step) step.failed = true
      return
    }
    if (message.type === "progress") {
      if (step) { step.x = message.x; step.frame = message.frame }
      else if (job) Object.assign(job, { x: message.x, frames: message.frames, phase: message.phase, frame: message.frame })
    } else if (message.type === "sewn" && job) {
      Object.assign(job, { x: message.x, frames: message.frames, frame: message.frame, sewn: true })
    } else if (message.type === "posed" && step) {
      Object.assign(step, { x: message.x, frame: message.frame, field: fieldFrom(message.field), done: true })
      this.steps.delete(message.id)
    }
  }

  // The worker couldn't start or stopped: what's being sewn there is sewn on the page instead.
  fail(error) {
    this.failed = error
    console.warn("[drape] worker:", error)
    for (const job of this.jobs.values()) job.failed = true
  }

  // A garment to sew, on the worker with the fewest garments; it's posed there later too.
  sew(id, spec) {
    const load = this.workers.map(() => 0)
    for (const job of this.jobs.values()) load[job.worker]++
    const worker = load.indexOf(Math.min(...load))
    const job = { id, worker, x: null, frames: 0, phase: "sewing", frame: 0, sewn: false, started: performance.now() }
    this.jobs.set(id, job)
    this.workers[worker].postMessage({ type: "sew", id, ...spec })
    return job
  }

  pose(id, spec) {
    const step = { id, x: null, frame: 0, field: null, done: false }
    this.steps.set(id, step)
    this.workers[this.jobs.get(id)?.worker ?? 0].postMessage({ type: "pose", id, ...spec })
    return step
  }

  drop(id) {
    const worker = this.jobs.get(id)?.worker ?? 0
    this.jobs.delete(id)
    this.steps.delete(id)
    this.workers[worker].postMessage({ type: "drop", id })
  }

  stop() {
    for (const worker of this.workers) worker.terminate()
  }
}

// A collision field sent from the worker (drape_worker.js's fieldData), as a SkinField again.
export function fieldFrom(data) {
  if (!data) return null
  const field = Object.assign(Object.create(SkinField.prototype), {
    cell: data.cell, band: data.band, min: data.min, dims: data.dims, distance: data.distance, normal: data.normal,
    ellipsoids: data.ellipsoids ?? [], hit: new Float32Array(3)
  })
  const layers = fieldFrom(data.layers)
  if (layers) field.layers = layers
  return field
}

// A collision field (body.js's SkinField) as plain data, to send to the page, which rebuilds it with
// fieldFrom (the field's own layers too).
export function fieldData(field) {
  if (!field) return null
  const { cell, band, min, dims, distance, normal, ellipsoids } = field
  return { cell, band, min, dims, distance, normal, ellipsoids, layers: fieldData(field.layers) }
}
