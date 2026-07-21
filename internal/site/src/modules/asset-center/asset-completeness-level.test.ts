import assert from "node:assert/strict"
import { getAssetCompletenessLevel } from "./asset-completeness-level.ts"

assert.equal(getAssetCompletenessLevel(100).key, "complete")
assert.equal(getAssetCompletenessLevel(90).key, "complete")
assert.equal(getAssetCompletenessLevel(89).key, "usable")
assert.equal(getAssetCompletenessLevel(70).key, "usable")
assert.equal(getAssetCompletenessLevel(69).key, "incomplete")
assert.equal(getAssetCompletenessLevel(45).key, "incomplete")
assert.equal(getAssetCompletenessLevel(44).key, "critical")
assert.equal(getAssetCompletenessLevel(0).key, "critical")
assert.match(getAssetCompletenessLevel(90).tagClassName, /emerald/)
assert.match(getAssetCompletenessLevel(70).tagClassName, /sky/)
assert.match(getAssetCompletenessLevel(45).tagClassName, /amber/)
assert.match(getAssetCompletenessLevel(44).tagClassName, /red/)

console.log("asset completeness level contract passed")
