import type { TopologyLayoutV2, TopologyViewport } from "../layout-v2.ts"
import { cloneSnapshot } from "./history.ts"
import type { CanvasSnapshot } from "./types.ts"

export function canvasSnapshotFromLayout(layout: TopologyLayoutV2): CanvasSnapshot {
	return cloneSnapshot({ nodes: layout.nodes, edgeWaypoints: layout.edgeWaypoints })
}

export function layoutFromCanvasSnapshot(snapshot: CanvasSnapshot, viewport: TopologyViewport): TopologyLayoutV2 {
	const cloned = cloneSnapshot(snapshot)
	return {
		version: 2,
		nodes: cloned.nodes,
		edgeWaypoints: cloned.edgeWaypoints,
		viewport: { ...viewport },
	}
}
