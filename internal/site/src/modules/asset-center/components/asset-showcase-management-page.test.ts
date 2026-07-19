import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-showcase-workspace.tsx", import.meta.url), "utf8")

assert.equal(
	source.includes('linkRow("管理页面", getMetadataString(metadata, "management_url"))'),
	true,
	"device archives with an explicit management URL must show a clickable management page row"
)
assert.equal(source.includes('linkRow("管理 URL"'), false, "the device archive should use the user-facing label 管理页面")

console.log("asset showcase management page contract passed")
