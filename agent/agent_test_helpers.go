//go:build testing

package agent

import (
	"gutenacht.site/pulse"
	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/entities/system"
)

// TESTING ONLY: GetConnectionManager is a helper function to get the connection manager for testing.
func (a *Agent) GetConnectionManager() *ConnectionManager {
	return a.connectionManager
}

// TESTING ONLY: NewTestAgent creates a lightweight Agent for WebSocket tests.
// It exercises the real connection and fingerprint handshake without collecting
// host hardware data from the developer machine.
func NewTestAgent(dataDir string) *Agent {
	a := &Agent{
		dataDir: dataDir,
		systemInfo: system.Info{
			AgentVersion: pulse.Version,
		},
		systemDetails: system.Details{
			Hostname:    "test-agent",
			Os:          system.Linux,
			OsName:      "Test Linux",
			Arch:        "amd64",
			CpuModel:    "Test CPU",
			Cores:       2,
			Threads:     2,
			MemoryTotal: 8 * 1024 * 1024 * 1024,
		},
		cache: NewSystemDataCache(),
	}
	a.connectionManager = newConnectionManager(a)
	a.handlerRegistry = NewHandlerRegistry()
	a.handlerRegistry.Register(common.GetData, testGetDataHandler{})
	return a
}

type testGetDataHandler struct{}

func (testGetDataHandler) Handle(hctx *HandlerContext) error {
	data := &system.CombinedData{
		Info: system.Info{
			AgentVersion:   pulse.Version,
			ConnectionType: system.ConnectionTypeWebSocket,
			Cpu:            1,
			MemPct:         2,
			DiskPct:        3,
			Uptime:         60,
			Threads:        2,
			Capabilities: &system.AgentCapabilities{
				Platform:           "linux",
				Arch:               "amd64",
				AgentVersion:       pulse.Version,
				InstallMethod:      "test",
				RunMode:            "test",
				AgentProfile:       "test-agent",
				Privilege:          "test",
				Collection:         []string{"basic"},
				Operations:         nil,
				UnsupportedReasons: map[string]string{},
			},
		},
		Stats: system.Stats{
			Cpu:       1,
			MemPct:    2,
			DiskPct:   3,
			Bandwidth: [2]uint64{0, 0},
		},
		Details: &hctx.Agent.systemDetails,
	}
	return hctx.SendResponse(data, hctx.RequestID)
}
