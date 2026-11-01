// Runs the small API, and serves the built page beside it so one process is the whole app:
//
//   npm run build && npm start              # http://localhost:3000
//   PORT=8080 STATIC_DIR=/srv/fitroom-web/dist node apps/api/src/server.js
//
// STATIC_DIR defaults to apps/web/dist; when it isn't there, only /api is served.
import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { createApi } from "./api.js"

const PORT = Number(process.env.PORT ?? 3000)
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url)))
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".glb": "model/gltf-binary", ".hdr": "application/octet-stream",
  ".bin": "application/octet-stream", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".ico": "image/x-icon"
}

const api = createApi()
const serveFiles = existsSync(STATIC_DIR)

const server = createServer(async (req, res) => {
  if (await api(req, res)) return
  if (!serveFiles || !["GET", "HEAD"].includes(req.method)) return notFound(res)
  let path
  try { path = decodeURIComponent(new URL(req.url, "http://fitroom.local").pathname) } catch { return notFound(res) }
  let file = normalize(join(STATIC_DIR, path))
  // Only files inside the page's folder (a "/../" can't climb out, nor into a folder named like it).
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) return notFound(res)
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html")
  if (!existsSync(file)) return notFound(res)
  // Built scripts carry a hash in their name, so they keep; everything else is checked again each day.
  const lasting = path.startsWith("/assets/")
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Content-Length": statSync(file).size,
    "Cache-Control": lasting ? "public, max-age=31536000, immutable" : "public, max-age=86400" })
  if (req.method === "HEAD") return res.end()
  createReadStream(file).pipe(res)
})

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
  res.end("Not found")
}

server.listen(PORT, () => {
  console.log(`Fitroom API on http://localhost:${PORT}/api/v1${serveFiles ? `, the page from ${STATIC_DIR}` : " (no built page: run npm run build to serve it too)"}`)
})
