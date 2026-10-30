// 2026-10-04 参数中文名映射：自动获取 / Agent 采集写入的参数键统一以中文展示。
// 只影响显示层，metadata 里的键名保持原样（英文键继续作为数据标识）。

const fetchedParamLabels: Record<string, string> = {
	baseboard_model: "主板型号",
	baseboard_vendor: "主板品牌",
	board_name: "主板名称",
	chassis_type: "机箱形态",
	cpu_cores: "CPU 核心数",
	cpu_model: "CPU 型号",
	cpu_threads: "CPU 线程数",
	dmi_manufacturer: "设备制造商",
	dmi_model: "设备型号",
	gateway: "网关",
	hostname: "主机名",
	ipv6: "IPv6 地址",
	link_speed: "链路速率",
	mac_address: "MAC 地址",
	network_adapter: "网络适配器",
	planned_agent: "计划接入监控",
	source: "数据来源",
	internal_model: "内部型号",
	official_support_url: "官方支持页",
	product_url: "产品页",
	official_image_url: "官方图片",
	official_colors: "官方配色",
	colors_available: "可选配色",
	memory_detail: "内存明细",
	power_mode: "供电方式",
	power_input: "输入电源",
	power_adapter: "电源适配器",
	usb_port_count: "USB 口数量",
	lan_port_count: "LAN 口数量",
	lan_1000_count: "千兆 LAN 口数量",
	lan_2500_count: "2.5G LAN 口数量",
	downstream_optical_port_count: "下联光口数量",
	wireless_nic_vendor: "无线网卡品牌",
	wireless_nic_model: "无线网卡型号",
	bluetooth: "蓝牙",
	nfc: "NFC",
}

export function getAssetParamLabel(key: string): string | undefined {
	return fetchedParamLabels[key]
}
