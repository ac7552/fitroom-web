// What the API offers this page (GET /api/v1/setup, on the Rails app or the small Node API): the sample garments
// for the "try one of ours" links, whether the AI try-on service is set up, and (imports: false, the Node API)
// whether store links can be read. When the API can't be reached, the page still starts: without the samples
// and the AI button, and adding clothes says what's wrong.
const FALLBACK = { try_on: false, samples: {} }

export async function loadSetup(url, { timeout = 8000 } = {}) {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeout) })
    if (!response.ok) throw new Error(`the API answered ${response.status}`)
    const setup = await response.json()
    return { ...FALLBACK, ...setup, samples: { ...setup.samples } }
  } catch (error) {
    console.warn("[fitroom] couldn't reach the API for its setup:", error)
    return FALLBACK
  }
}
