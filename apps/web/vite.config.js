import { cpSync, createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"
import { createApi } from "@fitroom/api"

// The engine's 3D models (the mannequin, poses, studio light, textures) live in packages/engine/assets/models
// and are served at /models: from there in development, copied into the build for production.
const MODELS = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../packages/engine/assets/models")
const TYPES = { ".glb": "model/gltf-binary", ".json": "application/json", ".hdr": "application/octet-stream", ".bin": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".md": "text/markdown" }

function engineModels() {
  let outDir
  return {
    name: "fitroom-engine-models",
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    configureServer(server) {
      server.middlewares.use("/models", (req, res, next) => {
        let file
        try { file = normalize(join(MODELS, decodeURIComponent(req.url.split("?")[0]))) } catch { return next() }
        if (!file.startsWith(MODELS + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream")
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() { cpSync(MODELS, join(outDir, "models"), { recursive: true }) }
  }
}

// The small Node API (apps/api) inside Vite's own server, so `npm run dev` is the whole app with no Rails.
function smallApi() {
  const mount = server => {
    const api = createApi()
    server.middlewares.use((req, res, next) => { api(req, res).then(handled => handled || next(), next) })
  }
  return { name: "fitroom-small-api", configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  // With FITROOM_API_PROXY set, /api goes to that server instead (the Rails app's bin/dev, on :3000), which
  // also reads store links and runs the AI try-on.
  const rails = env.FITROOM_API_PROXY
  const proxy = rails ? { "/api": { target: rails, changeOrigin: true } } : undefined
  return {
    plugins: [engineModels(), ...(rails ? [] : [smallApi()])],
    server: { port: 5173, proxy },
    preview: { proxy },
    build: { target: "es2022", chunkSizeWarningLimit: 1500 },
    worker: { format: "es" }
  }
})
