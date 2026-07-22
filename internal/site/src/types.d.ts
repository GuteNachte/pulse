import type { RecordModel } from "pocketbase"
import type { Unit, Os, BatteryState, HourFormat, ConnectionType } from "@/lib/enums"
import type { ComponentType } from "react"

// global window properties
declare global {
	var PULSE: {
		BASE_PATH: string
		HUB_VERSION: string
		HUB_URL: string
		AGENT_HUB_URL: string
		BUILD_COMMIT?: string
		BUILD_TIME?: string
		DEV_BUILD?: boolean
		OAUTH_DISABLE_POPUP: boolean
	}
}

export interface FingerprintRecord extends RecordModel {
	id: string
	system: string
	fingerprint: string
	token: string
	expand: {
		system: {
			name: string
		}
	}
}

export interface SystemRecord extends RecordModel {
	name: string
	asset?: string
	display_name?: string
	role?: string
	custom_role?: string
	primary_use?: string
	is_nas?: boolean
	description?: string
	suppress_offline_alerts?: boolean
	hide_from_home?: boolean
	is_local?: boolean
	pairing_confirmed?: boolean
	target_ip?: string
	connect_ip?: string
	reported_ips?: string[]
	fingerprint_summary?: string
	agent_profile?: string
	status: "up" | "down" | "paused" | "pending"
	info: SystemInfo
	v: string
	updated: string
}

export type AssetType =
	| "internet"
	| "physical_host"
	| "nas"
	| "server"
	| "mini_pc"
	| "router"
	| "switch"
	| "ap"
	| "gateway"
	| "ont"
	| "firewall"
	| "phone"
	| "tablet"
	| "camera"
	| "printer"
	| "ups"
	| "game_console"
	| "handheld"
	| "ebook"
	| "wearable"
	| "tv"
	| "speaker"
	| "smarthome_gateway"
	| "sensor"
	| "light"
	| "plug"
	| "lock"
	| "vacuum"
	| "iot"
	| "vm"
	| "web_endpoint"
	| "custom"

export type AssetStatus = "active" | "inactive" | "retired" | "planned"

export interface AssetRecord extends RecordModel {
	user: string
	name: string
	type: AssetType
	status?: AssetStatus
	parent_asset?: string
	vendor?: string
	model?: string
	serial_number?: string
	management_ip?: string
	location?: string
	role?: string
	notes?: string
	tags?: string[]
	metadata?: Record<string, unknown>
	created: string
	updated: string
}

export type AssetInterfaceKind =
	| "ethernet"
	| "wifi"
	| "pon"
	| "optical"
	| "wan"
	| "lan"
	| "management"
	| "virtual"
	| "custom"
export type AssetInterfaceSource = "manual" | "agent" | "snmp" | "import"

export interface AssetInterfaceRecord extends RecordModel {
	user: string
	asset: string
	name: string
	kind: AssetInterfaceKind
	mac?: string
	ipv4?: string
	ipv6?: string
	speed_mbps?: number
	connected?: boolean
	primary?: boolean
	source?: AssetInterfaceSource
	metadata?: Record<string, unknown>
	created: string
	updated: string
}

export type AssetRelationKind =
	| "hosted_on"
	| "connected_to"
	| "monitors"
	| "depends_on"
	| "owns"
	| "located_in"
	| "powered_by"
	| "custom"

export interface AssetRelationRecord extends RecordModel {
	user: string
	source_asset: string
	target_asset: string
	kind: AssetRelationKind
	label?: string
	metadata?: Record<string, unknown>
	created: string
	updated: string
}

export type AssetMaintenanceKind =
	| "purchase"
	| "online"
	| "maintenance"
	| "repair"
	| "upgrade"
	| "replacement"
	| "warranty"
	| "retire"
	| "note"

export interface AssetMaintenanceRecord extends RecordModel {
	user: string
	asset: string
	kind: AssetMaintenanceKind
	title: string
	event_date?: string
	actor?: string
	cost?: string
	notes?: string
	metadata?: Record<string, unknown>
	created: string
	updated: string
}

export type AssetAttachmentKind = "photo" | "invoice" | "warranty" | "manual" | "config" | "document" | "other"

