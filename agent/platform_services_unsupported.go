//go:build !windows

package agent

import (
	"errors"

	"gutenacht.site/pulse/internal/entities/service"
)

type serviceManager struct{}

func newServiceManager() (*serviceManager, error) {
	return &serviceManager{}, nil
}

func (sm *serviceManager) getServiceStats([]string) []*service.Service {
	return nil
}

func (sm *serviceManager) searchServices(string, uint16) []*service.Service {
	return nil
}

func (sm *serviceManager) controlService(string, string) error {
	return errors.ErrUnsupported
}
