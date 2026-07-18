import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-edit-visual-panel.tsx", import.meta.url), "utf8")

assert.match(source, /useState<AssetVisualCandidateFrame/)
assert.match(source, /previewOverride=/)
assert.match(source, /preferredMediaId=/)
assert.match(source, /setSelectedCandidate\(frame\)/)
assert.doesNotMatch(source, /已选|>选择</)
assert.equal((source.match(/加入图片库/g) ?? []).length, 1)
assert.match(source, /aspect-\[16\/9\][^"\n]*bg-white|bg-white[^"\n]*aspect-\[16\/9\]/)
