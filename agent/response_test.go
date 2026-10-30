package agent

import (
	"testing"

	"github.com/fxamacker/cbor/v2"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/entities/container"
	"gutenacht.site/pulse/internal/entities/system"
)

func TestNewAgentResponseIncludesGenericSystemData(t *testing.T) {
	requestID := uint32(42)
	data := &system.CombinedData{
		Info: system.Info{
			AgentVersion: "1.0.0",
			Capabilities: &system.AgentCapabilities{
				Platform:     "windows",
				Arch:         "amd64",
				AgentVersion: "1.0.0",
				Privilege:    "admin",
				Collection:   []string{"metrics_basic", "windows_services"},
				Operations:   []string{"agent_update", "service_control"},
			},
		},
	}

	response := newAgentResponse(data, &requestID)

	require.Same(t, data, response.SystemData)
	require.NotEmpty(t, response.Data)

	var decoded system.CombinedData
	require.NoError(t, cbor.Unmarshal(response.Data, &decoded))
	require.Equal(t, "1.0.0", decoded.Info.AgentVersion)
	require.NotNil(t, decoded.Info.Capabilities)
	require.Equal(t, "windows", decoded.Info.Capabilities.Platform)
	require.Contains(t, decoded.Info.Capabilities.Operations, "agent_update")
}

func TestNewAgentResponseSanitizesOperationResultText(t *testing.T) {
	result := common.OperationResult{
		Status:  "failed",
		Message: "service failed: \xff\xfe",
	}

	response := newAgentResponse(result, nil)

	require.NotEmpty(t, response.Data)
	var decoded common.OperationResult
	require.NoError(t, cbor.Unmarshal(response.Data, &decoded))
	require.Equal(t, "failed", decoded.Status)
	require.Equal(t, "service failed:", decoded.Message)
}

func TestContainerStackInfoSurvivesCborRoundTrip(t *testing.T) {
	original := &container.Stats{
		Name: "codex-control-test",
		Stack: container.StackInfo{
			Project:    "codex-stack-test",
			Service:    "worker",
			Number:     "1",
			Config:     "/tmp/docker-compose.yml",
			WorkingDir: "/tmp",
		},
	}

	response := newAgentResponse(original, nil)

	var decoded container.Stats
	require.NoError(t, cbor.Unmarshal(response.Data, &decoded))
	require.Equal(t, "codex-stack-test", decoded.Stack.Project)
	require.Equal(t, "worker", decoded.Stack.Service)
	require.Equal(t, "1", decoded.Stack.Number)
	require.Equal(t, "/tmp/docker-compose.yml", decoded.Stack.Config)
	require.Equal(t, "/tmp", decoded.Stack.WorkingDir)
}
