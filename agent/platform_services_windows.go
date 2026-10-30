//go:build windows

package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os/exec"
	"sort"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/entities/service"
)

type serviceManager struct{}

type windowsServiceRow struct {
	Name        string
	DisplayName string
	State       string
	StartMode   string
}

func newServiceManager() (*serviceManager, error) {
	return &serviceManager{}, nil
}

func (sm *serviceManager) getServiceStats(names []string) []*service.Service {
	names = normalizeMonitoredServiceNames(names)
	if len(names) == 0 {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	command := fmt.Sprintf(`$names = @(%s); Get-CimInstance Win32_Service | Where-Object { $names -contains $_.Name } | Select-Object Name,DisplayName,State,StartMode | ConvertTo-Json -Compress`, powerShellStringArray(names))
	out, err := runPowerShellCommand(ctx, command)
	if err != nil {
		slog.Debug("Windows services", "err", err)
		return nil
	}

	var rows []windowsServiceRow
	if err := json.Unmarshal(out, &rows); err != nil {
		var row windowsServiceRow
		if singleErr := json.Unmarshal(out, &row); singleErr != nil {
			slog.Debug("Windows services JSON", "err", err)
			return nil
		}
		rows = []windowsServiceRow{row}
	}

	servicesByName := make(map[string]*service.Service, len(rows))
	for _, row := range rows {
		name := strings.TrimSpace(row.Name)
		if name == "" || isContainerRelatedSoftwareName(name) {
			continue
		}
		servicesByName[strings.ToLower(name)] = &service.Service{
			Name:        name,
			DisplayName: strings.TrimSpace(row.DisplayName),
			Platform:    "windows",
			State:       parseWindowsServiceState(row.State),
			StartType:   normalizeWindowsStartMode(row.StartMode),
		}
	}

	services := make([]*service.Service, 0, len(names))
	for _, configuredName := range names {
		name := strings.TrimSpace(configuredName)
		if name == "" {
			continue
		}
		if svc, ok := servicesByName[strings.ToLower(name)]; ok {
			services = append(services, svc)
			continue
		}
		services = append(services, &service.Service{
			Name:     name,
			Platform: "windows",
			State:    service.StateStopped,
		})
	}
	sort.Slice(services, func(i, j int) bool {
		return services[i].Name < services[j].Name
	})
	return services
}

func (sm *serviceManager) searchServices(query string, limit uint16) []*service.Service {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil
	}
	if limit == 0 || limit > 50 {
		limit = 50
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	quotedQuery := quotePowerShellString(query)
	command := fmt.Sprintf(`$q = %s; Get-CimInstance Win32_Service | Where-Object { $_.Name -like "*$q*" -or $_.DisplayName -like "*$q*" } | Select-Object -First %d Name,DisplayName,State,StartMode | ConvertTo-Json -Compress`, quotedQuery, limit)
	out, err := runPowerShellCommand(ctx, command)
	if err != nil {
		slog.Debug("Windows service search", "err", err)
		return nil
	}

	var rows []windowsServiceRow
	if err := json.Unmarshal(out, &rows); err != nil {
		var row windowsServiceRow
		if singleErr := json.Unmarshal(out, &row); singleErr != nil {
			slog.Debug("Windows service search JSON", "err", err)
			return nil
		}
		rows = []windowsServiceRow{row}
	}

	services := make([]*service.Service, 0, len(rows))
	for _, row := range rows {
		name := strings.TrimSpace(row.Name)
		if name == "" {
			continue
		}
		services = append(services, &service.Service{
			Name:        name,
			DisplayName: strings.TrimSpace(row.DisplayName),
			Platform:    "windows",
			State:       parseWindowsServiceState(row.State),
			StartType:   normalizeWindowsStartMode(row.StartMode),
		})
	}
	sort.Slice(services, func(i, j int) bool {
		return services[i].Name < services[j].Name
	})
	return services
}

func powerShellStringArray(values []string) string {
	if len(values) == 0 {
		return ""
	}
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, quotePowerShellString(value))
	}
	return strings.Join(quoted, ",")
}

func parseWindowsServiceState(state string) service.State {
	switch strings.ToLower(strings.TrimSpace(state)) {
	case "running":
		return service.StateRunning
	case "stopped":
		return service.StateStopped
	case "paused":
		return service.StatePaused
	case "start pending":
		return service.StateStarting
	case "stop pending":
		return service.StateStopping
	case "":
		return service.StateUnknown
	default:
		return service.StateOther
	}
}

func normalizeWindowsStartMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "auto", "automatic":
		return "auto"
	case "manual":
		return "manual"
	case "disabled":
		return "disabled"
	default:
		return strings.ToLower(strings.TrimSpace(mode))
	}
}

func (sm *serviceManager) controlService(action string, serviceName string) error {
	serviceName = strings.TrimSpace(serviceName)
	if serviceName == "" {
		return errors.New("service name is required")
	}
	if isProtectedWindowsServiceName(serviceName) {
		return errors.New("protected Windows service cannot be controlled")
	}

	var script string
	quotedServiceName := quotePowerShellString(serviceName)
	switch action {
	case "start_monitored_service":
		script = fmt.Sprintf("Start-Service -Name %s -ErrorAction Stop", quotedServiceName)
	case "stop_monitored_service":
		script = fmt.Sprintf("Stop-Service -Name %s -ErrorAction Stop", quotedServiceName)
	case "restart_monitored_service":
		script = fmt.Sprintf("Restart-Service -Name %s -Force -ErrorAction Stop", quotedServiceName)
	default:
		return fmt.Errorf("unsupported service operation: %s", action)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script).CombinedOutput()
	if ctx.Err() != nil {
		return fmt.Errorf("service operation timed out: %w", ctx.Err())
	}
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return errors.New(msg)
	}
	return nil
}

func isProtectedWindowsServiceName(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "eventlog",
		"lsm",
		"mpssvc",
		"nlasvc",
		"plugplay",
		"powershellremoting",
		"profsvc",
		"rpcss",
		"samss",
		"schedule",
		"seclogon",
		"securityhealthservice",
		"shellhwdetection",
		"themes",
		"trustedinstaller",
		"vaultsvc",
		"w32time",
		"wdiservicehost",
		"windefend",
		"winmgmt",
		"wlansvc",
		"wscsvc",
		"wuauserv":
		return true
	default:
		return false
	}
}
