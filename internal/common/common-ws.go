package common

import (
	"github.com/fxamacker/cbor/v2"
	"gutenacht.site/pulse/internal/entities/service"
	"gutenacht.site/pulse/internal/entities/smart"
	"gutenacht.site/pulse/internal/entities/system"
)

type WebSocketAction = uint8

const (
	// Request system data from agent
	GetData WebSocketAction = iota
	// Check the agent device identity for WebSocket binding.
	CheckFingerprint
	// Request container logs from agent
	GetContainerLogs
	// Request container info from agent
	GetContainerInfo
	// Request SMART data from agent
	GetSmartData
	// Reserved legacy action slot.
	reservedAction5
	// Execute a constrained operation request on the agent
	RunOperation
	// Search platform services on demand without enabling full continuous collection
	SearchServices
	// Search regular software processes on demand
	SearchSoftware
	// Add new actions here...
)

// HubRequest defines the structure for requests sent from hub to agent.
type HubRequest[T any] struct {
	Action WebSocketAction `cbor:"0,keyasint"`
	Data   T               `cbor:"1,keyasint,omitempty,omitzero"`
	Id     *uint32         `cbor:"2,keyasint,omitempty"`
}

// AgentResponse defines the structure for responses sent from agent to hub.
type AgentResponse struct {
	Id          *uint32                    `cbor:"0,keyasint,omitempty"`
	SystemData  *system.CombinedData       `cbor:"1,keyasint,omitempty,omitzero"` // Legacy (<= 0.17)
	Fingerprint *FingerprintResponse       `cbor:"2,keyasint,omitempty,omitzero"` // Legacy (<= 0.17)
	Error       string                     `cbor:"3,keyasint,omitempty,omitzero"`
	String      *string                    `cbor:"4,keyasint,omitempty,omitzero"` // Legacy (<= 0.17)
	SmartData   map[string]smart.SmartData `cbor:"5,keyasint,omitempty,omitzero"` // Legacy (<= 0.17)
	// Data is the generic response payload for new endpoints (0.18+)
	Data cbor.RawMessage `cbor:"7,keyasint,omitempty,omitzero"`
}

type FingerprintRequest struct {
	Signature   []byte `cbor:"0,keyasint"`
	NeedSysInfo bool   `cbor:"1,keyasint"` // For universal token system creation
}

type FingerprintResponse struct {
	Fingerprint string `cbor:"0,keyasint"`
	// Optional system info for universal token system creation.
	Hostname string `cbor:"1,keyasint,omitzero"`
	Port     string `cbor:"2,keyasint,omitzero"`
	Name     string `cbor:"3,keyasint,omitzero"`
}

type DataRequestOptions struct {
	CacheTimeMs       uint16   `cbor:"0,keyasint"`
	IncludeDetails    bool     `cbor:"1,keyasint"`
	MonitoredServices []string `cbor:"2,keyasint,omitempty,omitzero"`
	MonitoredSoftware []string `cbor:"3,keyasint,omitempty,omitzero"`
}

type ContainerLogsRequest struct {
	ContainerID string `cbor:"0,keyasint"`
}

type ContainerInfoRequest struct {
	ContainerID string `cbor:"0,keyasint"`
}

type OperationRequest struct {
	Action string            `cbor:"0,keyasint"`
	Target string            `cbor:"1,keyasint,omitempty,omitzero"`
	Params map[string]string `cbor:"2,keyasint,omitempty,omitzero"`
}

type OperationResult struct {
	Status  string `cbor:"0,keyasint"`
	Message string `cbor:"1,keyasint,omitempty,omitzero"`
}

type ServiceSearchRequest struct {
	Query string `cbor:"0,keyasint"`
	Limit uint16 `cbor:"1,keyasint,omitempty,omitzero"`
}

type ServiceSearchResult struct {
	Services []*service.Service `cbor:"0,keyasint" json:"services"`
}

type SoftwareSearchResult struct {
	Software []*service.Service `cbor:"0,keyasint" json:"software"`
}
