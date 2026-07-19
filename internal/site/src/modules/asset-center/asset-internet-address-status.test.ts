import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
	getInternetAddressAutoRefreshSettings,
	getInternetAddressDisplayState,
	getInternetAddressRefreshFeedback,
	internetAddressRefreshIntervalOptions,
} from "./asset-internet-address-status.ts"

assert.deepEqual(getInternetAddressRefreshFeedback({ ipv4: "203.0.113.10", ipv6: "2001:db8::10" }), {
	title: "公网地址已刷新",
})

assert.deepEqual(
	getInternetAddressDisplayState(
		{
			public_ipv4: "203.0.113.10",
			public_ip_checked_at: "2026-07-19T00:00:00Z",
			public_ip_next_check_at: "2026-07-19T00:30:00Z",
		},
		"ipv4"
	),
	{
		address: "203.0.113.10",
		checkedAt: "2026-07-19T00:00:00Z",
		nextCheckAt: "2026-07-19T00:30:00Z",
		error: "",
	}
)

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

const workbench = readFileSync(new URL("./components/asset-edit-workbench.tsx", import.meta.url), "utf8")
assert.doesNotMatch(workbench, /确认新地址|标记为已确认|onConfirmInternetAddress/)
assert.match(workbench, /InternetAddressAutoRefreshControls/)

const showcase = readFileSync(new URL("./components/asset-showcase-workspace.tsx", import.meta.url), "utf8")
assert.match(showcase, /InternetAddressAutoRefreshControls/)
assert.match(showcase, /onRefresh=\{onRefreshInternetAddresses\}/)

const detailPage = readFileSync(new URL("./asset-detail-page.tsx", import.meta.url), "utf8")
assert.doesNotMatch(detailPage, /confirmInternetAddress|onConfirmInternetAddress/)
assert.match(detailPage, /onUpdateInternetAddressSettings/)
