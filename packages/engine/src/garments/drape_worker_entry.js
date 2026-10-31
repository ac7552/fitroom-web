// The drape worker's own script (remote_drape.js starts it as a module worker): it hands each message from
// the page to drape_worker.js, and says it's ready once that has loaded.
import { handle } from "./drape_worker.js"

const post = (message, transfer = []) => self.postMessage(message, transfer)
self.onmessage = event => handle(event.data, post)
post({ type: "ready" })
