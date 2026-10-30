import { http, HttpResponse } from "msw"
import { demoBackups, demoContainers, demoSystems, demoWebsiteMonitors } from "./fixture-monitoring.ts"
import { DEMO_FIXTURE_MARKER, demoCollections, demoDashboardSummary, type DemoCollectionName } from "./fixture.ts"
import { DEMO_TIMESTAMP, demoAssets } from "./fixture-core.ts"
import { getRecord, listRecords, type DemoRecord } from "./records.ts"

const notFound = (path: string) =>
	HttpResponse.json(
		{ code: "demo_not_found", message: `No public demo response is defined for ${path}.` },
		{ status: 404 }
	)

const collectionRecords = (name: string) =>
	name in demoCollections ? (demoCollections[name as DemoCollectionName] as DemoRecord[]) : undefined

export const demoHandlers = [
	http.get("*/api/collections/:collection/records", ({ params, request }) => {
		const records = collectionRecords(String(params.collection))
		if (!records) return notFound(new URL(request.url).pathname)
		try {
			return HttpResponse.json(listRecords(records, new URL(request.url)))
		} catch (error) {
			return HttpResponse.json(
				{ code: "demo_bad_query", message: error instanceof Error ? error.message : "Invalid demo query." },
				{ status: 400 }
			)
		}
	}),
	http.get("*/api/collections/:collection/records/:id", ({ params, request }) => {
		const records = collectionRecords(String(params.collection))
		if (!records) return notFound(new URL(request.url).pathname)
		const record = getRecord(records, String(params.id), new URL(request.url).searchParams.get("fields") ?? undefined)
		return record ? HttpResponse.json(record) : notFound(new URL(request.url).pathname)
	}),
	http.get("*/api/pulse/systems/summary", () => HttpResponse.json({ items: demoSystems })),
	http.get("*/api/pulse/dashboard/summary", () => HttpResponse.json(demoDashboardSummary)),
	http.get("*/api/pulse/containers", ({ request }) => {
		const requestedSystem = new URL(request.url).searchParams.get("system") ?? ""
		const items = requestedSystem
			? demoContainers.filter((container) => container.system === requestedSystem)
			: demoContainers
		const systems = demoSystems.map((system) => {
			const systemContainers = demoContainers.filter((container) => container.system === system.id)
			return {
				id: system.id,
				total: systemContainers.length,
				running: systemContainers.filter((container) => container.status === "running").length,
				stopped: systemContainers.filter((container) => container.status !== "running").length,
			}
		})
		return HttpResponse.json({ items, systems, system: requestedSystem, hasMore: false, limit: 5000 })
	}),
	http.get("*/api/pulse/website-monitors", ({ request }) => {
		const url = new URL(request.url)
		const search = (url.searchParams.get("search") ?? "").trim().toLocaleLowerCase()
		const status = url.searchParams.get("status") ?? "all"
		const system = url.searchParams.get("system") ?? ""
		const filtered = demoWebsiteMonitors.filter((monitor) => {
			const matchesSearch = !search || `${monitor.name} ${monitor.url}`.toLocaleLowerCase().includes(search)
			const matchesStatus = status === "all" || monitor.last_status === status
			const matchesSystem = !system || monitor.system === system
			return matchesSearch && matchesStatus && matchesSystem
		})
		const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
		const perPage = Math.max(1, Number(url.searchParams.get("perPage")) || 50)
		const items = filtered.slice((page - 1) * perPage, page * perPage)
		return HttpResponse.json({
			items,
			page,
			perPage,
			hasMore: page * perPage < filtered.length,
			counts: {
				all: filtered.length,
				up: filtered.filter((monitor) => monitor.last_status === "up").length,
				down: filtered.filter((monitor) => monitor.last_status === "down").length,
				unknown: filtered.filter((monitor) => monitor.last_status !== "up" && monitor.last_status !== "down").length,
				stale: 0,
			},
		})
	}),
	http.get("*/api/pulse/backups", () => HttpResponse.json({ items: demoBackups })),
	http.get("*/api/backups", () => HttpResponse.json({ items: demoBackups })),
	http.get("*/api/pulse/assets/:id/media", () =>
		HttpResponse.json({ versions: [], placements: [], candidates: [], enrichment_suggestions: [] })
	),
	// 2026-10-30 1.0.8 页面依赖的自定义只读 API：演示返回空集（页面显示空态，不报错）
	http.get("*/api/pulse/alert-policies", () => HttpResponse.json({ items: [] })),
	// 资产监控列表：Agent 主机健康、NAS 健康、其余未接入（与 fixture 资产一致）
	http.get("*/api/pulse/asset-monitoring", () => {
		const agentItem = (assetId: string, systemId: string, state: string, summary: Record<string, unknown>) => ({
			asset: demoAssets.find((asset) => asset.id === assetId),
			binding: {
				id: `demo-binding-${assetId}`,
				provider: "agent",
				target_id: systemId,
				state,
				last_checked: DEMO_TIMESTAMP,
				last_error: "",
			},
			provider: "agent",
			state,
			summary,
		})
		const items = [
			agentItem("demo-nas", "demo-system-nas", "healthy", { cpu: 18, mem: 46, disk: 63, upload: 1.2, download: 3.4 }),
			agentItem("demo-windows", "demo-system-windows", "healthy", {
				cpu: 36,
				mem: 58,
				disk: 41,
				upload: 0.8,
				download: 2.1,
			}),
			agentItem("demo-linux", "demo-system-linux", "error", { cpu: 0, mem: 0, disk: 72, upload: 0, download: 0 }),
		]
		const unboundTypes = new Set(["phone", "light", "sensor", "web_endpoint"])
		for (const asset of demoAssets) {
			if (["demo-nas", "demo-windows", "demo-linux"].includes(asset.id)) continue
			if (!unboundTypes.has(asset.type) && ["ont", "switch", "ap", "router"].includes(asset.type)) continue
			items.push({ asset, provider: "", state: "unbound" } as never)
		}
		return HttpResponse.json({
			items,
			counts: {
				total: items.length,
				monitorable: items.length,
				unbound: items.length - 3,
				pending: 0,
				healthy: 2,
				error: 1,
				paused: 0,
				unsupported: 0,
			},
		})
	}),
	http.get("*/api/pulse/public-info", () =>
		HttpResponse.json({
			v: "1.0.8",
			cu: false,
			environment: "demo",
			build_commit: "public-demo",
			demo_fixture: DEMO_FIXTURE_MARKER,
		})
	),
	http.get("*/api/pulse/info", () =>
		HttpResponse.json({
			v: "1.0.8",
			cu: false,
			environment: "demo",
			build_commit: "public-demo",
			demo_fixture: DEMO_FIXTURE_MARKER,
		})
	),
	http.get("*/api/*", ({ request }) => notFound(new URL(request.url).pathname)),
	http.all("*/api/*", ({ request }) =>
		HttpResponse.json(
			{
				code: "demo_read_only",
				message: "演示模式为只读，数据不会被修改。",
				method: request.method,
			},
			{ status: 405 }
		)
	),
]
