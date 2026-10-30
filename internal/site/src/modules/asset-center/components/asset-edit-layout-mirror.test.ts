import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

// 2026-10-20 用户拍板：编辑页面按实际显示来——
// 基本信息卡组内两列，编辑弹窗同样两列；硬件档案组弹窗与卡片一样「一行一个参数 / 表格组用表格」；
// 每个分类弹窗里的 Agent 填写模块全部移除，批量填写只保留编辑页的全局「Agent 填写参数」。
const dir = new URL("./", import.meta.url)
const read = (file: string) => readFileSync(fileURLToPath(new URL(file, dir)), "utf8")

const infoCard = read("asset-detail-info-cards.tsx")
const profileForm = read("asset-profile-edit-form.tsx")
assert.equal(infoCard.includes("grid grid-cols-2 gap-x-4"), true, "基本信息卡组内固定两列")
assert.equal(
	profileForm.includes('className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2"'),
	true,
	"基本信息编辑弹窗与卡片同构：组内两列"
)
assert.equal(profileForm.includes("xl:grid-cols-3"), false, "基本信息编辑弹窗不得再出现三列")
// 2026-10-20 用户拍板：所属网络太笼统，界面改叫所属网段（底层 network_domain 不变）
assert.equal(profileForm.includes("所属网段"), true, "基本信息编辑弹窗应显示所属网段")
assert.equal(infoCard.includes("所属网段"), true, "基本信息卡应显示所属网段")
assert.equal(profileForm.includes("所属网络"), false, "基本信息编辑弹窗不得再显示所属网络")
for (const title of ["基础信息", "品牌与型号", "位置与归属", "网络与状态", "采购与保修"]) {
	assert.equal(profileForm.includes(`title: "${title}"`), true, `基本信息编辑缺少「${title}」分组`)
}
// 2026-10-20 用户报「资产状态点开没有选项」：互联网/ONT/交换机之外的类型没有专属规格，
// 状态下拉必须回退标准四档，不能渲染空下拉。
assert.equal(
	profileForm.includes("selectedTypeSpec ? [...selectedTypeSpec.statusOptions] : [...STATUS_OPTIONS]"),
	true,
	"基本信息弹窗状态下拉必须在无专属规格时回退标准状态选项"
)
assert.equal(profileForm.includes("STATUS_OPTIONS"), true, "基本信息弹窗必须引用标准状态选项")
// 2026-10-20 用户拍板：服务类资产基本信息只保留与其他资产共有的公共字段——
// 型号/序列号/位置/IP/MAC/保修不展示，服务专属数据走右侧参数组。
assert.equal(profileForm.includes("SERVICE_FORM_GROUPS"), true, "基本信息弹窗缺少服务类公共字段分组")
for (const title of ["品牌与官网", "归属与用途"]) {
	assert.equal(profileForm.includes(`title: "${title}"`), true, `服务类基本信息缺少「${title}」分组`)
}
assert.equal(profileForm.includes('title: "采购信息"'), false, "服务类基本信息不得保留采购信息分组")
assert.equal(profileForm.includes("{!serviceAsset ? ("), true, "服务类基本信息必须按字段条件渲染")
assert.equal(infoCard.includes("isServiceAssetType"), true, "基本信息卡必须识别服务类资产")
assert.equal(infoCard.includes("品牌与官网"), true, "服务类基本信息卡缺少「品牌与官网」")
assert.equal(
	infoCard.includes("const visibleGroups = serviceAsset ? groups.slice(0, 4) : groups"),
	true,
	"服务类基本信息卡必须去掉采购信息组"
)
// 2026-10-20 用户拍板：宽带采购信息去掉，右侧新增宽带独有的「订阅周期」分组（计费周期/到期/自动续费）
assert.equal(read("../asset-type-specs.ts").includes('title: "订阅周期"'), true, "宽带类型规格缺少订阅周期分组")
assert.equal(
	read("../asset-detail-parameter-groups.ts").includes('"订阅周期"'),
	true,
	"宽带右侧档案必须包含订阅周期分组"
)
assert.equal(
	read("asset-parameter-group-edit-dialog.tsx").includes("serviceSectionFields"),
	true,
	"服务类分组弹窗必须能按章节字段编辑"
)
// 2026-10-20 用户拍板：详情页右栏不再显示档案标题与说明（所有资产）
assert.equal(read("asset-showcase-workspace.tsx").includes("硬件档案"), false, "详情页右栏不得再显示硬件档案标题")
assert.equal(read("asset-showcase-workspace.tsx").includes("服务档案"), false, "详情页右栏不得再显示服务档案标题")
assert.equal(
	read("../asset-edit-page.tsx").includes('isServiceAssetType(asset.type) ? "服务档案" : "硬件档案"'),
	true,
	"服务类编辑页右侧标题必须改用「服务档案」"
)
assert.equal(
	read("../asset-edit-page.tsx").includes('isServiceAssetType(asset.type) ? "按服务类别整理的已确认信息" : undefined'),
	true,
	"服务类编辑页右侧副标题必须说明服务类别"
)
// 固定 IPv4/型号/序列号只在表单确实有该字段时提交，服务类隐藏后保持原值，避免误清历史数据
for (const file of ["../asset-detail-page.tsx", "../asset-edit-page.tsx"]) {
	const page = read(file)
	assert.equal(
		page.includes('const hasFixedIpv4Field = form.get("fixed_ipv4") !== null'),
		true,
		`${file} 必须判断 fixed_ipv4 字段是否存在`
	)
	assert.equal(
		page.includes("if (hasFixedIpv4Field) metadata.fixed_ipv4 = fixedIpv4"),
		true,
		`${file} 保存时必须跳过不存在的 fixed_ipv4`
	)
	assert.equal(
		page.includes('model: modelField !== null ? modelField.toString().trim() : asset.model || ""'),
		true,
		`${file} 隐藏型号时必须保留原值`
	)
}

