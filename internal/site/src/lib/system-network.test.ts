import assert from "node:assert/strict"
import test from "node:test"
import { getSystemIPDisplay } from "./system-network.ts"

function display(system: Record<string, unknown>) {
	return getSystemIPDisplay(system as never)
}

test("prefers a private LAN IP over a public target address", () => {
	const result = display({
		target_ip: "203.0.113.10",
		connect_ip: "203.0.113.11",
		info: { ip: "192.168.1.10" },
	})

	assert.equal(result?.value, "192.168.1.10")
	assert.equal(result?.source, "observed")
})

test("prefers a private reported IP over loopback", () => {
	const result = display({
		info: { ip: "127.0.0.1" },
		reported_ips: ["10.0.0.5", "fe80::1"],
	})

	assert.equal(result?.value, "10.0.0.5")
	assert.equal(result?.source, "reported")
})

test("falls back to the available address when no LAN IP exists", () => {
	const result = display({ target_ip: "203.0.113.10", info: { ip: "127.0.0.1" } })

	assert.equal(result?.value, "203.0.113.10")
	assert.equal(result?.source, "target")
})

test("keeps loopback when it is the only address", () => {
	const result = display({ info: { ip: "127.0.0.1" } })

	assert.equal(result?.value, "127.0.0.1")
	assert.equal(result?.source, "observed")
})
