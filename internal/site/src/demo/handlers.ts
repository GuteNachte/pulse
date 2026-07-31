import { http, HttpResponse } from "msw"
import { demoBackups, demoContainers, demoSystems } from "./fixture-monitoring.ts"
import { demoCollections, demoDashboardSummary, type DemoCollectionName } from "./fixture.ts"
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
	http.get("*/api/pulse/backups", () => HttpResponse.json({ items: demoBackups })),
	http.get("*/api/backups", () => HttpResponse.json({ items: demoBackups })),
	http.get("*/api/pulse/public-info", () =>
		HttpResponse.json({
			v: "1.0.6-beta.6",
			cu: false,
			environment: "demo",
			build_commit: "public-demo",
		})
	),
	http.get("*/api/pulse/info", () =>
		HttpResponse.json({
			v: "1.0.6-beta.6",
			cu: false,
			environment: "demo",
			build_commit: "public-demo",
		})
	),
	http.get("*/api/pulse/assets/:id/media", () =>
		HttpResponse.json({ media: [], placements: [], candidates: [], enrichment_suggestions: [] })
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
