package hub

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	pbTests "github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/hub/transport"
)

func TestValidateOperationParams(t *testing.T) {
	t.Run("rejects params on service operations", func(t *testing.T) {
		err := validateOperationParams("start_monitored_service", map[string]string{"delay_seconds": "1"})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "does not accept parameters")
	})

	t.Run("allows bounded agent update parameters", func(t *testing.T) {
		err := validateOperationParams("update_agent", map[string]string{
			"release_id":   "abc123",
			"version":      "0.19.0",
			"channel":      "stable",
			"platform":     "windows",
			"arch":         "amd64",
			"download_url": "https://example.test/beszel-agent.exe",
			"checksum":     "sha256:0123456789abcdef",
		})
		require.NoError(t, err)
	})

	t.Run("allows docker image update references", func(t *testing.T) {
		err := validateOperationParams("update_agent", map[string]string{
			"release_id":   "abc123",
			"version":      "1.0.0",
			"channel":      "stable",
			"platform":     "linux",
			"arch":         "amd64",
			"download_url": "registry.example.com/infra/beszel-agent:1.0.0",
		})
		require.NoError(t, err)
	})

	t.Run("requires release id for agent update", func(t *testing.T) {
		err := validateOperationParams("update_agent", map[string]string{
			"version":      "0.19.0",
			"download_url": "https://example.test/beszel-agent.exe",
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "release_id")
	})

	t.Run("rejects unsafe agent update URL", func(t *testing.T) {
		err := validateOperationParams("update_agent", map[string]string{
			"release_id":   "abc123",
			"version":      "0.19.0",
			"download_url": "file:///C:/temp/agent.exe",
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "download_url")
	})

	t.Run("rejects unknown agent update parameter", func(t *testing.T) {
		err := validateOperationParams("update_agent", map[string]string{
			"version": "0.19.0",
			"script":  "run me",
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "unsupported operation parameter")
	})
}

func TestValidateAgentUpdateRuntimeCompatibility(t *testing.T) {
	t.Run("blocks legacy linux image self update", func(t *testing.T) {
		record := newSystemRecordWithCapabilities(`{"cap":{"agent_version":"1.0.0"}}`)
		err := validateAgentUpdateRuntimeCompatibility(record, map[string]string{
			"platform":     "linux",
			"download_url": "registry.example.com/infra/beszel-agent:1.0.1",
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "1.0.1 or newer")
	})

	t.Run("allows linux image self update after bridge version", func(t *testing.T) {
		record := newSystemRecordWithCapabilities(`{"cap":{"agent_version":"1.0.1"}}`)
		err := validateAgentUpdateRuntimeCompatibility(record, map[string]string{
			"platform":     "linux",
			"download_url": "registry.example.com/infra/beszel-agent:1.0.2",
		})
		require.NoError(t, err)
	})

	t.Run("allows windows http update", func(t *testing.T) {
		record := newSystemRecordWithCapabilities(`{"cap":{"agent_version":"1.0.0"}}`)
		err := validateAgentUpdateRuntimeCompatibility(record, map[string]string{
			"platform":     "windows",
			"download_url": "http://example.test/beszel-agent.exe",
		})
		require.NoError(t, err)
	})
}

func TestSanitizeOperationParamsRedactsSecrets(t *testing.T) {
	params := sanitizeOperationParams(map[string]string{
		"release_id":    "abc123",
		"agent_token":   "token-value",
		"clientSecret":  "secret-value",
		"adminPassword": "password-value",
	})

	assert.Equal(t, "abc123", params["release_id"])
	assert.Equal(t, "***", params["agent_token"])
	assert.Equal(t, "***", params["clientSecret"])
	assert.Equal(t, "***", params["adminPassword"])
}

func TestIsAllowedOperationAction(t *testing.T) {
	for _, action := range allowedOperationActions {
		assert.True(t, isAllowedOperationAction(action), "expected %s to be allowed", action)
	}

	assert.False(t, isAllowedOperationAction("start_software"))
	assert.False(t, isAllowedOperationAction("stop_software"))
	assert.False(t, isAllowedOperationAction("restart_software"))
	assert.False(t, isAllowedOperationAction("refresh_systemd"))
	assert.False(t, isAllowedOperationAction("start_service"))
	assert.False(t, isAllowedOperationAction("stop_service"))
	assert.False(t, isAllowedOperationAction("restart_service"))
	assert.False(t, isAllowedOperationAction("shutdown_system"))
	assert.False(t, isAllowedOperationAction("reboot_system"))
	assert.False(t, isAllowedOperationAction("wake_on_lan"))
}

func TestTimeoutForOperation(t *testing.T) {
	assert.Equal(t, 120, int(timeoutForOperation("start_container").Seconds()))
	assert.Equal(t, 600, int(timeoutForOperation("restart_container_stack").Seconds()))
	assert.Equal(t, 300, int(timeoutForOperation("update_container_stack_images").Seconds()))
	assert.Equal(t, 15, int(timeoutForOperation("start_monitored_service").Seconds()))
}

func TestOperationStageForStatus(t *testing.T) {
	assert.Equal(t, "queued", operationStageForStatus("pending"))
	assert.Equal(t, "executing", operationStageForStatus("running"))
	assert.Equal(t, "completed", operationStageForStatus("succeeded"))
	assert.Equal(t, "completed", operationStageForStatus("failed"))
	assert.Equal(t, "validating", operationStageForStatus("other"))
}

func TestNormalizeOperationFailureForPreflightAndTransport(t *testing.T) {
	t.Run("offline system", func(t *testing.T) {
		failure := operationFailureForCode(operationFailureOffline, "")
		assert.Equal(t, operationFailureOffline, failure.Code)
		assert.Equal(t, 409, failure.HTTPStatus)
		assert.Contains(t, failure.Message, "机器离线")
	})

	t.Run("agent disconnected", func(t *testing.T) {
		failure := operationFailureForError(transport.ErrWebSocketNotConnected)
		assert.Equal(t, operationFailureAgentDisconnected, failure.Code)
		assert.Equal(t, 409, failure.HTTPStatus)
		assert.Contains(t, failure.Message, "Agent 未连接")
	})

	t.Run("legacy disconnected message", func(t *testing.T) {
		failure := operationFailureForError(errors.New("agent websocket operation channel is not connected"))
		assert.Equal(t, operationFailureAgentDisconnected, failure.Code)
	})

	t.Run("timeout", func(t *testing.T) {
		failure := operationFailureForError(context.DeadlineExceeded)
		assert.Equal(t, operationFailureTimeout, failure.Code)
		assert.Equal(t, 504, failure.HTTPStatus)
		assert.Contains(t, failure.Message, "操作超时")
	})
}

func TestNormalizeOperationFailureForAgentResult(t *testing.T) {
	tests := []struct {
		name       string
		result     common.OperationResult
		expectCode string
	}{
		{
			name:       "denied",
			result:     common.OperationResult{Status: "denied", Message: "release platform does not match this agent"},
			expectCode: operationFailureDenied,
		},
		{
			name:       "unsupported",
			result:     common.OperationResult{Status: "unsupported", Message: "Docker socket is not available"},
			expectCode: operationFailureUnsupported,
		},
		{
			name:       "failed",
			result:     common.OperationResult{Status: "failed", Message: "cannot pull image"},
			expectCode: operationFailureFailed,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			failure := operationFailureForResult(tc.result)
			require.NotNil(t, failure)
			assert.Equal(t, tc.expectCode, failure.Code)
			assert.Equal(t, tc.result.Message, failure.Message)
		})
	}
}

func TestCompleteOperationActionWritesExecutionMetadata(t *testing.T) {
	collection := core.NewBaseCollection("operation_actions")
	collection.Fields.Add(
		&core.SelectField{Name: "stage", Values: []string{"queued", "validating", "executing", "completed"}},
		&core.SelectField{Name: "status", Values: []string{"pending", "running", "succeeded", "failed"}},
		&core.SelectField{Name: "failure_code", Values: operationFailureCodes},
		&core.TextField{Name: "result"},
		&core.TextField{Name: "error"},
		&core.DateField{Name: "started_at"},
		&core.DateField{Name: "completed_at"},
		&core.NumberField{Name: "duration_ms"},
	)
	record := core.NewRecord(collection)
	record.Set("stage", "executing")
	record.Set("status", "running")
	record.Set("started_at", time.Now().UTC().Add(-1500*time.Millisecond))

	completeOperationAction(record, "succeeded", "done", "")

	assert.Equal(t, "completed", record.GetString("stage"))
	assert.Equal(t, "succeeded", record.GetString("status"))
	assert.Equal(t, "done", record.GetString("result"))
	assert.Empty(t, record.GetString("error"))
	assert.False(t, record.GetDateTime("completed_at").IsZero())
	assert.GreaterOrEqual(t, record.GetInt("duration_ms"), 1000)
}

func TestMonitoredServiceStateForOperation(t *testing.T) {
	state, ok := monitoredServiceStateForOperation("start_monitored_service")
	require.True(t, ok)
	assert.Equal(t, uint8(1), state)

	state, ok = monitoredServiceStateForOperation("restart_monitored_service")
	require.True(t, ok)
	assert.Equal(t, uint8(1), state)

	state, ok = monitoredServiceStateForOperation("stop_monitored_service")
	require.True(t, ok)
	assert.Equal(t, uint8(2), state)

	_, ok = monitoredServiceStateForOperation("update_agent")
	assert.False(t, ok)
}

func TestContainerStatusForOperation(t *testing.T) {
	status, ok := containerStatusForOperation("start_container")
	require.True(t, ok)
	assert.Equal(t, "Up just now", status)

	status, ok = containerStatusForOperation("restart_container")
	require.True(t, ok)
	assert.Equal(t, "Up just now", status)

	status, ok = containerStatusForOperation("stop_container")
	require.True(t, ok)
	assert.Equal(t, "Exited just now", status)

	_, ok = containerStatusForOperation("update_agent")
	assert.False(t, ok)
}

func TestIsProtectedContainer(t *testing.T) {
	assert.True(t, isProtectedContainer("beszel", "henrygd/beszel"))
	assert.True(t, isProtectedContainer("beszel-agent", "custom/agent"))
	assert.True(t, isProtectedContainer("monitor", "registry.local/ops/beszel-agent:1.0.6-test"))
	assert.True(t, isProtectedContainer("pulse-agent", "registry.example.com/infra/pulse-agent:1.0.3"))
	assert.Empty(t, protectedContainerReason("harbor-core", "goharbor/harbor-core:v2.14.4", "harbor"))
	assert.False(t, isProtectedContainer("postgres", "postgres:16-alpine"))
}

func TestFindStackOperationContainersExcludesProtectedForAllActions(t *testing.T) {
	app, err := pbTests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	defer app.Cleanup()

	collection, err := app.FindCollectionByNameOrId("containers")
	require.NoError(t, err)
	for _, fieldName := range []string{"system", "stack_project", "name", "image"} {
		if collection.Fields.GetByName(fieldName) == nil {
			collection.Fields.Add(&core.TextField{Name: fieldName})
		}
	}
	require.NoError(t, app.Save(collection))

	record := core.NewRecord(collection)
	record.Id = "ctr1"
	record.Set("system", "sys1")
	record.Set("stack_project", "agent")
	record.Set("name", "beszel-agent")
	record.Set("image", "registry.example.com/infra/beszel-agent:1.0.1")
	require.NoError(t, err)
	require.NoError(t, app.SaveNoValidate(record))

	hub := &Hub{}
	containers, err := hub.findStackOperationContainers(app, "sys1", "agent", "update_container_stack_images")
	require.ErrorIs(t, err, errProtectedContainerInStack)
	require.Nil(t, containers)

	containers, err = hub.findStackOperationContainers(app, "sys1", "agent", "restart_container_stack")
	require.ErrorIs(t, err, errProtectedContainerInStack)
	require.Nil(t, containers)
}

func TestValidateOperationCapability(t *testing.T) {
	t.Run("allows declared container control", func(t *testing.T) {
		record := newSystemRecordWithCapabilities(`{"cap":{"operations":["container_control"]}}`)
		require.NoError(t, validateOperationCapability(record, "restart_container"))
	})

	t.Run("rejects missing container control with agent reason", func(t *testing.T) {
		record := newSystemRecordWithCapabilities(`{"cap":{"operations":["service_control"],"unsupported_reasons":{"container_control":"Docker socket is read-only"}}}`)
		err := validateOperationCapability(record, "restart_container")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "Docker socket is read-only")
	})

	t.Run("allows declared agent update", func(t *testing.T) {
		record := newSystemRecordWithCapabilities(`{"cap":{"operations":["agent_update"]}}`)
		require.NoError(t, validateOperationCapability(record, "update_agent"))
	})

	t.Run("legacy record without capabilities rejects controlled operation", func(t *testing.T) {
		record := newSystemRecordWithCapabilities(`{}`)
		err := validateOperationCapability(record, "stop_container")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "container_control")
	})
}

func newSystemRecordWithCapabilities(info string) *core.Record {
	collection := core.NewBaseCollection("systems")
	record := core.NewRecord(collection)
	record.Set("info", info)
	return record
}
