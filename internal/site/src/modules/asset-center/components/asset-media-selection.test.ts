import { strict as assert } from "node:assert"
import { getAssetMediaInitialSelection } from "./asset-media-selection.ts"

const media = [
	{ id: "image-1", active_version: "version-1" },
	{ id: "image-2", active_version: "version-2" },
]

assert.equal(getAssetMediaInitialSelection(media, [{ role: "cover", version: "version-2", visible: true }]), "image-2")
assert.equal(getAssetMediaInitialSelection(media, [{ role: "cover", version: "version-2", visible: false }]), "image-1")
assert.equal(getAssetMediaInitialSelection([], []), null)
