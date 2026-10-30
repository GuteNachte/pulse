//go:build windows

package agent

import (
	"context"
	"log/slog"
	"sort"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/entities/service"
)

type softwareManager struct{}

func newSoftwareManager() (*softwareManager, error) {
	return &softwareManager{}, nil
}

func (sm *softwareManager) getSoftwareStats(names []string) []*service.Service {
	names = normalizeMonitoredServiceNames(names)
	if len(names) == 0 {
		return nil
	}
	rows, err := listWindowsProcesses()
	if err != nil {
		slog.Debug("Windows software process scan", "err", err)
		return softwareNotRunningResults(names, "windows")
	}
	return matchWindowsProcesses(names, rows)
}

func (sm *softwareManager) searchSoftware(query string, limit uint16) []*service.Service {
	query = normalizeSoftwareQuery(query)
	if query == "" {
		return nil
	}
	if limit == 0 || limit > 50 {
		limit = 50
	}
	rows, err := listWindowsProcesses()
	if err != nil {
		slog.Debug("Windows software search", "err", err)
		return nil
	}
	candidates := make([]*service.Service, 0, limit)
	seen := make(map[string]struct{})
	for _, row := range rows {
		name := strings.TrimSpace(row.Name)
		if name == "" || isContainerRelatedSoftwareName(name) || !softwareMatches(query, name, row.Executable) {
			continue
		}
		key := normalizeSoftwareQuery(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		candidates = append(candidates, &service.Service{
			Name:        strings.TrimSuffix(name, ".exe"),
			DisplayName: name,
			Platform:    "windows",
			State:       service.StateRunning,
		})
		if len(candidates) >= int(limit) {
			break
		}
	}
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Name < candidates[j].Name
	})
	return candidates
}

func listWindowsProcesses() ([]windowsProcessRow, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	command := `Get-CimInstance Win32_Process | Select-Object Name,ProcessId,ExecutablePath,SessionId | ConvertTo-Json -Compress`
	out, err := runPowerShellCommand(ctx, command)
	if err != nil {
		return nil, err
	}
	return parseWindowsProcessRows(out)
}

func matchWindowsProcesses(names []string, rows []windowsProcessRow) []*service.Service {
	results := make([]*service.Service, 0, len(names))
	for _, configuredName := range names {
		matches := make([]string, 0, 4)
		query := normalizeSoftwareQuery(configuredName)
		for _, row := range rows {
			processName := strings.TrimSpace(row.Name)
			if processName == "" || isContainerRelatedSoftwareName(processName) {
				continue
			}
			if softwareMatches(query, processName, row.Executable) {
				matches = append(matches, processName)
			}
		}
		sort.Strings(matches)
		matches = uniqueStrings(matches)
		state := service.StateStopped
		displayName := ""
		if len(matches) > 0 {
			state = service.StateRunning
			displayName = strings.Join(matches, ", ")
		}
		results = append(results, &service.Service{
			Name:        configuredName,
			DisplayName: displayName,
			Platform:    "windows",
			State:       state,
		})
	}
	return results
}
