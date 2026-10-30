package hub

import "github.com/pocketbase/pocketbase/core"

const legacyNetworkTopologyWriteMessage = "网络拓扑设备、端口和链路已迁移到资产中心，请通过 assets、asset_interfaces 和 asset_relations 维护。"

func (h *Hub) bindNetworkTopologyLegacyValidationHooks() {
	for _, collectionName := range []string{"network_devices", "network_ports", "network_links"} {
		name := collectionName
		h.App.OnRecordCreateRequest(name).BindFunc(func(e *core.RecordRequestEvent) error {
			return e.BadRequestError(legacyNetworkTopologyWriteMessage, nil)
		})
		h.App.OnRecordUpdateRequest(name).BindFunc(func(e *core.RecordRequestEvent) error {
			return e.BadRequestError(legacyNetworkTopologyWriteMessage, nil)
		})
	}
}
