import assert from "node:assert/strict"
import { demoCollections } from "../demo/fixture.ts"
import { demoModeIndicatorModel } from "../demo/mode.ts"

assert.equal(demoModeIndicatorModel.label, "公开演示")
assert.equal(demoModeIndicatorModel.repositoryUrl, "https://github.com/GuteNachte/pulse")
assert.equal(demoModeIndicatorModel.releaseUrl, "https://github.com/GuteNachte/pulse/releases/latest")

const requiredCollections = [
	"assets",
	"asset_interfaces",
	"asset_relations",
	"asset_locations",
	"asset_maintenance",
	"asset_attachments",
	"asset_visuals",
	"asset_changes",
	"asset_enrichment_reports",
	"asset_enrichment_suggestions",
	"ai_tasks",
	"network_layouts",
	"systems",
	"system_details",
	"containers",
	"alerts",
	"website_monitors",
	"website_monitor_checks",
	"user_settings",
	"module_settings",
	"notification_failures",
] as const

for (const name of requiredCollections) {
	assert.ok(name in demoCollections, `missing demo collection: ${name}`)
}

console.log("demo mode indicator contract passed")
