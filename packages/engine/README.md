# @fitroom/engine

Fitroom's fitting room, in the browser: sewing patterns drafted from a size chart, cloth draped on a body
shaped from a person's measurements, store photos read for the cloth's colour and print, and the fit
judged part by part. Plain ES modules on three.js r170, with no framework, so a page, an extension or a
shop's widget can use it the same way.

Each file is its own entry point: `@fitroom/engine/stage` (the 3D view), `@fitroom/engine/garments/print`
(reading a store photo), `@fitroom/engine/size_editor`, and so on. Before anything loads, tell it where the
API and the 3D models are:

```js
import { configure } from "@fitroom/engine/config"
import { FittingStage } from "@fitroom/engine/stage"

configure({ apiBase: "", modelsBase: "/models" })   // the defaults: the page's own address
const stage = new FittingStage(canvas)
```

The models are in `assets/models`; serve them at `modelsBase`. The API is only needed for its image proxy,
which lets the page read a store photo whose server doesn't allow it.

`npm test` runs the tests in Node.
