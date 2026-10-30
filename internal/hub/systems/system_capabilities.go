package systems

import (
	"fmt"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/entities/system"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func sanitizeCapabilityStatusMaps(capabilities *system.AgentCapabilities) {
	if capabilities == nil {
		return
	}
	removed := map[string]struct{}{}
	for _, key := range disabledCapabilityKeys {
		removed[key] = struct{}{}
	}
	for _, key := range profileDisabledCapabilityKeys(capabilities.AgentProfile) {
		removed[key] = struct{}{}
	}
	if len(removed) == 0 {
		return
	}
	deleteCapabilityStatusKeys(capabilities.CollectionResults, removed)
	deleteCapabilityStatusKeys(capabilities.Diagnostics, removed)
	if len(capabilities.CollectionResults) == 0 {
		capabilities.CollectionResults = nil
	}
	if len(capabilities.Diagnostics) == 0 {
		capabilities.Diagnostics = nil
	}
}

func mergePersistedCapabilityResults(record *core.Record, info *system.Info) {
	if record == nil || info == nil || info.Capabilities == nil {
		return
	}
	var previous system.Info
	if err := record.UnmarshalJSONField("info", &previous); err != nil || previous.Capabilities == nil {
		return
	}
	preserveCapabilityStatus(info.Capabilities.CollectionResults, previous.Capabilities.CollectionResults, "smart")
	preserveCapabilityStatus(info.Capabilities.Diagnostics, previous.Capabilities.Diagnostics, "smart")
}

func markStaleCapabilityStatuses(capabilities *system.AgentCapabilities, now time.Time, smartInterval time.Duration) {
	if capabilities == nil {
		return
	}
	markStaleCapabilityStatusMap(capabilities.CollectionResults, now, smartInterval)
	markStaleCapabilityStatusMap(capabilities.Diagnostics, now, smartInterval)
}

func markStaleCapabilityStatusMap(values map[string]system.CapabilityStatus, now time.Time, smartInterval time.Duration) {
	if len(values) == 0 {
		return
	}
	for key, status := range values {
		next := markStaleCapabilityStatus(key, status, now, smartInterval)
		values[key] = next
	}
}

func markStaleCapabilityStatus(
	key string,
	status system.CapabilityStatus,
	now time.Time,
	smartInterval time.Duration,
) system.CapabilityStatus {
	if !isTimeSensitiveCapabilityState(status.State) || strings.TrimSpace(status.CheckedAt) == "" {
		return status
	}
	checkedAt, err := time.Parse(time.RFC3339, strings.TrimSpace(status.CheckedAt))
	if err != nil {
		return status
	}
	staleAfter := capabilityStaleAfter(key, smartInterval)
	if staleAfter <= 0 || now.Before(checkedAt) || now.Sub(checkedAt) <= staleAfter {
		return status
	}
	previousLabel := capabilityStateLabel(status.State)
	originalReason := strings.TrimSpace(status.Reason)
	status.State = system.CapabilityStateStale
	status.Reason = fmt.Sprintf("该采集结果已超过 %s未刷新，不能作为实时状态。上次状态：%s。", formatStaleDuration(staleAfter), previousLabel)
	if originalReason != "" {
		status.Detail = originalReason
	}
	return status
}

func isTimeSensitiveCapabilityState(state system.CapabilityState) bool {
	switch state {
	case system.CapabilityStateConfirmed, system.CapabilityStateUnavailable, system.CapabilityStateFailed:
		return true
	default:
		return false
	}
}

func capabilityStaleAfter(key string, smartInterval time.Duration) time.Duration {
	if key == "smart" {
		if smartInterval <= 0 {
			smartInterval = time.Hour
		}
		return smartInterval*2 + 5*time.Minute
	}
	heartbeatInterval := time.Duration(interval) * time.Millisecond
	if heartbeatInterval <= 0 {
		return 5 * time.Minute
	}
	return max(heartbeatInterval*5, 5*time.Minute)
}

func capabilityStateLabel(state system.CapabilityState) string {
	switch state {
	case system.CapabilityStateConfirmed:
		return "已采集"
	case system.CapabilityStateUnavailable:
		return "未发现"
	case system.CapabilityStateFailed:
		return "失败"
	case system.CapabilityStateUnsupported:
		return "不支持"
	case system.CapabilityStateUnknown:
		return "未知"
	case system.CapabilityStateStale:
		return "过期"
	default:
		return string(state)
	}
}

func formatStaleDuration(value time.Duration) string {
	value = value.Round(time.Minute)
	if value < time.Minute {
		return value.String()
	}
	hours := int(value / time.Hour)
	minutes := int((value % time.Hour) / time.Minute)
	if hours > 0 && minutes > 0 {
		return fmt.Sprintf("%d 小时 %d 分钟", hours, minutes)
	}
	if hours > 0 {
		return fmt.Sprintf("%d 小时", hours)
	}
	return fmt.Sprintf("%d 分钟", minutes)
}

