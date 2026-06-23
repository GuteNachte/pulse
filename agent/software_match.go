package agent

import (
	"strings"

	"gutenacht.site/pulse/internal/entities/service"
)

var containerProcessNames = map[string]struct{}{
	"conmon":                  {},
	"containerd":              {},
	"containerd-shim":         {},
	"containerd-shim-runc-v2": {},
	"docker":                  {},
	"dockerd":                 {},
	"docker-proxy":            {},
	"nerdctl":                 {},
	"podman":                  {},
}

func softwareNotRunningResults(names []string, platform string) []*service.Service {
	results := make([]*service.Service, 0, len(names))
	for _, name := range names {
		results = append(results, &service.Service{
			Name:     name,
			Platform: platform,
			State:    service.StateStopped,
		})
	}
	return results
}

func normalizeSoftwareQuery(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.TrimSuffix(value, ".exe")
	return value
}

func softwareMatches(query string, values ...string) bool {
	if query == "" {
		return false
	}
	for _, value := range values {
		candidate := normalizeSoftwareQuery(value)
		if candidate == "" {
			continue
		}
		if candidate == query || strings.Contains(candidate, query) {
			return true
		}
	}
	return false
}

func isContainerRelatedSoftwareName(name string) bool {
	key := normalizeSoftwareQuery(name)
	if _, ok := containerProcessNames[key]; ok {
		return true
	}
	return strings.Contains(key, "containerd") || strings.Contains(key, "docker") || strings.Contains(key, "podman")
}

func uniqueStrings(values []string) []string {
	if len(values) < 2 {
		return values
	}
	result := values[:0]
	var last string
	for i, value := range values {
		if i == 0 || value != last {
			result = append(result, value)
			last = value
		}
	}
	return result
}
