import assert from "node:assert/strict"
import { isDemoWriteRequest } from "./write-guard.ts"

assert.equal(isDemoWriteRequest(true, "POST"), true)
assert.equal(isDemoWriteRequest(true, "PATCH"), true)
assert.equal(isDemoWriteRequest(true, "DELETE"), true)
assert.equal(isDemoWriteRequest(true, "GET"), false)
assert.equal(isDemoWriteRequest(false, "POST"), false)

console.log("demo write guard contract passed")
