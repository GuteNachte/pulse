import { getPagePath } from "@nanostores/router"
import { useStore } from "@nanostores/react"
import { useEffect, useMemo, useState } from "react"
import { $router } from "@/components/router"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
import { $alerts } from "@/lib/stores"
import {
	buildMonitoredAssetIdsFromBindings,
	getAssetListCounts,
	LOOSE_LOCATION_FILTER,
} from "@/modules/asset-center/asset-list"
import { getLooseLocationGroups } from "@/modules/asset-center/asset-location"
import type { AssetLocationRecord, AssetMonitorBindingRecord, AssetRecord, SystemRecord } from "@/types"

export type TopologyAssetSummary = {
	total: number
	monitored: number
	manual: number
	looseLocationAssets: number
}

const emptySummary: TopologyAssetSummary = { total: 0, monitored: 0, manual: 0, looseLocationAssets: 0 }

// 首页与完整拓扑页共用同一套状态条数据，避免两页各自维护一份统计口径。
export function useTopologySummary(_systems: SystemRecord[]) {
	const alerts = useStore($alerts)
	const [assetSummary, setAssetSummary] = useState<TopologyAssetSummary>(emptySummary)

	useEffect(() => {
		let ignore = false

		async function loadAssetSummary() {
			try {
				const [assets, locations, bindings] = await Promise.all([
					pb.collection<AssetRecord>("assets").getFullList({ requestKey: null, sort: "name" }),
					pb
						.collection<AssetLocationRecord>("asset_locations")
						.getFullList({ requestKey: null, sort: "sort_order,name" }),
					pb.collection<AssetMonitorBindingRecord>("asset_monitor_bindings").getFullList({
						fields: "id,asset,provider,state",
						requestKey: null,
					}),
				])
				if (ignore) return
				const monitoredAssetIds = buildMonitoredAssetIdsFromBindings(bindings)
				const looseLocations = getLooseLocationGroups(assets, locations)
				const looseLocationAssets = looseLocations.reduce((sum, group) => sum + group.count, 0)
				const counts = getAssetListCounts({
					assets,
					locationCount: locations.length,
					looseLocationAssetCount: looseLocationAssets,
					monitoredAssetIds,
				})
				setAssetSummary({
					total: counts.total,
					monitored: counts.monitored,
					manual: counts.manual,
					looseLocationAssets: counts.looseLocationAssets,
				})
			} catch (error) {
				if (ignore || isPocketBaseAutoCancel(error)) return
				console.error("load topology asset summary", error)
			}
		}

		loadAssetSummary()
		const timer = window.setInterval(loadAssetSummary, 30_000)
		return () => {
			ignore = true
			window.clearInterval(timer)
		}
	}, [_systems])

	const activeAlertCount = useMemo(() => {
		let count = 0
		for (const systemAlerts of Object.values(alerts)) {
			for (const alert of systemAlerts.values()) {
				if (alert.triggered) count += 1
			}
		}
		return count
	}, [alerts])

	const assetSummaryHref = useMemo(() => {
		const assetsPath = getPagePath($router, "assets")
		if (assetSummary.looseLocationAssets > 0) return `${assetsPath}?location=${LOOSE_LOCATION_FILTER}`
		if (assetSummary.manual > 0) return `${getPagePath($router, "monitoring")}?state=unbound`
		return assetsPath
	}, [assetSummary])

	return { activeAlertCount, assetSummary, assetSummaryHref }
}
