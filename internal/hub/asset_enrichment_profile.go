package hub

import (
	"sort"
	"strings"
)

// This server-side catalog is the write boundary for Agent suggestions. It mirrors
// the persisted asset profiles without exposing UI-only form concerns to the Hub.
var assetEnrichmentCommonMetadataFields = []string{
	"official_url",
	"official_image_url",
}

var assetEnrichmentAddressMetadataFields = []string{
	"fixed_ipv4",
	"fixed_ipv6",
	"mac",
	"management_url",
}

var assetEnrichmentMetadataFieldsByType = map[string][]string{
	"physical_host":     hostEnrichmentMetadataFields,
	"nas":               hostEnrichmentMetadataFields,
	"server":            hostEnrichmentMetadataFields,
	"mini_pc":           hostEnrichmentMetadataFields,
	"vm":                hostEnrichmentMetadataFields,
	"router":            routerEnrichmentMetadataFields,
	"gateway":           gatewayEnrichmentMetadataFields,
	"ont":               ontEnrichmentMetadataFields,
	"switch":            switchEnrichmentMetadataFields,
	"ap":                accessPointEnrichmentMetadataFields,
	"firewall":          gatewayEnrichmentMetadataFields,
	"phone":             phoneEnrichmentMetadataFields,
	"tablet":            tabletEnrichmentMetadataFields,
	"wearable":          wearableEnrichmentMetadataFields,
	"ebook":             ebookEnrichmentMetadataFields,
	"game_console":      gameConsoleEnrichmentMetadataFields,
	"handheld":          handheldEnrichmentMetadataFields,
	"tv":                televisionEnrichmentMetadataFields,
	"speaker":           speakerEnrichmentMetadataFields,
	"camera":            cameraEnrichmentMetadataFields,
	"printer":           printerEnrichmentMetadataFields,
	"ups":               upsEnrichmentMetadataFields,
	"smarthome_gateway": smartHomeGatewayEnrichmentMetadataFields,
	"sensor":            sensorEnrichmentMetadataFields,
	"light":             lightEnrichmentMetadataFields,
	"plug":              plugEnrichmentMetadataFields,
	"lock":              lockEnrichmentMetadataFields,
	"vacuum":            vacuumEnrichmentMetadataFields,
	"iot":               iotEnrichmentMetadataFields,
	"internet":          internetEnrichmentMetadataFields,
	"web_endpoint":      webEndpointEnrichmentMetadataFields,
	"custom":            customEnrichmentMetadataFields,
}

var hostEnrichmentMetadataFields = mergeAssetEnrichmentFields(
	assetEnrichmentAddressMetadataFields,
	[]string{
		"online_specs_summary", "cpu_vendor", "cpu_model", "motherboard_vendor", "motherboard_model", "bios_vendor", "gpu_detail",
		"gpu_vendor", "gpu_model", "gpu_board_vendor", "gpu_vram_gb", "memory_gb", "memory_detail", "memory_vendor",
		"memory_type", "memory_speed_mhz", "storage_summary", "storage_detail",
		"storage_vendor", "storage_model", "storage_media", "storage_serial_note", "primary_nic_speed_mbps", "nic_detail",
		"nic_vendor", "nic_model", "wifi_vendor", "wifi_model", "chassis_power_detail", "chassis_vendor", "chassis_model",
		"psu_vendor", "psu_model",
	},
)

var routerEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{"port_count", "default_port_speed_mbps", "power_mode", "wifi_standard", "ssid_note", "vlan_note"})
var gatewayEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{"port_count", "default_port_speed_mbps", "power_mode", "vlan_note"})
var ontEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{"port_count", "default_port_speed_mbps", "power_mode"})
var switchEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{"port_count", "default_port_speed_mbps", "power_mode", "vlan_note"})
var accessPointEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{"port_count", "default_port_speed_mbps", "power_mode", "wifi_standard", "ssid_note", "vlan_note"})

var phoneEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{
	"internal_model",
	"cpu_model", "cpu_vendor", "cpu_process", "cpu_architecture", "cpu_cores", "cpu_frequency", "gpu_model", "gpu_detail",
	"memory_gb", "memory_detail", "memory_type", "storage_gb", "storage_detail", "storage_options", "screen_size", "display_type",
	"display_resolution", "screen_refresh_rate", "touch_sampling_rate", "display_brightness", "display_color_depth", "hdr_support",
	"display_protection", "battery_capacity_mah", "battery_type", "charging_power_w", "wireless_charging", "battery_life_note",
	"camera_summary", "rear_camera_detail", "rear_main_camera", "rear_ultrawide_camera", "rear_macro_camera", "rear_telephoto_camera",
	"front_camera_detail", "video_recording", "image_stabilization", "mobile_network", "sim_detail", "wifi_standard", "bluetooth_version",
	"positioning", "usb_detail", "nfc", "infrared", "dimensions", "weight", "body_material", "colors_available", "water_resistance",
	"speaker_detail", "audio_detail", "biometrics", "sensor_detail", "cooling_system", "power_mode",
})

var tabletEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{
	"cpu_model", "cpu_vendor", "cpu_process", "cpu_architecture", "cpu_cores", "cpu_frequency", "gpu_model", "gpu_detail",
	"memory_gb", "memory_detail", "memory_type", "storage_gb", "storage_detail", "storage_options", "screen_size", "display_type",
	"display_resolution", "screen_refresh_rate", "touch_sampling_rate", "display_brightness", "display_color_depth", "hdr_support",
	"display_protection", "battery_capacity_mah", "battery_type", "charging_power_w", "wireless_charging", "battery_life_note",
	"camera_summary", "rear_camera_detail", "front_camera_detail", "video_recording", "image_stabilization", "mobile_network", "sim_detail",
	"wifi_standard", "bluetooth_version", "positioning", "usb_detail", "nfc", "dimensions", "weight", "body_material", "colors_available",
	"water_resistance", "speaker_detail", "audio_detail", "biometrics", "sensor_detail", "power_mode",
})

var wearableEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{
	"cpu_model", "cpu_vendor", "memory_gb", "memory_detail", "storage_gb", "storage_detail", "screen_size", "display_type",
	"display_resolution", "display_brightness", "battery_capacity_mah", "battery_type", "battery_life_note", "wifi_standard",
	"bluetooth_version", "positioning", "dimensions", "weight", "body_material", "colors_available", "water_resistance",
	"speaker_detail", "audio_detail", "biometrics", "sensor_detail", "power_mode",
})

var ebookEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{
	"cpu_model", "memory_gb", "storage_gb", "storage_detail", "storage_options", "screen_size", "display_type", "display_resolution",
	"display_brightness", "display_color_depth", "display_protection", "battery_capacity_mah", "battery_life_note", "wifi_standard",
	"bluetooth_version", "usb_detail", "dimensions", "weight", "body_material", "colors_available", "water_resistance", "power_mode",
})

var gameConsoleEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{
	"cpu_model", "cpu_vendor", "cpu_architecture", "gpu_model", "gpu_detail", "memory_gb", "memory_detail", "storage_gb",
	"storage_detail", "storage_options", "display_resolution", "screen_refresh_rate", "hdr_support", "wifi_standard", "bluetooth_version",
	"usb_detail", "speaker_detail", "audio_detail", "dimensions", "weight", "colors_available", "power_mode",
})

var handheldEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{
	"cpu_model", "cpu_vendor", "cpu_architecture", "gpu_model", "gpu_detail", "memory_gb", "memory_detail", "storage_gb",
	"storage_detail", "storage_options", "screen_size", "display_type", "display_resolution", "screen_refresh_rate", "touch_sampling_rate",
	"display_brightness", "hdr_support", "battery_capacity_mah", "battery_life_note", "wifi_standard", "bluetooth_version", "usb_detail",
	"speaker_detail", "audio_detail", "dimensions", "weight", "colors_available", "power_mode",
})

var televisionEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{
	"screen_size", "display_type", "display_resolution", "screen_refresh_rate", "display_brightness", "display_color_depth", "hdr_support",
	"display_protection", "wifi_standard", "bluetooth_version", "usb_detail", "speaker_detail", "audio_detail", "dimensions", "weight",
	"body_material", "colors_available", "power_mode",
})

var speakerEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{
	"wifi_standard", "bluetooth_version", "usb_detail", "speaker_detail", "audio_detail", "dimensions", "weight", "body_material",
	"colors_available", "power_mode",
})

var cameraEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{"connection_type", "protocol", "resolution", "stream_url", "power_mode", "storage_target"})
var printerEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{"connection_type", "printer_type", "supplies", "paper_size", "duplex"})
var upsEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{"capacity_va", "capacity_w", "battery_model", "battery_count", "outlet_count", "protocol", "protected_assets"})

var smartHomeBaseEnrichmentMetadataFields = []string{"smart_category", "protocol", "gateway_name", "entity_id", "room", "power_mode", "battery_type", "automation_note"}
var smartHomeGatewayEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, smartHomeBaseEnrichmentMetadataFields)
var sensorEnrichmentMetadataFields = mergeAssetEnrichmentFields(smartHomeBaseEnrichmentMetadataFields, []string{"sensor_detail"})
var lightEnrichmentMetadataFields = mergeAssetEnrichmentFields(smartHomeBaseEnrichmentMetadataFields, []string{"colors_available", "display_brightness"})
var plugEnrichmentMetadataFields = mergeAssetEnrichmentFields(smartHomeBaseEnrichmentMetadataFields, []string{"outlet_count"})
var lockEnrichmentMetadataFields = mergeAssetEnrichmentFields(smartHomeBaseEnrichmentMetadataFields, []string{"biometrics"})
var vacuumEnrichmentMetadataFields = mergeAssetEnrichmentFields(smartHomeBaseEnrichmentMetadataFields, []string{"battery_capacity_mah", "storage_target", "sensor_detail"})
var iotEnrichmentMetadataFields = smartHomeBaseEnrichmentMetadataFields

var internetEnrichmentMetadataFields = []string{"down_mbps", "up_mbps", "public_ipv4", "public_ipv6"}
var webEndpointEnrichmentMetadataFields = []string{"url", "internal_url", "external_url", "endpoint_scope", "expected_owner"}
var customEnrichmentMetadataFields = assetEnrichmentAddressMetadataFields

func assetEnrichmentAllowedMetadataFieldSet(assetType string) map[string]bool {
	assetType = strings.TrimSpace(assetType)
	result := map[string]bool{}
	if assetType != "internet" {
		for _, field := range assetEnrichmentCommonMetadataFields {
			result[field] = true
		}
	}
	for _, field := range assetEnrichmentMetadataFieldsByType[assetType] {
		result[field] = true
	}
	return result
}

func assetEnrichmentAllowedMetadataFields(assetType string, focus string) []string {
	allowed := assetEnrichmentAllowedMetadataFieldSet(assetType)
	if normalizeAssetEnrichmentReportFocus(focus) == "official_colors" {
		filtered := map[string]bool{}
		for _, field := range []string{"colors_available", "official_image_url"} {
			if allowed[field] {
				filtered[field] = true
			}
		}
		allowed = filtered
	}
	fields := make([]string, 0, len(allowed))
	for field := range allowed {
		fields = append(fields, field)
	}
	sort.Strings(fields)
	return fields
}

func mergeAssetEnrichmentFields(groups ...[]string) []string {
	seen := map[string]bool{}
	result := make([]string, 0)
	for _, group := range groups {
		for _, field := range group {
			field = strings.TrimSpace(field)
			if field == "" || seen[field] {
				continue
			}
			seen[field] = true
			result = append(result, field)
		}
	}
	return result
}
