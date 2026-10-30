// 2026-10-25 设备地图：资产类型在拓扑上的视觉身份（左侧竖条 + 图标框 + 图例共用单一来源）。
// 类型色表达"这是什么设备"，卡片边框表达"在线状态"，两者互不干扰。
export type AssetKindIdentity = {
	/** 身份主色（竖条 / 图标 / 徽标 / 小地图） */
	accent: string
	/** 卡片底色微调，与身份色同色系 */
	tint: string
	/** 可选的类型徽标文案（如「移动设备」「广域服务」） */
	badge?: string
}

export const ASSET_KIND_IDENTITY: Record<string, AssetKindIdentity> = {
	// 广域接入（服务，不是家里的设备）
	internet: { accent: "#3E8FD8", tint: "#1B2433", badge: "广域服务" },
	// 网络设备：路由 / 交换 / AP / 网关 / 光猫 / 防火墙
	router: { accent: "#2E9E8F", tint: "#1A2624" },
	gateway: { accent: "#2E9E8F", tint: "#1A2624" },
	switch: { accent: "#2E9E8F", tint: "#1A2624" },
	ap: { accent: "#2E9E8F", tint: "#1A2624" },
	ont: { accent: "#2E9E8F", tint: "#1A2624" },
	smart_ont: { accent: "#2E9E8F", tint: "#1A2624" },
	firewall: { accent: "#2E9E8F", tint: "#1A2624" },
	// 主机 / 存储：有 Agent 的主力监控设备
	physical_host: { accent: "#4C7EBF", tint: "#1B2230" },
	nas: { accent: "#4C7EBF", tint: "#1B2230" },
	server: { accent: "#4C7EBF", tint: "#1B2230" },
	mini_pc: { accent: "#4C7EBF", tint: "#1B2230" },
	vm: { accent: "#4C7EBF", tint: "#1B2230" },
	// 个人移动设备
	phone: { accent: "#6D5AA8", tint: "#221F2E", badge: "移动设备" },
	tablet: { accent: "#6D5AA8", tint: "#221F2E", badge: "移动设备" },
	wearable: { accent: "#6D5AA8", tint: "#221F2E", badge: "移动设备" },
	ebook: { accent: "#6D5AA8", tint: "#221F2E", badge: "移动设备" },
	handheld: { accent: "#6D5AA8", tint: "#221F2E", badge: "掌机" },
	game_console: { accent: "#6D5AA8", tint: "#221F2E", badge: "游戏机" },
	// 影音 / 输出设备
	tv: { accent: "#A8743E", tint: "#241F1A" },
	speaker: { accent: "#A8743E", tint: "#241F1A" },
	printer: { accent: "#A8743E", tint: "#241F1A" },
	// 智能家居
	smarthome_gateway: { accent: "#7A6B3E", tint: "#22201A" },
	sensor: { accent: "#7A6B3E", tint: "#22201A" },
	light: { accent: "#7A6B3E", tint: "#22201A" },
	plug: { accent: "#7A6B3E", tint: "#22201A" },
	smart_switch: { accent: "#7A6B3E", tint: "#22201A" },
	lock: { accent: "#7A6B3E", tint: "#22201A" },
	vacuum: { accent: "#7A6B3E", tint: "#22201A" },
	iot: { accent: "#7A6B3E", tint: "#22201A" },
	camera: { accent: "#7A6B3E", tint: "#22201A" },
	// 其他
	ups: { accent: "#6B7280", tint: "#1E2128" },
}

const FALLBACK_IDENTITY: AssetKindIdentity = { accent: "#6B7280", tint: "#1E2128" }

export function assetKindIdentity(type: string): AssetKindIdentity {
	return ASSET_KIND_IDENTITY[type] ?? FALLBACK_IDENTITY
}

/** 图例分组：把具体类型归并为设备地图上的几大类 */
export const ASSET_KIND_GROUPS: Array<{ label: string; types: string[] }> = [
	{ label: "广域接入", types: ["internet"] },
	{ label: "网络设备", types: ["router", "gateway", "switch", "ap", "ont", "smart_ont", "firewall"] },
	{ label: "主机 / 存储", types: ["physical_host", "nas", "server", "mini_pc", "vm"] },
	{ label: "移动设备", types: ["phone", "tablet", "wearable", "ebook", "handheld", "game_console"] },
	{ label: "影音 / 打印", types: ["tv", "speaker", "printer"] },
	{
		label: "智能家居",
		types: ["smarthome_gateway", "sensor", "light", "plug", "smart_switch", "lock", "vacuum", "iot", "camera"],
	},
]

/** 图例颜色取该组第一个类型的身份色（组内同色） */
export function assetKindGroupColor(types: string[]) {
	return assetKindIdentity(types[0] ?? "").accent
}
