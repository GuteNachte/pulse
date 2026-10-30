import type { SmartAttribute } from "@/types"

/**
 * Chinese labels for standard ATA SMART attribute IDs. Vendor-specific IDs are
 * left to the name map below so a different drive cannot inherit a wrong label.
 */
const ATA_ATTRIBUTE_LABELS: Record<number, string> = {
	1: "底层读取错误率",
	2: "吞吐性能",
	3: "主轴起转时间",
	4: "启停次数",
	5: "重映射扇区数",
	7: "寻道错误率",
	8: "寻道性能",
	9: "通电时间",
	10: "主轴起转重试次数",
	11: "校准重试次数",
	12: "通电次数",
	13: "软件读取错误率",
	18: "磁头健康",
	22: "氦气水平",
	177: "磨损均衡计数",
	178: "已用保留块计数",
	179: "已用保留块总数",
	180: "未用保留块总数",
	181: "编程失败总数",
	182: "擦除失败总数",
	183: "运行时坏块",
	184: "端到端错误",
	187: "报告不可纠正错误",
	188: "命令超时",
	189: "磁头飞行过高写入",
	190: "气流温度",
	191: "冲击错误率",
	192: "断电回收计数",
	193: "磁头加载循环次数",
	194: "温度",
	195: "硬件 ECC 恢复",
	196: "重映射事件数",
	197: "当前待映射扇区数",
	198: "离线不可纠正扇区数",
	199: "UDMA CRC 错误数",
	200: "压力限制",
	201: "软件读取错误率",
	202: "数据地址标记错误",
	203: "运行取消",
	204: "软件 ECC 纠正",
	205: "热突变错误率",
	206: "磁头飞行高度",
	207: "主轴高电流",
	208: "主轴蜂鸣",
	209: "离线寻道性能",
	220: "磁盘移位",
	221: "冲击错误率",
	222: "加载小时数",
	223: "加载/卸载重试次数",
	224: "加载摩擦",
	225: "加载/卸载循环次数",
	226: "加载时间",
	227: "扭矩放大计数",
	228: "断电回收计数",
	230: "磁头幅度",
	231: "温度",
	232: "可用保留空间",
	233: "介质磨损指示",
	234: "热节流",
	235: "上电恢复计数",
	240: "磁头飞行小时",
	241: "累计写入 LBA",
	242: "累计读取 LBA",
	250: "读取错误重试率",
}

/**
 * Name-based fallback for attributes without a standard ATA ID, including the
 * NVMe health log entries that the Agent maps manually.
 */
const NAME_LABELS: Record<string, string> = {
	rawreaderrorrate: "底层读取错误率",
	throughputperformance: "吞吐性能",
	spinup: "主轴起转时间",
	spinuptime: "主轴起转时间",
	startstopcount: "启停次数",
	reallocatedsectorct: "重映射扇区数",
	reallocatedsectorcount: "重映射扇区数",
	seekerrorrate: "寻道错误率",
	seektimeperformance: "寻道性能",
	poweronhours: "通电时间",
	spinretrycount: "主轴起转重试次数",
	calibrationretrycount: "校准重试次数",
	powercyclecount: "通电次数",
	softreaderrorrate: "软件读取错误率",
	heliumlevel: "氦气水平",
	wearlevelingcount: "磨损均衡计数",
	usedrsvdblkcnttot: "已用保留块总数",
	unusedrsvdblkcnttot: "未用保留块总数",
	programfailcnttotal: "编程失败总数",
	erasefailcounttotal: "擦除失败总数",
	runtimebadblock: "运行时坏块",
	endtoenderror: "端到端错误",
	reporteduncorrect: "报告不可纠正错误",
	commandtimeout: "命令超时",
	highflywrites: "磁头飞行过高写入",
	airflowtemperaturecel: "气流温度",
	gsenseerrorrate: "冲击错误率",
	poweroffretractcount: "断电回收计数",
	loadcyclecount: "磁头加载循环次数",
	temperaturecelsius: "温度",
	hardwareeccrecovered: "硬件 ECC 恢复",
	reallocatedeventcount: "重映射事件数",
	currentpendingsector: "当前待映射扇区数",
	offlineuncorrectable: "离线不可纠正扇区数",
	udmacrcerrorcount: "UDMA CRC 错误数",
	multizoneerrorrate: "多区错误率",
	softreadrate: "软件读取错误率",
	dataaddressmarkerrs: "数据地址标记错误",
	runoutcancel: "运行取消",
	softecccorrection: "软件 ECC 纠正",
	thermalasperityrate: "热突变错误率",
	flyingheight: "磁头飞行高度",
	spinhighcurrent: "主轴高电流",
	spinbuzz: "主轴蜂鸣",
	offlineseekperformnce: "离线寻道性能",
	diskshift: "磁盘移位",
	loadedhours: "加载小时数",
	loadunloadretrycount: "加载/卸载重试次数",
	loadfriction: "加载摩擦",
	loadunloadcyclecount: "加载/卸载循环次数",
	loadintime: "加载时间",
	torqampcount: "扭矩放大计数",
	headamplitude: "磁头幅度",
	availablereservdspace: "可用保留空间",
	mediawearoutindicator: "介质磨损指示",
	thermalthrottle: "热节流",
	porrecoverycount: "上电恢复计数",
	headflyinghours: "磁头飞行小时",
	totallbaswritten: "累计写入 LBA",
	totallbasread: "累计读取 LBA",
	readerrorretryrate: "读取错误重试率",
	headhealth: "磁头健康",
	pressurelimit: "压力限制",
	state: "状态",
	lifetimeest: "寿命估算",
	preeolinfo: "预寿命终止信息",
	criticalwarning: "严重警告",
	temperature: "温度",
	availablespare: "可用备用空间",
	availablesparethreshold: "备用空间阈值",
	percentageused: "已用寿命百分比",
	dataunitsread: "数据读取量",
	dataunitswritten: "数据写入量",
	hostreads: "主机读取命令数",
	hostwrites: "主机写入命令数",
	controllerbusytime: "控制器忙时",
	powercycles: "通电次数",
	unsafeshutdowns: "异常断电次数",
	mediaerrors: "介质与数据完整性错误",
	numerrlogentries: "错误日志条目数",
	warningtemptime: "警告温度累计时间",
	criticalcomptime: "严重温度累计时间",
}

function normalizeAttributeName(name?: string) {
	return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function getSmartAttributeLabel(attribute: Pick<SmartAttribute, "id" | "n">): string {
	const id = Number(attribute.id)
	if (Number.isFinite(id) && id > 0) {
		const byId = ATA_ATTRIBUTE_LABELS[id]
		if (byId) {
			return byId
		}
	}
	const byName = NAME_LABELS[normalizeAttributeName(attribute.n)]
	return byName ?? "未知属性"
}

/** Keeps raw SMART strings Chinese where the firmware uses English wording. */
export function formatSmartRawValue(attribute: SmartAttribute): string {
	const raw = attribute.rs || attribute.rv?.toString() || ""
	return raw.replace(/Min\/Max/gi, "最小/最大")
}
