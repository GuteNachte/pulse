package hub

import (
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func isAllowedOperationAction(action string) bool {
	for _, allowed := range allowedOperationActions {
		if action == allowed {
			return true
		}
	}
	return false
}

func validateOperationParams(action string, params map[string]string) error {
	if params == nil {
		if action == "update_agent" {
			return fmt.Errorf("release_id is required")
		}
		return nil
	}
	allowed := map[string]bool{}
	switch action {
	case "update_agent":
		allowed["release_id"] = true
		allowed["version"] = true
		allowed["channel"] = true
		allowed["platform"] = true
		allowed["arch"] = true
		allowed["download_url"] = true
		allowed["checksum"] = true
	default:
		if len(params) > 0 {
			return fmt.Errorf("operation %s does not accept parameters", action)
		}
	}
	for key, value := range params {
		if !allowed[key] {
			return fmt.Errorf("unsupported operation parameter: %s", key)
		}
		if action == "update_agent" {
			if err := validateAgentUpdateParam(key, value); err != nil {
				return err
			}
		}
	}
	if action == "update_agent" && strings.TrimSpace(params["release_id"]) == "" {
		return fmt.Errorf("release_id is required")
	}
	return nil
}

func loadAgentUpdateReleaseParams(app core.App, releaseID string) (map[string]string, error) {
	releaseID = strings.TrimSpace(releaseID)
	if releaseID == "" {
		return nil, fmt.Errorf("release_id is required")
	}
	record, err := app.FindRecordById("agent_releases", releaseID)
	if err != nil {
		return nil, fmt.Errorf("agent release was not found")
	}
	if !record.GetBool("enabled") {
		reason := strings.TrimSpace(record.GetString("disabled_reason"))
		if reason == "" {
			reason = "agent release is disabled"
		}
		return nil, errors.New(reason)
	}
	params := map[string]string{
		"release_id":   record.Id,
		"version":      strings.TrimSpace(record.GetString("version")),
		"channel":      strings.TrimSpace(record.GetString("channel")),
		"platform":     strings.TrimSpace(record.GetString("platform")),
		"arch":         strings.TrimSpace(record.GetString("arch")),
		"download_url": strings.TrimSpace(record.GetString("download_url")),
		"checksum":     strings.TrimSpace(record.GetString("checksum")),
	}
	if params["download_url"] == "" {
		if params["platform"] == "linux" {
			return nil, fmt.Errorf("agent release image is required")
		}
		return nil, fmt.Errorf("agent release download_url is required")
	}
	return params, nil
}

func validateAgentUpdateParam(key string, value string) error {
	value = strings.TrimSpace(value)
	switch key {
	case "release_id":
		if len(value) > 32 {
			return fmt.Errorf("release_id is too long")
		}
	case "version":
		if value == "" || len(value) > 64 || strings.ContainsAny(value, " \t\r\n/\\") {
			return fmt.Errorf("version is invalid")
		}
	case "channel":
		if value != "stable" && value != "beta" && value != "dev" {
			return fmt.Errorf("channel must be stable, beta, or dev")
		}
	case "platform":
		switch value {
		case "all", "windows", "linux", "darwin", "android", "freebsd":
		default:
			return fmt.Errorf("platform is invalid")
		}
	case "arch":
		if len(value) > 64 || strings.ContainsAny(value, " \t\r\n/\\") {
			return fmt.Errorf("arch is invalid")
		}
	case "download_url":
		if value == "" {
			return nil
		}
		if !strings.Contains(value, "://") {
			if len(value) > 512 || strings.ContainsAny(value, " \t\r\n") || strings.HasPrefix(value, "-") {
				return fmt.Errorf("download_url image reference is invalid")
			}
			return nil
		}
		parsed, err := url.Parse(value)
		if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
			return fmt.Errorf("download_url must be http or https")
		}
	case "checksum":
		if value != "" && len(value) > 256 {
			return fmt.Errorf("checksum is too long")
		}
	}
	return nil
}

func isServiceOperationAction(action string) bool {
	return isMonitoredServiceOperationAction(action)
}

