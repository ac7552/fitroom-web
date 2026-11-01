# Fitroom Web

Fitroom's front end, apart from its Rails API ([ac7552/fitroom](https://github.com/ac7552/fitroom)): the
fitting room engine that sews and drapes clothes in the browser, and the page built on it.

Everything heavy already happens on the person's device (drafting each size's pattern, the cloth
simulation, reading store photos, the 3D view), so the page builds to plain static files. A small Node API
here fits sizes to a body and serves the sample garments, so the whole thing runs without Rails. The Rails
app is still the full API: it also reads store links, passes store photos through and runs the AI try-on.

## What's here

```
packages/engine   @fitroom/engine: pattern drafting, cloth simulation, photo reading, the 3D stage,
                  the fit maths (fit.js), the fit bars and size editor, the 3D models (assets/models)
                  and the sample size charts (assets/size_charts). No framework.
apps/api          @fitroom/api: the small Node API (no framework, no dependencies but the engine).
apps/web          The Fitroom page: index.html, its Stimulus controllers and styles, built with Vite.
```

The engine is the part to reuse: a browser extension or a widget on a shop's own product page would sit
on it the same way `apps/web` does.

## Quick start

You need Node 22. Nothing else: no Rails, Ruby or database.

```bash
npm install
npm run dev        # http://localhost:5173: the page, with the small Node API inside Vite's server
npm test           # the engine's tests (fit maths, pattern drafting, cloth, photo reading) and the API's
npm run build      # apps/web/dist: static files, models included
npm start          # http://localhost:3000: the API and the built page from one Node process
```

To work against the Rails app instead (store links, AI try-on), run its `bin/dev` and start this with
`FITROOM_API_PROXY=http://localhost:3000 npm run dev`. Other settings are in `apps/web/.env.example`.

## The small Node API

`apps/api` answers the part of `/api/v1` the page needs to try clothes on:

| Endpoint | |
|---|---|
| `GET /api/v1/setup` | the four samples (T-shirt, dress, suit jacket, pants), `try_on: false`, `imports: false` |
| `POST /api/v1/fits` | fits sizes sent with the request to a body: the same request and answer as Rails' |
| `GET /api/v1/fit_guide`, `GET /api/v1/size_charts[/:key]`, `POST /api/v1/size_charts/:key/fits` | as Rails' |
| `POST /api/v1/garment_imports`, `GET /api/v1/garment_imports/image` | 501: store links need the Rails app |

So without Rails you can try on the four samples (the "try one of ours" buttons take them ready-made) and
anything added by its sizes under "Other ways to add clothes". Pasting a store link says it needs the full
server.

The fit maths is `packages/engine/src/fit.js`, ported from the Rails app's `app/models/fit.rb`. Its tests are
`fit_test.rb`'s, case for case, and it was checked against `fit.rb` itself on 29,000 random bodies and charts:
every size, check, rounded number and message came out the same. The page could run it in the browser
too, so measurements would never leave the device; for now it asks the API, as before.

## How the page talks to the API

At startup the page asks `GET /api/v1/setup` for what the Rails app's own page has written into it: the
samples, whether the AI try-on is set up (its button is taken out when it isn't), and whether store links can
be read. If the API can't be reached the page still loads, without those. Everything else goes through the same
`/api/v1` endpoints as before; see `docs/api.md` in the fitroom repo.

The engine is pointed at the API and its models once, in `apps/web/src/main.js`:

```js
import { configure } from "@fitroom/engine/config"
configure({ apiBase: "https://api.fitroom.example", modelsBase: "/models" })
```

## Deploying on a droplet

Without Rails, it's one process: `npm ci && npm run build && npm start` (set `PORT`), behind Caddy or
Cloudflare. With Rails for the full API, the simplest setup is one address for both: the built page as static
files, and `/api` passed to Rails. No CORS is needed. With Caddy (see `deploy/Caddyfile`):

```
fitroom.example {
  handle /api/* {
    reverse_proxy localhost:3000
  }
  handle {
    root * /srv/fitroom-web/dist
    file_server
  }
  encode zstd gzip
}
```

To serve the page from a CDN (DigitalOcean Spaces, say) and the API from the droplet instead, build with
`VITE_API_URL=https://api.fitroom.example` and set `FITROOM_WEB_ORIGINS=https://fitroom.example` on the
Rails app, which then lets the page's address use the API. `VITE_MODELS_URL` moves the 3D models
(about 14 MB) to a CDN too.

The Rails app can keep serving its own page meanwhile; nothing there depends on this repo.

## Notes

- The drape runs on the page's main thread unless the address has `?drape=worker`, as before; the worker
  is now a module worker that Vite builds, not one loaded through the import map.
- The 3D view pauses while it's scrolled off screen (to save the battery), so it only drapes while you can
  see it.
- The tests for the Rails repo's own scripts (`script/spike`) stayed there.
- License: MIT, see [LICENSE](LICENSE). The 3D model's assets are CC0, see
  [packages/engine/assets/models/CREDITS.md](packages/engine/assets/models/CREDITS.md). N8AO is in
  `packages/engine/vendor` with its license.
