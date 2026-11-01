import { cpSync, createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"
import { createApi } from "@fitroom/api"

// The engine's 3D models (the mannequin, poses, studio light, textures) and its drape bank live in
// packages/engine/assets/models and assets/drapes, and are served at /models and /drapes: from there in
// development, copied into the build for production.
const ASSETS = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../packages/engine/assets")
const SERVED = ["models", "drapes"]
const TYPES = { ".glb": "model/gltf-binary", ".json": "application/json", ".hdr": "application/octet-stream", ".bin": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".md": "text/markdown" }

function engineAssets() {
  let outDir
  return {
    name: "fitroom-engine-assets",
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    configureServer(server) {
      for (const name of SERVED) {
        const dir = join(ASSETS, name)
        server.middlewares.use(`/${name}`, (req, res, next) => {
          let file
          try { file = normalize(join(dir, decodeURIComponent(req.url.split("?")[0]))) } catch { return next() }
          if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
          res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream")
          // (The bank's index changes while it's being built: never kept.)
          res.setHeader("Cache-Control", "no-cache")
          createReadStream(file).pipe(res)
        })
      }
    },
    closeBundle() { for (const name of SERVED) cpSync(join(ASSETS, name), join(outDir, name), { recursive: true }) }
  }
}

// The small Node API (apps/api) inside Vite's own server, so `npm run dev` is the whole app with no Rails.
// In development (not the preview of a build) it also saves drape bank entries (POST /api/v1/drape_bank).
function smallApi() {
  const mount = development => server => {
    const api = createApi({ development, drapes: join(ASSETS, "drapes") })
    server.middlewares.use((req, res, next) => { api(req, res).then(handled => handled || next(), next) })
  }
  return { name: "fitroom-small-api", configureServer: mount(true), configurePreviewServer: mount(false) }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  // With FITROOM_API_PROXY set, /api goes to that server instead (the Rails app's bin/dev, on :3000), which
  // also reads store links and runs the AI try-on.
  const rails = env.FITROOM_API_PROXY
  const proxy = rails ? { "/api": { target: rails, changeOrigin: true } } : undefined
  return {
    plugins: [engineAssets(), ...(rails ? [] : [smallApi()])],
    server: { port: 5173, proxy },
    preview: { proxy },
    build: { target: "es2022", chunkSizeWarningLimit: 1500 },
    worker: { format: "es" }
  }
})