func preserveCapabilityStatus(
	current map[string]system.CapabilityStatus,
	previous map[string]system.CapabilityStatus,
	key string,
) {
	if len(current) == 0 || len(previous) == 0 {
		return
	}
	currentStatus, ok := current[key]
	if !ok || currentStatus.State != system.CapabilityStateUnknown {
		return
	}
	previousStatus, ok := previous[key]
	if !ok || previousStatus.State == "" || previousStatus.State == system.CapabilityStateUnknown {
		return
	}
	current[key] = previousStatus
}

func deleteCapabilityStatusKeys(values map[string]system.CapabilityStatus, removed map[string]struct{}) {
	if len(values) == 0 || len(removed) == 0 {
		return
	}
	for key := range removed {
		delete(values, key)
	}
}

func normalizeAgentProfile(capabilities *system.AgentCapabilities) {
	if capabilities == nil || strings.TrimSpace(capabilities.AgentProfile) != "" {
		return
	}
	if strings.EqualFold(capabilities.Platform, "linux") || strings.EqualFold(capabilities.RunMode, "docker") {
		capabilities.AgentProfile = "linux-container"
	}
}

var disabledCapabilityKeys = []string{
	"extra_filesystems",
	"linux_host_agent",
	"power_privilege",
	"reboot",
	"shutdown",
	"software_control",
	"wake_on_lan",
}

func filterAgentCollection(collection []string) []string {
	if len(collection) == 0 {
		return collection
	}
	filtered := collection[:0]
	for _, item := range collection {
		switch item {
		case "extra_filesystems":
			continue
		default:
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func filterAgentOperations(operations []string) []string {
	if len(operations) == 0 {
		return operations
	}
	filtered := operations[:0]
	for _, operation := range operations {
		switch operation {
		case "shutdown", "reboot", "wake_on_lan", "software_control":
			continue
		default:
			filtered = append(filtered, operation)
		}
	}
	return filtered
}

func sanitizeProfileCapabilities(capabilities *system.AgentCapabilities) {
	removed := profileDisabledCapabilityMap(capabilities.AgentProfile)
	if len(removed) == 0 {
		return
	}
	capabilities.Collection = removeCapabilityStrings(capabilities.Collection, removed)
	capabilities.Operations = removeCapabilityStrings(capabilities.Operations, removed)
}

func profileDisabledCapabilityKeys(agentProfile string) []string {
	switch strings.ToLower(strings.TrimSpace(agentProfile)) {
	case "linux-container":
		return []string{"service_control", "software_monitor", "systemd_services"}
	default:
		return nil
	}
}

func profileDisabledCapabilityMap(agentProfile string) map[string]struct{} {
	keys := profileDisabledCapabilityKeys(agentProfile)
	if len(keys) == 0 {
		return nil
	}
	removed := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		removed[key] = struct{}{}
	}
	return removed
}

func removeCapabilityStrings(values []string, removed map[string]struct{}) []string {
	if len(values) == 0 || len(removed) == 0 {
		return values
	}
	filtered := values[:0]
	for _, value := range values {
		if _, ok := removed[value]; ok {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}

func isLinuxContainerInfo(info system.Info) bool {
	capabilities := info.Capabilities
	if capabilities == nil {
		return info.Os == system.Linux && strings.TrimSpace(info.AgentVersion) != "" && info.ConnectionType == system.ConnectionTypeWebSocket
	}
	return strings.EqualFold(capabilities.AgentProfile, "linux-container") ||
		(strings.EqualFold(capabilities.Platform, "linux") && strings.EqualFold(capabilities.RunMode, "docker")) ||
		(strings.EqualFold(capabilities.Platform, "linux") && strings.EqualFold(capabilities.InstallMethod, "docker"))
}

func isLinuxContainerSystemRecord(record *core.Record) bool {
	var info system.Info
	if err := record.UnmarshalJSONField("info", &info); err != nil {
		return false
	}
	return isLinuxContainerInfo(info)
}

func cleanupUnsupportedImportantMonitoring(app core.App, systemId string, info system.Info) error {
	if !isLinuxContainerInfo(info) {
		return nil
	}
	for _, query := range []string{
		"DELETE FROM service_control_rules WHERE system = {:system}",
		"DELETE FROM monitored_services WHERE system = {:system}",
		"DELETE FROM software_monitor_rules WHERE system = {:system}",
		"DELETE FROM monitored_software WHERE system = {:system}",
	} {
		if _, err := app.DB().NewQuery(query).Bind(dbx.Params{"system": systemId}).Execute(); err != nil {
			return err
		}
	}
	return nil
}
