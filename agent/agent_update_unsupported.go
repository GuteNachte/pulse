//go:build !windows && !linux

package agent

import "gutenacht.site/pulse/internal/common"

func (a *Agent) controlAgentUpdate(params map[string]string) common.OperationResult {
	if _, err := parseAgentUpdateRequest(params); err != nil {
		return common.OperationResult{Status: "denied", Message: err.Error()}
	}
	return common.OperationResult{Status: "unsupported", Message: "agent self-update is only implemented for Windows in this build"}
}