export interface AssetAttachmentRecord extends RecordModel {
	user: string
	asset: string
	kind: AssetAttachmentKind
	title: string
	files: string[]
	notes?: string
	metadata?: Record<string, unknown>
	created: string
	updated: string
}

export type AssetLocationKind = "room" | "area" | "rack" | "cabinet" | "desk" | "zone" | "custom"

export interface AssetLocationRecord extends RecordModel {
	user: string
	name: string
	kind: AssetLocationKind
	parent_location?: string
	sort_order?: number
	notes?: string
	metadata?: Record<string, unknown>
	created: string
	updated: string
}

export type AssetChangeAction = "create" | "update" | "delete"
export type AssetChangeSourceCollection =
	| "assets"
	| "asset_interfaces"
	| "asset_relations"
	| "asset_maintenance"
	| "asset_attachments"

export interface AssetChangeRecord extends RecordModel {
	user: string
	asset: string
	source_collection: AssetChangeSourceCollection
	source_record?: string
	action: AssetChangeAction
	summary: string
	diff?: Record<string, unknown>
	created: string
}

export type AssetEnrichmentReportStatus = "draft" | "ready" | "partially_applied" | "applied" | "dismissed" | "failed"
export type AssetEnrichmentSuggestionStatus = "pending" | "accepted" | "rejected" | "stale"
export type AssetEnrichmentSuggestionSource = "local" | "online" | "comparison" | "manual"
export type AssetEnrichmentTargetCollection =
	| "assets"
	| "asset_interfaces"
	| "asset_relations"
	| "asset_maintenance"
	| "asset_attachments"

export interface AssetEnrichmentReportRecord extends RecordModel {
	user: string
	asset: string
	trigger?: "manual" | "asset_create" | "scheduled" | "import"
	status: AssetEnrichmentReportStatus
	confidence?: number
	report?: string
	source_summary?: Record<string, unknown>
	metadata?: Record<string, unknown>
	created: string
	updated: string
}

export interface AssetEnrichmentSuggestionRecord extends RecordModel {
	user: string
	report: string
	asset: string
	target_collection: AssetEnrichmentTargetCollection
	target_record?: string
	target_field: string
	target_label: string
	current_value?: string
	collected_value?: string
	online_value?: string
	recommended_value: string
	source: AssetEnrichmentSuggestionSource
	confidence?: number
	conflict?: boolean
	status: AssetEnrichmentSuggestionStatus
	notes?: string
	metadata?: Record<string, unknown>
	created: string
	updated: string
}

export type AITaskKind = "asset_enrichment" | "asset_visual"
export type AITaskStatus = "queued" | "running" | "ready" | "failed" | "applied"

export interface AITaskRecord extends RecordModel {
	user: string
	asset?: string
	kind: AITaskKind
	status: AITaskStatus
	provider?: string
	model?: string
	input_summary?: Record<string, unknown>
	output_summary?: Record<string, unknown>
	error?: string
	metadata?: Record<string, unknown>
	created: string
	updated: string
}

export type AssetVisualKind = "official_reference" | "ai_turntable" | "manual"
export type AssetVisualStatus = "draft" | "ready" | "accepted" | "rejected" | "failed"
export type AssetVisualCrop = { x: number; y: number; width: number; height: number }

export interface AssetVisualRecord extends RecordModel {
	user: string
	asset: string
	task?: string
	kind: AssetVisualKind
	status: AssetVisualStatus
	title?: string
	color?: string
	frame_count?: number
	primary?: boolean
	files?: string[]
	frames?: {
		index?: number
		angle?: number
		view?: string
		theme?: string
		presentation?: "device_image" | "provider_logo"
		label?: string
		color?: string
		url?: string
		file?: string
		file_record_id?: string
		provider?: string
		source_title?: string
		source_url?: string
		source_image_url?: string
		processing?: {
			stored_locally?: boolean
			trimmed?: boolean
			format?: string
			width?: number
			height?: number
		}
		crop?: AssetVisualCrop
	}[]
	sources?: {
		title?: string
		url?: string
		image_url?: string
		type?: string
		provider?: string
		confidence?: number
	}[]
	prompt?: string
	metadata?: Record<string, unknown>
	created: string
	updated: string
}