func isContainerOperationAction(action string) bool {
	switch action {
	case "start_container", "stop_container", "restart_container", "update_container_image":
		return true
	default:
		return false
	}
}

func isContainerStackOperationAction(action string) bool {
	switch action {
	case "start_container_stack", "stop_container_stack", "restart_container_stack", "update_container_stack_images":
		return true
	default:
		return false
	}
}

func validateOperationCapability(systemRecord *core.Record, action string) error {
	required := requiredAgentOperationForAction(action)
	if required == "" {
		return nil
	}
	operations, reasons := agentCapabilityData(systemRecord)
	for _, operation := range operations {
		if operation == required {
			return nil
		}
	}
	if reason := strings.TrimSpace(reasons[required]); reason != "" {
		return fmt.Errorf("agent does not support %s: %s", required, reason)
	}
	return fmt.Errorf("agent does not support %s", required)
}

func requiredAgentOperationForAction(action string) string {
	switch {
	case isContainerOperationAction(action), isContainerStackOperationAction(action):
		return "container_control"
	case isServiceOperationAction(action):
		return "service_control"
	case action == "update_agent":
		return "agent_update"
	default:
		return ""
	}
}

func agentCapabilityData(systemRecord *core.Record) ([]string, map[string]string) {
	var info struct {
		Capabilities struct {
			Operations         []string          `json:"operations"`
			UnsupportedReasons map[string]string `json:"unsupported_reasons"`
		} `json:"cap"`
	}
	if err := systemRecord.UnmarshalJSONField("info", &info); err != nil {
		return nil, nil
	}
	return info.Capabilities.Operations, info.Capabilities.UnsupportedReasons
}

func agentCapabilityPlatform(systemRecord *core.Record) string {
	var info struct {
		OS           any `json:"os"`
		Capabilities struct {
			Platform string `json:"platform"`
		} `json:"cap"`
	}
	if err := systemRecord.UnmarshalJSONField("info", &info); err != nil {
		return ""
	}
	platform := strings.ToLower(strings.TrimSpace(info.Capabilities.Platform))
	if platform != "" {
		return platform
	}
	return strings.ToLower(strings.TrimSpace(fmt.Sprint(info.OS)))
}

func validateAgentUpdateRuntimeCompatibility(systemRecord *core.Record, params map[string]string) error {
	platform := strings.ToLower(strings.TrimSpace(params["platform"]))
	downloadURL := strings.TrimSpace(params["download_url"])
	if platform != "linux" || downloadURL == "" || strings.Contains(downloadURL, "://") {
		return nil
	}
	var info struct {
		Capabilities struct {
			AgentVersion string `json:"agent_version"`
		} `json:"cap"`
	}
	if err := systemRecord.UnmarshalJSONField("info", &info); err != nil {
		return nil
	}
	if compareLooseAgentVersion(info.Capabilities.AgentVersion, "1.0.1") >= 0 {
		return nil
	}
	return fmt.Errorf("Linux container image self-update requires Agent 1.0.1 or newer; manually upgrade this agent once")
}

func compareLooseAgentVersion(a string, b string) int {
	aParts := looseAgentVersionParts(a)
	bParts := looseAgentVersionParts(b)
	for i := 0; i < 3; i++ {
		if aParts[i] < bParts[i] {
			return -1
		}
		if aParts[i] > bParts[i] {
			return 1
		}
	}
	return 0
}

func looseAgentVersionParts(value string) [3]int {
	var parts [3]int
	raw := strings.Split(strings.TrimPrefix(strings.ToLower(strings.TrimSpace(value)), "v"), ".")
	for i := 0; i < len(raw) && i < 3; i++ {
		for _, r := range raw[i] {
			if r < '0' || r > '9' {
				break
			}
			parts[i] = parts[i]*10 + int(r-'0')
		}
	}
	return parts
}

func isMonitoredServiceOperationAction(action string) bool {
	switch action {
	case "start_monitored_service", "stop_monitored_service", "restart_monitored_service":
		return true
	default:
		return false
	}
}
