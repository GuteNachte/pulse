import assert from "node:assert/strict"
import { normalizeMemorySpecification } from "./asset-memory-spec.ts"

assert.equal(
	normalizeMemorySpecification("Hynix HMCG78AGBSA095N 16GB 5600MHz / Hynix HMCG78AGBSA095N 16GB 5600MHz"),
	"16 GB x 2"
)
assert.equal(normalizeMemorySpecification("8 GB x 2"), "8 GB x 2")
assert.equal(normalizeMemorySpecification("8GB + 16GB"), "8 GB x 1 + 16 GB x 1")
assert.equal(normalizeMemorySpecification("LPDDR5"), "LPDDR5")