export interface SystemInfo {
	/** hostname */
	h: string
	/** kernel **/
	k?: string
	/** cpu percent */
	cpu: number
	/** cpu threads */
	t?: number
	/** cpu cores */
	c: number
	/** cpu model */
	m: string
	/** load average */
	la?: [number, number, number]
	/** operating system */
	o?: string
	/** uptime */
	u: number
	/** memory percent */
	mp: number
	/** disk percent */
	dp: number
	/** battery percent and state */
	bat?: [number, BatteryState]
	/** bandwidth (mb) */
	b: number
	/** bandwidth bytes */
	bb?: number
	/** bandwidth bytes by direction [sent, received] */
	bbd?: [number, number]
	/** agent version */
	v: string
	/** system is using podman */
	p?: boolean
	/** highest gpu utilization */
	g?: number
	/** gpu data is available even when current utilization is 0 */
	gs?: boolean
	/** dashboard display temperature */
	dt?: number
	/** operating system */
	os?: Os
	/** connection type */
	ct?: ConnectionType
	/** Agent connection IP observed by Hub */
	ip?: string
	/** extra filesystem percentages */
	efs?: Record<string, number>
	/** services [totalServices, numFailedServices] */
	sv?: [number, number]
	/** generic monitored services [totalServices, nonRunningServices] */
	msv?: [number, number]
	/** agent declared capabilities */
	cap?: AgentCapabilities
}

export interface AgentCapabilities {
	platform: string
	arch: string
	agent_version: string
	install_method?: string
	run_mode?: string
	agent_profile?: string
	privilege: string
	collection: string[]
	operations: string[]
	unsupported_reasons?: Record<string, string>
	last_update?: AgentUpdateResult
	collection_results?: Record<string, CapabilityStatus>
	diagnostics?: Record<string, CapabilityStatus>
}

export type CapabilityState = "confirmed" | "unavailable" | "unsupported" | "unknown" | "failed" | "stale"

export interface CapabilityStatus {
	state: CapabilityState
	checked_at?: string
	reason?: string
	detail?: string
	count?: number
}

export interface AgentUpdateResult {
	status: "succeeded" | "failed"
	version?: string
	message?: string
	time?: string
}

export interface SystemStats {
	/** cpu percent */
	cpu: number
	/** peak cpu */
	cpum?: number
	/** cpu breakdown [user, system, iowait, steal, idle] (0-100 integers) */
	cpub?: number[]
	/** per-core cpu usage [CPU0..] (0-100 integers) */
	cpus?: number[]
	/** load average */
	la?: [number, number, number]
	/** total memory (gb) */
	m: number
	/** memory used (gb) */
	mu: number
	/** memory percent */
	mp: number
	/** memory buffer + cache (gb) */
	mb: number
	/** max used memory (gb) */
	mm?: number
	/** zfs arc memory (gb) */
	mz?: number
	/** swap space (gb) */
	s: number
	/** swap used (gb) */
	su: number
	/** disk size (gb) */
	d: number
	/** disk used (gb) */
	du: number
	/** disk percent */
	dp: number
	/** disk read (mb) */
	dr: number
	/** disk write (mb) */
	dw: number
	/** max disk read (mb) */
	drm?: number
	/** max disk write (mb) */
	dwm?: number
	/** disk I/O bytes [read, write] */
	dio?: [number, number]
	/** max disk I/O bytes [read, write] */
	diom?: [number, number]
	/** disk io stats [read time factor, write time factor, io utilization %, r_await ms, w_await ms, weighted io %] */
	dios?: [number, number, number, number, number, number]
	/** max disk io stats */
	diosm?: [number, number, number, number, number, number]
	/** network sent (mb) */
	ns: number
	/** network received (mb) */
	nr: number
	/** bandwidth bytes [sent, recv] */
	b?: [number, number]
	/** max network sent (mb) */
	nsm?: number
	/** max network received (mb) */
	nrm?: number
	/** max network sent (bytes) */
	bm?: [number, number]
	/** temperatures */
	t?: Record<string, number>
	/** extra filesystems */
	efs?: Record<string, ExtraFsStats>
	/** GPU data */
	g?: Record<string, GPUData>
	/** battery percent and state */
	bat?: [number, BatteryState]
	/** network interfaces [upload bytes, download bytes, total upload bytes, total download bytes] */
	ni?: Record<string, [number, number, number, number]>
}

