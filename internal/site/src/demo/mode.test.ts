import assert from "node:assert/strict"
import { demoModeFromEnv } from "./mode.ts"

assert.equal(demoModeFromEnv("1"), true)
assert.equal(demoModeFromEnv("true"), true)
assert.equal(demoModeFromEnv("0"), false)
assert.equal(demoModeFromEnv("yes"), false)
assert.equal(demoModeFromEnv(undefined), false)

console.log("demo mode contract passed")
