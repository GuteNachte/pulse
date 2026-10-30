import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
	getInternetAddressAutoRefreshSettings,
	getInternetAddressMode,
	getInternetAddressRefreshFeedback,
	internetAddressRefreshIntervalOptions,
} from "./asset-internet-address-status.ts"

assert.equal(getInternetAddressMode({}), "auto")
assert.equal(getInternetAddressMode({ public_ip_mode: "auto" }), "auto")
assert.equal(getInternetAddressMode({ public_ip_mode: "manual" }), "manual")

assert.deepEqual(getInternetAddressRefreshFeedback({ ipv4: "203.0.113.10", ipv6: "2001:db8::10" }), {
	title: "公网地址已刷新",
})

assert.deepEqual(getInternetAddressRefreshFeedback({ ipv4: "203.0.113.10", ipv6_error: "检测服务不可达" }), {
	title: "公网地址部分刷新",
	description: "IPv6：检测服务不可达",
})

assert.deepEqual(getInternetAddressRefreshFeedback({ ipv4_error: "检测服务不可达", ipv6_error: "检测服务不可达" }), {
	title: "刷新公网地址失败",
	description: "IPv4：检测服务不可达；IPv6：检测服务不可达",
	variant: "destructive",
})

assert.deepEqual(getInternetAddressAutoRefreshSettings({}), { enabled: true, intervalMinutes: 30 })
assert.deepEqual(
	getInternetAddressAutoRefreshSettings({ public_ip_auto_refresh: "no", public_ip_refresh_interval_minutes: 360 }),
	{ enabled: false, intervalMinutes: 360 }
)
assert.deepEqual(
	internetAddressRefreshIntervalOptions.map((option) => option.value),
	[15, 30, 60, 360, 720, 1440]
)

// 2026-10-20 用户拍板：基本信息编辑弹窗与卡片同构（5 组 20 字段），宽带线路/动态公网地址
// 不再混进主档表单——自动更新控件归「动态公网地址」卡片（showcase），线路参数归编辑页参数分节。
const profileForm = readFileSync(new URL("./components/asset-profile-edit-form.tsx", import.meta.url), "utf8")
assert.doesNotMatch(profileForm, /确认新地址|标记为已确认|onConfirmInternetAddress/)
assert.doesNotMatch(
	profileForm,
	/InternetAddressAutoRefreshControls|name="down_mbps"|name="build_mode"|name="carrier"/,
	"基本信息弹窗不得混入宽带线路/装机方式等异类字段"
)
assert.match(profileForm, /profile-edit-public-ip/, "宽带基本信息必须显示自动获取的 IP 字段")
assert.match(profileForm, /public_ipv4/, "宽带基本信息 IP 字段必须读取公网 IPv4")
assert.match(profileForm, /INTERNET_FORM_GROUPS/, "宽带基本信息必须显示型号分组")
assert.match(profileForm, /name="model"/, "宽带基本信息必须允许维护型号")

const infoCards = readFileSync(new URL("./components/asset-detail-info-cards.tsx", import.meta.url), "utf8")
assert.match(infoCards, /internetNetworkRows/, "宽带基本信息卡必须增加 IP 行")
assert.match(infoCards, /internetIdentityRows/, "宽带基本信息卡必须增加型号行")
assert.match(infoCards, /asset\.type === "internet"/, "IP/型号行只能对宽带资产生效")

const showcase = readFileSync(new URL("./components/asset-showcase-workspace.tsx", import.meta.url), "utf8")
assert.match(showcase, /InternetAddressAutoRefreshControls/)
assert.match(showcase, /onRefresh=\{onRefreshInternetAddresses\}/)

const detailPage = readFileSync(new URL("./asset-detail-page.tsx", import.meta.url), "utf8")
assert.doesNotMatch(detailPage, /confirmInternetAddress|onConfirmInternetAddress/)
assert.match(detailPage, /onUpdateInternetAddressSettings/)
