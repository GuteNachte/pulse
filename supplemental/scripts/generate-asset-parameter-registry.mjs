import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { ASSET_TYPE_OPTIONS, getAssetFormSections } from "../../internal/site/src/modules/asset-center/asset-schema.ts"

const categories = [
	["appearance", "外观与尺寸"],
	["power", "电源"],
	["platform", "主板与平台"],
	["processor", "处理器"],
	["graphics", "显卡"],
	["memory", "内存"],
	["storage", "存储"],
	["network", "网络"],
	["io", "接口与扩展"],
	["display", "显示"],
	["imaging", "影像"],
	["audio", "音频"],
	["sensors", "传感器"],
	["thermal_environment", "散热与环境"],
].map(([id, title], index) => ({ id, title, order: (index + 1) * 10 }))

const dossier = words(
	`name type parent_asset asset_tag vendor model internal_model serial_number status location role color device_color fixed_ipv4 mac management_url official_url notes`
)
const line = words(
	`access_technology auth_mode down_mbps up_mbps public_ipv4 public_ipv6 public_ip_checked_at public_ip_next_check_at public_ipv4_error public_ipv6_error public_ip_auto_refresh public_ip_refresh_interval_minutes package_name recurring_price_cny billing_cycle renewal_date auto_renew`
)
const service = words(
	`service_category url internal_url external_url endpoint_scope expected_owner renewal_date recurring_price_cny billing_cycle`
)
const operational = words(
	`account_note official_image_url purchase_date purchase_price_cny warranty_months release_date package_weight_kg preinstalled_os supported_os online_specs_summary custom_category smart_category controller_platform gateway_name entity_id room automation_note firmware_channel protected_assets installation_position iot_capability max_device_count reporting_interval neutral_wire radio_protocols`
)

const categoryFields = {
	appearance: words(
		`form_factor case_form_factor rack_form_factor mount_support length_mm width_mm height_mm dimensions dimensions_mm weight weight_kg net_weight_g body_material colors_available water_resistance installation_method weather_rating door_thickness chassis_model chassis_vendor`
	),
	power: words(
		`chassis_power_detail psu_vendor psu_model power_adapter_w redundant_psu power_mode power_input power_spec battery_capacity_mah battery_type battery_model battery_count battery_life_note charging_power_w wireless_charging capacity_va capacity_w outlet_count topology waveform transfer_time_ms emergency_power energy_monitoring rated_current_a rated_power_w`
	),
	platform: words(
		`motherboard_vendor motherboard_model bios_vendor pcie_slots bmc product_series product_number manufacture_date`
	),
	processor: words(`cpu_vendor cpu_model cpu_process cpu_architecture cpu_cores cpu_frequency cpu_socket_count`),
	graphics: words(`gpu_detail gpu_vendor gpu_model gpu_board_vendor gpu_vram_gb transcode_engine`),
	memory: words(
		`memory_gb memory_vendor memory_detail memory_type memory_speed_mhz supported_memory_type max_memory_gb memory_channel_count ecc_memory`
	),
	storage: words(
		`storage_gb storage_summary storage_detail storage_vendor storage_model storage_media storage_serial_note storage_options storage_slots bay_count storage_backplane raid_mode raid_controller filesystem hot_swap cache_slots storage_target dust_box_ml water_tank_ml`
	),
	network: words(
		`primary_nic_speed_mbps nic_detail nic_vendor nic_model wifi_vendor wifi_model wifi_support wifi_standard wifi_band wifi_streams wifi_24_supported wifi_24_enabled wifi_5_supported wifi_5_enabled bluetooth_support bluetooth_version mobile_network sim_detail positioning navigation connection_type protocol stream_url carrier operating_role radio_approval_code port_count default_port_speed_mbps wan_port_count lan_port_count lan_2500_count lan_1000_count ethernet_port_count ethernet_supported_speeds default_ethernet_speed_mbps optical_port_count optical_supported_speeds default_optical_speed_mbps other_port_count pon_standard pon_uplink_capacity pon_sn onu_type optical_connector downstream_optical_port_count downstream_optical_status router_status gateway_status dhcp_status lan_subnet ssid_note wps_supported wireless_control indicator_control reset_supported power_switch_supported vlan_note vlan_status management_level management_access port_isolation_status link_aggregation_status switching_capacity_gbps mac_table_entries security_throughput_gbps vpn_throughput_gbps session_capacity antenna_type forwarding_method poe_standard`
	),
	io: words(
		`display_outputs audio_output usb_detail usb_ports usb_port_count voice_port_count nfc infrared paper_size duplex supplies print_speed_ppm print_resolution scan_resolution printer_type color_mode unlock_methods station_features lock_body`
	),
	display: words(
		`screen_size display_type display_resolution screen_refresh_rate touch_sampling_rate display_brightness display_color_depth hdr_support display_protection luminous_flux_lm color_temperature_k color_rendering_index color_control light_kind`
	),
	imaging: words(
		`camera_summary rear_camera_detail rear_main_camera rear_ultrawide_camera rear_macro_camera rear_telephoto_camera front_camera_detail video_recording image_stabilization resolution sensor_size field_of_view night_vision video_codec lens_spec`
	),
	audio: words(`speaker_detail audio_detail`),
	sensors: words(`biometrics sensor_detail sensor_kind measurement_range measurement_accuracy measurement_precision`),
	thermal_environment: words(
		`cooling_system operating_temperature_range operating_humidity_range storage_temperature_range storage_humidity_range lightning_protection_kv suction_pa`
	),
}

