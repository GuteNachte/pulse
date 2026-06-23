//go:build testing

package systems

import (
	"context"
	"fmt"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/entities/smart"
	entities "gutenacht.site/pulse/internal/entities/system"
)

// The hub integration tests create/replace systems and cleanup the test apps quickly.
// Background SMART fetching can outlive teardown and crash in PocketBase internals (nil DB).
//
// We keep the explicit SMART refresh endpoint / method available, but disable
// the automatic background fetch during tests.
func backgroundSmartFetchEnabled() bool { return false }

// TESTING ONLY: GetSystemCount returns the number of systems in the store
func (sm *SystemManager) GetSystemCount() int {
	return sm.systems.Length()
}

// TESTING ONLY: HasSystem checks if a system with the given ID exists in the store
func (sm *SystemManager) HasSystem(systemID string) bool {
	return sm.systems.Has(systemID)
}

// TESTING ONLY: GetSystemStatusFromStore returns the status of a system with the given ID
// Returns an empty string if the system doesn't exist
func (sm *SystemManager) GetSystemStatusFromStore(systemID string) string {
	sys, ok := sm.systems.GetOk(systemID)
	if !ok {
		return ""
	}
	return sys.Status
}

// TESTING ONLY: GetSystemContextFromStore returns the context and cancel function for a system
func (sm *SystemManager) GetSystemContextFromStore(systemID string) (context.Context, context.CancelFunc, error) {
	sys, ok := sm.systems.GetOk(systemID)
	if !ok {
		return nil, nil, fmt.Errorf("no system")
	}
	return sys.ctx, sys.cancel, nil
}

// TESTING ONLY: GetSystemFromStore returns a store from the system
func (sm *SystemManager) GetSystemFromStore(systemID string) (*System, error) {
	sys, ok := sm.systems.GetOk(systemID)
	if !ok {
		return nil, fmt.Errorf("no system")
	}
	return sys, nil
}

// TESTING ONLY: GetAllSystemIDs returns a slice of all system IDs in the store
func (sm *SystemManager) GetAllSystemIDs() []string {
	data := sm.systems.GetAll()
	ids := make([]string, 0, len(data))
	for id := range data {
		ids = append(ids, id)
	}
	return ids
}

// TESTING ONLY: GetSystemData returns the combined data for a system with the given ID
// Returns nil if the system doesn't exist
// This method is intended for testing
func (sm *SystemManager) GetSystemData(systemID string) *entities.CombinedData {
	sys, ok := sm.systems.GetOk(systemID)
	if !ok {
		return nil
	}
	return sys.data
}

// TESTING ONLY: SystemHasLegacyHostPort returns whether a system still carries
// the removed host/port transport fields in memory.
func (sm *SystemManager) SystemHasLegacyHostPort(systemID string) bool {
	sys, ok := sm.systems.GetOk(systemID)
	if !ok {
		return false
	}
	return sys.hasLegacyHostPort()
}

// TESTING ONLY: SetSystemStatusInDB sets the status of a system directly and updates the database record
// This is intended for testing
// Returns false if the system doesn't exist
func (sm *SystemManager) SetSystemStatusInDB(systemID string, status string) bool {
	if !sm.HasSystem(systemID) {
		return false
	}

	// Update the database record
	record, err := sm.hub.FindRecordById("systems", systemID)
	if err != nil {
		return false
	}

	record.Set("status", status)
	err = sm.hub.Save(record)
	if err != nil {
		return false
	}

	return true
}

// TESTING ONLY: RemoveAllSystems removes all systems from the store
func (sm *SystemManager) RemoveAllSystems() {
	sm.shuttingDown.Store(true)
	for _, system := range sm.systems.GetAll() {
		done := system.done
		sm.RemoveSystem(system.Id)
		if done != nil {
			select {
			case <-done:
			case <-time.After(250 * time.Millisecond):
			}
		}
	}
	sm.smartFetchMap.StopCleaner()
}

func (s *System) StopUpdater() {
	s.cancel()
}

func (s *System) CreateRecords(data *entities.CombinedData) (*core.Record, error) {
	s.data = data
	return s.createRecords(data)
}

func (s *System) SaveSmartDevicesForTest(data map[string]smart.SmartData) error {
	return s.saveSmartDevices(data)
}

func (s *System) GetMonitoredServiceNamesForTest() []string {
	return s.getMonitoredServiceNames()
}

func (s *System) GetMonitoredSoftwareNamesForTest() []string {
	return s.getMonitoredSoftwareNames()
}

func NewTestSystemForRecords(sm *SystemManager, record *core.Record) *System {
	sys := sm.NewSystem(record.Id)
	sys.manager = sm
	sys.Status = record.GetString("status")
	return sys
}
