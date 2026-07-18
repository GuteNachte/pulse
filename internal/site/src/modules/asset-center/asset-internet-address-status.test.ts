import assert from "node:assert/strict"
import { getInternetAddressDisplayState, getInternetAddressRefreshFeedback } from "./asset-internet-address-status.ts"

assert.deepEqual(
	getInternetAddressRefreshFeedback({ ipv4: "203.0.113.10", ipv6: "2001:db8::10" }),
	{ title: "公网地址已刷新" }
)

assert.deepEqual(
	getInternetAddressDisplayState(
		{
			public_ipv4: "198.51.100.8",
			public_ipv4_source: "manual",
			public_ipv4_candidate: "203.0.113.10",
			public_ip_checked_at: "2026-07-19T00:00:00Z",
		},
		"ipv4"
	),
	{
		address: "198.51.100.8",
		sourceLabel: "手动确认",
		candidate: "203.0.113.10",
		checkedAt: "2026-07-19T00:00:00Z",
		needsConfirmation: true,
	}
)

assert.deepEqual(
	getInternetAddressRefreshFeedback({ ipv4: "203.0.113.10", ipv6_error: "检测服务不可达" }),
	{ title: "公网地址部分刷新", description: "IPv6：检测服务不可达" }
)

assert.deepEqual(
	getInternetAddressRefreshFeedback({ ipv4_error: "检测服务不可达", ipv6_error: "检测服务不可达" }),
	{ title: "刷新公网地址失败", description: "IPv4：检测服务不可达；IPv6：检测服务不可达", variant: "destructive" }
)