export interface GPUData {
	/** name */
	n: string
	/** GPU type: discrete or integrated */
	gt?: "discrete" | "integrated" | string
	/** memory used (mb) */
	mu?: number
	/** memory total (mb) */
	mt?: number
	/** usage (%) */
	u: number
	/** power (w) */
	p?: number
	/** power package (w) */
	pp?: number
	/** engines */
	e?: Record<string, number>
}

export interface ExtraFsStats {
	/** disk size (gb) */
	d: number
	/** disk used (gb) */
	du: number
	/** total read (mb) */
	r: number
	/** total write (mb) */
	w: number
	/** max read (mb) */
	rm: number
	/** max write (mb) */
	wm: number
	/** read per second (bytes) */
	rb: number
	/** write per second (bytes) */
	wb: number
	/** max read per second (bytes) */
	rbm: number
	/** max write per second (mb) */
	wbm: number
	/** disk io stats [read time factor, write time factor, io utilization %, r_await ms, w_await ms, weighted io %] */
	dios?: [number, number, number, number, number, number]
	/** max disk io stats */
	diosm?: [number, number, number, number, number, number]
}

export interface ContainerStatsRecord extends RecordModel {
	system: string
	stats: ContainerStats[]
	created: string | number
}

export interface ContainerStats {
	/** name */
	n: string
	/** cpu percent */
	c: number
	/** memory used (gb) */
	m: number
	// network sent (mb)
	ns?: number
	// network received (mb)
	nr?: number
	/** bandwidth bytes [sent, recv] */
	b?: [number, number]
}

export interface SystemStatsRecord extends RecordModel {
	system: string
	stats: SystemStats
	created: string | number
}

export interface AlertRecord extends RecordModel {
	id: string
	system: string
	asset?: string
	name: string
	triggered: boolean
	value: number
	min: number
	// user: string
}

export interface AlertPolicyRecord extends RecordModel {
	id: string
	user: string
	name: string
	value: number
	min: number
	coverage_count?: number
	coverage_system_count?: number
	coverage_assets?: AlertPolicyCoverageAsset[]
}

export interface AlertPolicyCoverageAsset {
	id: string
	name: string
	type?: AssetType
	system_id?: string
	system_name?: string
}

export interface AlertsHistoryRecord extends RecordModel {
	alert: string
	alert_id?: string
	user: string
	system: string
	asset?: string
	name: string
	val: number
	value?: number
	created: string
	resolved?: string | null
	acknowledged_at?: string | null
	acknowledged_by?: string
	silenced_until?: string | null
	silenced_by?: string
	silence_reason?: string
	expand?: {
		system?: Pick<SystemRecord, "id" | "name" | "display_name">
		asset?: Pick<AssetRecord, "id" | "name" | "type">
	}
}

export interface NotificationFailureRecord extends RecordModel {
	user: string
	system?: string
	asset?: string
	title: string
	target: string
	fingerprint: string
	error: string
	count: number
	created: string
	updated: string
	expand?: {
		asset?: Pick<AssetRecord, "id" | "name" | "type">
	}
}

export interface NotificationChannelHealthRecord extends RecordModel {
	user: string
	target: string
	fingerprint: string
	status: "unknown" | "healthy" | "failed"
	last_title?: string
	last_error?: string
	success_count?: number
	failure_count?: number
	last_checked_at?: string | null
	last_success_at?: string | null
	last_failure_at?: string | null
	last_test_at?: string | null
	created: string
	updated: string
}

