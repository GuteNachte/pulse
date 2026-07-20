import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./internet-address-auto-refresh-controls.tsx", import.meta.url), "utf8")

assert.equal(
	source.includes('<RefreshCwIcon data-icon="inline-start" className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />'),
	true,
	"the compact public-address refresh button must keep its refresh icon at 14px in both idle and loading states"
)
assert.equal(
	source.includes('className="h-8 px-2.5 text-xs"'),
	true,
	"the icon refinement must not resize the existing compact refresh button"
)

console.log("internet address refresh control contract passed")
