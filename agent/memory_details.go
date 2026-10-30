package agent

import (
	"reflect"
	"strings"

	"gutenacht.site/pulse/internal/entities/system"
)

var detectMemoryModuleDetailsFunc = detectMemoryModuleDetails

func (a *Agent) refreshMemoryModuleDetails() {
	details := detectMemoryModuleDetailsFunc()
	if len(details) == 0 {
		return
	}
	installedMemoryTotal := installedMemoryTotalFromModules(details)
	if reflect.DeepEqual(a.systemDetails.MemoryModules, details) && (installedMemoryTotal == 0 || a.systemDetails.MemoryTotal == installedMemoryTotal) {
		return
	}
	a.updateSystemDetails(func(systemDetails *system.Details) {
		systemDetails.MemoryModules = details
		if installedMemoryTotal > 0 {
			systemDetails.MemoryTotal = installedMemoryTotal
		}
	})
}

func installedMemoryTotalFromModules(modules []system.MemoryModuleDetails) uint64 {
	var total uint64
	for _, module := range modules {
		total += module.Capacity
	}
	return total
}

func cleanMemoryText(value string) string {
	value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if strings.EqualFold(value, "unknown") || strings.EqualFold(value, "undefined") || strings.EqualFold(value, "not specified") {
		return ""
	}
	return value
}