export interface AlertNotificationStateRecord extends RecordModel {
	user: string
	system?: string
	asset?: string
	fingerprint: string
	alert_id: string
	title?: string
	status: "sent" | "failed" | "suppressed" | "resolved"
	last_error?: string
	suppressed_count?: number
	last_attempt_at?: string | null
	last_sent_at?: string | null
	last_suppressed_at?: string | null
	next_allowed_at?: string | null
	last_resolved_at?: string | null
	created: string
	updated: string
	expand?: {
		asset?: Pick<AssetRecord, "id" | "name" | "type">
	}
}

export interface ContainerRecord extends RecordModel {
	id: string
	system: string
	name: string
	image: string
	ports: string
	cpu: number
	memory: number
	net: number
	health: number
	status: string
	stack_project?: string
	stack_service?: string
	stack_number?: string
	stack_config?: string
	stack_working_dir?: string
	updated: number
}

export type ChartTimes = "1m" | "1h" | "12h" | "24h" | "1w" | "30d"

export interface ChartTimeData {
	[key: string]: {
		type: "1m" | "10m" | "20m" | "120m" | "480m"
		expectedInterval: number
		label: () => string
		ticks?: number
		format: (timestamp: string) => string
		getOffset: (endTime: Date) => Date
		minVersion?: string
	}
}

export interface UserSettings {
	chartTime: ChartTimes
	webhooks?: string[]
	unitTemp?: Unit
	unitNet?: Unit
	unitDisk?: Unit
	colorWarn?: number
	colorCrit?: number
	hourFormat?: HourFormat
	layoutWidth?: number
}

export interface ModuleSettingRecord extends RecordModel {
	user: string
	module_id: string
	enabled: boolean
	settings?: Record<string, unknown>
	health?: Record<string, unknown>
	created: string
	updated: string
}

type ChartDataContainer = {
	created: number | null
} & {
	[key: string]: key extends "created" ? never : ContainerStats
}

export interface SemVer {
	major: number
	minor: number
	patch: number
}

export interface ChartData {
	agentVersion: SemVer
	systemStats: SystemStatsRecord[]
	containerData: ChartDataContainer[]
	orientation: "right" | "left"
	ticks: number[]
	domain: number[]
	chartTime: ChartTimes
}

export interface AlertInfo {
	name: () => string
	unit: string
	icon: ComponentType<{ className?: string }>
	desc: () => string
	max?: number
	min?: number
	step?: number
	start?: number
	/** Single value description (when there's only one value, like status) */
	singleDesc?: () => string
	invert?: boolean
}

export type AlertMap = Record<string, Map<string, AlertRecord>>

export interface SmartData {
	/** model family */
	// mf?: string
	/** model name */
	mn?: string
	/** serial number */
	sn?: string
	/** firmware version */
	fv?: string
	/** capacity */
	c?: number
	/** smart status */
	s?: string
	/** disk name (like /dev/sda) */
	dn?: string
	/** disk type */
	dt?: string
	/** media type: nvme, ssd, hdd */
	mt?: string
	/** temperature */
	t?: number
	/** attributes */
	a?: SmartAttribute[]
}

export interface SmartAttribute {
	/** id */
	id?: number
	/** name */
	n: string
	/** value */
	v: number
	/** worst */
	w?: number
	/** threshold */
	t?: number
	/** raw value */
	rv?: number
	/** raw string */
	rs?: string
	/** when failed */
	wf?: string
}

export interface SystemDetailsRecord extends RecordModel {
	system: string
	hostname: string
	kernel: string
	cores: number
	threads: number
	cpu: string
	cpu_vendor?: string
	cpu_frequency_mhz?: number
	os: Os
	os_name: string
	memory: number
	memory_modules?: MemoryModuleDetails[]
	podman: boolean
	container_runtime_name?: string
	container_runtime_version?: string
	network_interfaces?: NetworkInterfaceDetails[]
	virtualization?: VirtualizationDetails
}

export interface VirtualizationDetails {
	type?: string
	role?: string
	name?: string
	virtual_machines?: VirtualMachineDetails[]
}

export interface VirtualMachineDetails {
	id?: string
	name: string
	status?: string
	vcpu?: number
	memory?: number
}

export interface MemoryModuleDetails {
	locator?: string
	capacity?: number
	memory_type?: string
	speed_mhz?: number
	configured_mhz?: number
	manufacturer?: string
	part_number?: string
}

