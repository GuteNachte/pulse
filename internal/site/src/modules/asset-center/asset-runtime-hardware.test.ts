import {
	formatCollectedNicSummary,
	formatMemoryModuleSummary,
	formatSpeed,
	getSystemDisplayName,
} from "./asset-runtime-hardware.ts"
import type { SystemDetailsRecord, SystemRecord } from "../../types"

function assertEqual(actual: unknown, expected: unknown) {
	if (actual !== expected) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const system = {
	id: "system-um690",
	name: "UM690",
	display_name: "书房主机",
} as SystemRecord

assertEqual(getSystemDisplayName(system), "书房主机")
assertEqual(getSystemDisplayName({ ...system, display_name: "" }), "UM690")
assertEqual(formatSpeed(100), "100M")
assertEqual(formatSpeed(1000), "1G")
assertEqual(formatSpeed(2500), "2.5G")

const hardware = {
	memory_modules: [
		{ memory_type: "LPDDR5", configured_mhz: 6400 },
		{ memory_type: "LPDDR5", speed_mhz: 6400 },
	],
	network_interfaces: [
		{ name: "Ethernet", link_speed: 2500 },
		{ name: "Wi-Fi", link_speed: 866 },
		{ name: "USB LAN", link_speed: 1000 },
		{ name: "Dock", link_speed: 100 },
		{ name: "Ignored", link_speed: 10 },
	],
} as SystemDetailsRecord

assertEqual(formatMemoryModuleSummary(hardware), "2 条 · LPDDR5 · 6400 MHz")
assertEqual(formatMemoryModuleSummary({ ...hardware, memory_modules: [] }), "")
assertEqual(formatCollectedNicSummary(hardware), "Ethernet 2.5G / Wi-Fi 866M / USB LAN 1G / Dock 100M")
