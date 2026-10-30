import assert from "node:assert/strict"
import { demoWorkerOptions } from "./browser-options.ts"

assert.equal(demoWorkerOptions.onUnhandledRequest, "error")
assert.equal(demoWorkerOptions.serviceWorker.url, "/mockServiceWorker.js")
assert.equal(demoWorkerOptions.quiet, true)

console.log("demo worker options contract passed")
