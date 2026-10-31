import { cpSync, createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"

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
        const file = normalize(join(MODELS, decodeURIComponent(req.url.split("?")[0])))
        if (!file.startsWith(MODELS) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream")
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() { cpSync(MODELS, join(outDir, "models"), { recursive: true }) }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  return {
    plugins: [engineModels()],
    // In development the page and the API share an address: /api goes to the Rails app (bin/dev on :3000).
    server: {
      port: 5173,
      proxy: { "/api": { target: env.FITROOM_API_PROXY || "http://localhost:3000", changeOrigin: true } }
    },
    preview: { proxy: { "/api": { target: env.FITROOM_API_PROXY || "http://localhost:3000", changeOrigin: true } } },
    build: { target: "es2022", chunkSizeWarningLimit: 1500 },
    worker: { format: "es" }
  }
})
