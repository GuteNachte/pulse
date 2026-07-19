import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-interface-sync.ts", import.meta.url), "utf8")

assert.equal(
	source.includes('if (form.type === "ont") return null'),
	true,
	"ONT must skip the synthetic primary interface and use its explicit PON, optical, LAN and Wi-Fi interfaces"
)

console.log("asset interface sync contract passed")
