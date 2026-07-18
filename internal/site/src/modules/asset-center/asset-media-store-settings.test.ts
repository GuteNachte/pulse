import { strict as assert } from "node:assert"
import { normalizeAssetMediaStoreStatus } from "./asset-media-store-settings.ts"

assert.deepEqual(normalizeAssetMediaStoreStatus({ root: "C:\\Pulse\\media", writable: true, objects: 8 }), {
	root: "C:\\Pulse\\media", writable: true, configured: false, objects: 8, bytes: 0,
})