export interface NetworkInterfaceDetails {
	name: string
	display_name?: string
	mac?: string
	link_speed?: number
	status?: string
	ip_method?: string
	ipv4?: string[]
	ipv6?: string[]
	gateways?: string[]
	dns_servers?: string[]
}

export interface NetworkDeviceRecord extends RecordModel {
	user: string
	name: string
	type: "internet" | "gateway" | "router" | "switch" | "ap" | "custom"
	model?: string
	management_ip?: string
	role?: string
	notes?: string
	created: string
	updated: string
}

export interface NetworkPortRecord extends RecordModel {
	user: string
	device?: string
	system?: string
	asset?: string
	name: string
	type: "wan" | "lan" | "wifi" | "uplink" | "downlink" | "management" | "system" | "custom"
	speed_mbps?: number
	notes?: string
	created: string
	updated: string
}

export interface NetworkLinkRecord extends RecordModel {
	user: string
	source_port: string
	target_port: string
	kind: "ethernet" | "wifi" | "internet" | "custom"
	name?: string
	notes?: string
	created: string
	updated: string
}

export interface NetworkLayoutRecord extends RecordModel {
	user: string
	key: string
	layout?: {
		version?: 2
		nodes?: Record<string, { x: number; y: number }>
		edge_waypoints?: Record<string, { x: number; y: number }[]>
		connection_modes?: Record<string, ("wired" | "wireless")[]>
		selected?: string
		viewport?: { x: number; y: number; zoom: number }
	}
	created: string
	updated: string
}

export interface SmartDeviceRecord extends RecordModel {
	id: string
	system: string
	name: string
	model: string
	state: string
	capacity: number
	temp: number
	firmware: string
	serial: string
	type: string
	media_type?: string
	hours: number
	cycles: number
	attributes: SmartAttribute[]
	updated: string
}

export interface MonitoredServiceRecord extends RecordModel {
	system: string
	platform: "windows" | "linux" | "darwin" | "android"
	name: string
	display_name?: string
	state: number
	start_type?: string
	updated: number
}

export interface WebsiteMonitorRecord extends RecordModel {
	user: string
	system?: string
	asset?: string
	name: string
	url: string
	description?: string
	internal_url?: string
	external_url?: string
	targets?: string
	expected_content?: string
	icon_url?: string
	group?: string
	interval_seconds: number
	timeout_seconds: number
	enabled: boolean
	last_status?: "unknown" | "up" | "down"
	last_status_code?: number
	last_latency_ms?: number
	last_error?: string
	last_failure_category?: WebsiteMonitorFailureCategory
	last_checked?: string
	uptime_24h?: number
}

export interface WebsiteMonitorCheckRecord extends RecordModel {
	user: string
	monitor: string
	target?: string
	url?: string
	ip_version?: "IPv4" | "IPv6" | string
	status: "up" | "down"
	status_code?: number
	latency_ms?: number
	error?: string
	failure_category?: WebsiteMonitorFailureCategory
	created: string
}

export type OperationFailureCode =
	| "offline"
	| "agent_disconnected"
	| "timeout"
	| "protected"
	| "unsupported"
	| "denied"
	| "invalid_request"
	| "not_found"
	| "failed"

export type WebsiteMonitorFailureCategory =
	| "dns"
	| "tcp"
	| "tls"
	| "http"
	| "timeout"
	| "redirect"
	| "content"
	| "network"
	| "unknown"

export interface PulseInfo {
	v: string // version
	cu: boolean // check updates
	agent_hub_url?: string
	environment?: "development" | "production" | string
	build_commit?: string
	build_time?: string
	agent_target_version?: string
	agent_actual_versions?: AgentVersionSummary[]
	agent_total_systems?: number
	agent_online_systems?: number
	readiness?: PulseReadinessCheck[]
}

export interface AgentVersionSummary {
	version: string
	count: number
	online: number
}

export type PulseReadinessStatus = "ok" | "warning" | "danger" | "unknown" | "info"

export interface PulseReadinessCheck {
	id: string
	title: string
	status: PulseReadinessStatus
	detail?: string
}
