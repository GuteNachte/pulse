import assert from "node:assert/strict"
import { demoAuthRecord, demoAuthToken, disableDemoRealtime, shouldUseRealtime } from "./auth.ts"

assert.equal(demoAuthRecord.role, "readonly")
assert.equal(demoAuthRecord.email, "visitor@demo.example.com")
assert.equal(demoAuthRecord.id, "demo_user_00001")
assert.equal(demoAuthToken.split(".").length, 3)
assert.equal(shouldUseRealtime(true), false)
assert.equal(shouldUseRealtime(false), true)

let realtimeConnects = 0
const realtimeClient = {
	realtime: {
		subscribe: async () => {
			realtimeConnects += 1
			return async () => undefined
		},
		unsubscribe: async () => undefined,
	},
}
disableDemoRealtime(realtimeClient as never)
const unsubscribe = await realtimeClient.realtime.subscribe()
await realtimeClient.realtime.unsubscribe()
await unsubscribe()
assert.equal(realtimeConnects, 0)

const payload = JSON.parse(Buffer.from(demoAuthToken.split(".")[1], "base64url").toString("utf8")) as {
	exp: number
}
assert.ok(payload.exp > Date.now() / 1000)

console.log("demo auth contract passed")
