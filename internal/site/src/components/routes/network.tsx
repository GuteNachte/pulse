import { useStore } from "@nanostores/react"
import { memo, useEffect } from "react"
import { NetworkTopologyWorkspace } from "@/components/routes/home-network-topology"
import { pageTitle } from "@/lib/branding"
import { $systems } from "@/lib/stores"

export default memo(function NetworkTopologyPage() {
	const systems = useStore($systems)

	useEffect(() => {
		document.title = pageTitle("网络拓扑")
	}, [])

	return (
		<section className="grid gap-4 pb-6">
			<NetworkTopologyWorkspace systems={systems} />
		</section>
	)
})
