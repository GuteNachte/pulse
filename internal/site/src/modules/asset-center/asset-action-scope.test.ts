import assert from "node:assert/strict"
import { assetActionScope } from "./asset-action-scope.ts"

assert.deepEqual(assetActionScope.edit, ["save", "recognition", "visual"])
assert.deepEqual(assetActionScope.detail, ["interface", "relation", "maintenance", "attachment", "delete"])
