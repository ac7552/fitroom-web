# Fitroom Web

Fitroom's front end, apart from its Rails API ([ac7552/fitroom](https://github.com/ac7552/fitroom)): the
fitting room engine that sews and drapes clothes in the browser, and the page built on it.

Everything heavy already happens on the person's device (drafting each size's pattern, the cloth
simulation, reading store photos, the 3D view), so this repo builds to plain static files. The Rails app
stays as the API: it reads product links, passes store photos through, and does the fit math.

## What's here

```
packages/engine   @fitroom/engine: pattern drafting, cloth simulation, photo reading, the 3D stage,
                  the fit bars and size editor, and the 3D models (assets/models). No framework.
apps/web          The Fitroom page: index.html, its Stimulus controllers and styles, built with Vite.
```

The engine is the part to reuse: a browser extension or a widget on a shop's own product page would sit
on it the same way `apps/web` does.

## Quick start

You need Node 22, and the Rails app running for the API (`bin/dev` in the fitroom repo, on port 3000).

```bash
npm install
npm run dev        # http://localhost:5173, with /api passed to the Rails app on :3000
npm test           # the engine's tests (pattern drafting, cloth, photo reading, body solver)
npm run build      # apps/web/dist: static files, models included
```

Settings are in `apps/web/.env.example`. Without any, the page uses the API on its own address under
`/api`, which is how development works.

## How the page talks to the API

At startup the page asks `GET /api/v1/setup` for what the Rails app's own page has written into it: the
sample T-shirt and dress, and whether the AI try-on is set up (its button is taken out when it isn't). If
the API can't be reached the page still loads, without those. Everything else goes through the same
`/api/v1` endpoints as before; see `docs/api.md` in the fitroom repo.

The engine is pointed at the API and its models once, in `apps/web/src/main.js`:

```js
import { configure } from "@fitroom/engine/config"
configure({ apiBase: "https://api.fitroom.example", modelsBase: "/models" })
```

## Deploying on a droplet

The simplest setup is one address for both: the built page as static files, and `/api` passed to Rails.
No CORS is needed. With Caddy (see `deploy/Caddyfile`):

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
- The tests for the Rails repo's own scripts (`script/spike`) stayed there.
- License: MIT, see [LICENSE](LICENSE). The 3D model's assets are CC0, see
  [packages/engine/assets/models/CREDITS.md](packages/engine/assets/models/CREDITS.md). N8AO is in
  `packages/engine/vendor` with its license.