const sections = {
	appearance: "外观规格",
	power: "供电与电池",
	platform: "平台规格",
	processor: "处理器规格",
	graphics: "图形能力",
	memory: "内存规格",
	storage: "存储规格",
	network: "网络能力",
	io: "接口规格",
	display: "显示规格",
	imaging: "影像规格",
	audio: "音频规格",
	sensors: "传感能力",
	thermal_environment: "环境与散热",
}
const fieldCategory = new Map()
const fieldCategoryRank = new Map()
for (const [category, keys] of Object.entries(categoryFields)) {
	let rank = 0
	for (const key of keys) {
		if (fieldCategory.has(key)) throw new Error(`字段 ${key} 重复分类`)
		fieldCategory.set(key, category)
		fieldCategoryRank.set(key, rank++)
	}
}

function words(value) {
	return new Set(value.trim().split(/\s+/).filter(Boolean))
}
function scopeFor(key, assetTypes) {
	if (dossier.has(key)) return "dossier"
	if (line.has(key) && assetTypes.includes("internet")) return "line"
	if (service.has(key) && assetTypes.includes("web_endpoint")) return "service"
	if (operational.has(key)) return "operational"
	if (fieldCategory.has(key)) return "parameter"
	throw new Error(`字段 ${key} 尚未显式归类`)
}

const collected = new Map()
for (const { value: assetType } of ASSET_TYPE_OPTIONS)
	for (const formSection of getAssetFormSections(assetType))
		for (const field of formSection.fields) {
			if (field.key === "fixed_ipv6") continue
			const current = collected.get(field.key) ?? {
				key: field.key,
				label: field.label,
				source: field.source,
				capture: field.capture ?? "manual",
				type: field.type ?? "text",
				assetTypes: [],
			}
			if (!current.assetTypes.includes(assetType)) current.assetTypes.push(assetType)
			collected.set(field.key, current)
		}

const counters = new Map()
const fields = [...collected.values()]
	.sort((a, b) => a.key.localeCompare(b.key))
	.map((field) => {
		const scope = scopeFor(field.key, field.assetTypes)
		const category = scope === "parameter" ? fieldCategory.get(field.key) : undefined
		const counterKey = category ?? scope
		const counter = category ? fieldCategoryRank.get(field.key) : (counters.get(counterKey) ?? 0)
		if (!category) counters.set(counterKey, counter + 1)
		const baseSection = category ? sections[category] : undefined
		const sectionIndex = Math.floor(counter / 8)
		return {
			...field,
			scope,
			...(category ? { category, section: `${baseSection}${sectionIndex ? ` ${sectionIndex + 1}` : ""}` } : {}),
			order: ((counter % 8) + 1) * 10,
		}
	})

const outputPath = fileURLToPath(new URL("../../internal/assetcatalog/asset-parameter-registry.json", import.meta.url))
await writeFile(outputPath, `${JSON.stringify({ version: 1, categories, fields }, null, 2)}\n`, "utf8")
console.log(`Generated ${fields.length} fields at ${outputPath}`)
