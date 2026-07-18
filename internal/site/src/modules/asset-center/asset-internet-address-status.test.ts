import assert from "node:assert/strict"
import { getInternetAddressRefreshFeedback } from "./asset-internet-address-status.ts"

assert.deepEqual(
	getInternetAddressRefreshFeedback({ ipv4: "203.0.113.10", ipv6: "2001:db8::10" }),
	{ title: "公网地址已刷新" }
)

assert.deepEqual(
	getInternetAddressRefreshFeedback({ ipv4: "203.0.113.10", ipv6_error: "检测服务不可达" }),
	{ title: "公网地址部分刷新", description: "IPv6：检测服务不可达" }
)

assert.deepEqual(
	getInternetAddressRefreshFeedback({ ipv4_error: "检测服务不可达", ipv6_error: "检测服务不可达" }),
	{ title: "刷新公网地址失败", description: "IPv4：检测服务不可达；IPv6：检测服务不可达", variant: "destructive" }
)
