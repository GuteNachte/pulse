//go:build !windows

package agent

import "gutenacht.site/pulse/internal/entities/service"

type softwareManager struct{}

func newSoftwareManager() (*softwareManager, error) {
	return nil, nil
}

func (sm *softwareManager) getSoftwareStats([]string) []*service.Service {
	return nil
}

func (sm *softwareManager) searchSoftware(string, uint16) []*service.Service {
	return nil
}