const groupDialog = read("asset-parameter-group-edit-dialog.tsx")
for (const marker of ["agentText", "agentPhase", "runAgentFill", "开始填写", "粘贴后点"]) {
	assert.equal(groupDialog.includes(marker), false, `分类编辑弹窗不得保留 Agent 填写模块（残留：${marker}）`)
}
// 2026-10-20 用户拍板：分组弹窗标题下不再保留说明小字，原 Agent 指引文案一并移除。
// 非表格组：一行一个参数（拖拽手柄 | 名称 | 值 | 删除），与卡片行式展示同构
assert.equal(groupDialog.includes("grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)_auto]"), true)
// 表格组保持表格编辑，与卡片表格展示同构
assert.equal(groupDialog.includes('<table className="w-full border-collapse text-xs">'), true)
// 表格组规范参数格子列数与卡片展示一致（2/3/4 列）
assert.equal(
	groupDialog.includes("grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4"),
	true,
	"规范参数格子列数要与卡片一致"
)

// 2026-10-20 用户拍板：分组重命名与「添加参数」移入编辑弹窗，卡片只保留编辑/删除
const fieldCard = read("asset-detail-field-card.tsx")
assert.equal(fieldCard.includes("TextCursorInputIcon"), false, "卡片不再保留重命名按钮")
assert.equal(fieldCard.includes("重命名分组"), false, "卡片不再保留重命名分组入口")
assert.equal(fieldCard.includes("添加参数"), false, "卡片不再保留添加参数按钮")
assert.equal(groupDialog.includes("TextCursorInputIcon"), true, "重命名图标应移入分组编辑弹窗")
assert.equal(groupDialog.includes("重命名"), true, "分组编辑弹窗应提供重命名入口")
assert.equal(groupDialog.includes("添加参数"), true, "添加参数应保留在分组编辑弹窗内")
// 2026-10-20 动态公网地址是系统分组：只提供自动更新配置，不提供添加参数/改名的通用编辑
assert.equal(groupDialog.includes('groupId === "internet-public-addresses"'), true, "公网地址分组必须单独配置")
assert.equal(groupDialog.includes("公网地址设置"), true, "公网地址分组缺少独立设置标题")
assert.equal(groupDialog.includes("保存设置"), true, "公网地址分组缺少保存设置按钮")
assert.equal(groupDialog.includes("立即刷新"), true, "公网地址分组缺少立即刷新入口")
assert.equal(groupDialog.includes("地址模式"), true, "公网地址设置缺少模式选择")
assert.equal(groupDialog.includes("自动检测"), true, "公网地址设置缺少自动检测模式")
assert.equal(groupDialog.includes("手动填写"), true, "公网地址设置缺少手动填写模式")

console.log("asset edit layout mirror contract passed")
