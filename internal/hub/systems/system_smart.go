package systems

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/entities/smart"
	"gutenacht.site/pulse/internal/entities/system"
)

type smartFetchState struct {
	LastAttempt int64
	Successful  bool
}

// FetchAndSaveSmartDevices fetches SMART data from the agent and saves it to the database
func (sys *System) FetchAndSaveSmartDevices() error {
	smartData, err := sys.FetchSmartDataFromAgent()
	if err != nil {
		sys.recordSmartFetchResult(err, 0)
		sys.updateSmartCapabilityResult(err, 0)
		return err
	}
	err = sys.saveSmartDevices(smartData)
	sys.recordSmartFetchResult(err, len(smartData))
	sys.updateSmartCapabilityResult(err, len(smartData))
	return err
}

// recordSmartFetchResult stores a cooldown entry for the SMART interval and marks
// whether the last fetch produced any devices, so failed setup can retry on reconnect.
func (sys *System) recordSmartFetchResult(err error, deviceCount int) {
	if sys.manager == nil {
		return
	}
	interval := sys.smartFetchInterval()
	success := err == nil && deviceCount > 0
	if sys.manager.hub != nil {
		sys.manager.hub.Logger().Info("SMART fetch result", "system", sys.Id, "success", success, "devices", deviceCount, "interval", interval.String(), "err", err)
	}
	sys.manager.smartFetchMap.Set(sys.Id, smartFetchState{LastAttempt: time.Now().UnixMilli(), Successful: success}, interval+time.Minute)
}

// shouldFetchSmart returns true when there is no active SMART cooldown entry for this system.
func (sys *System) shouldFetchSmart() bool {
	if sys.manager == nil {
		return true
	}
	state, ok := sys.manager.smartFetchMap.GetOk(sys.Id)
	if !ok {
		return true
	}
	return !time.UnixMilli(state.LastAttempt).Add(sys.smartFetchInterval()).After(time.Now())
}

// smartFetchInterval returns the agent-provided SMART interval or the default when unset.
func (sys *System) smartFetchInterval() time.Duration {
	if sys.smartInterval > 0 {
		return sys.smartInterval
	}
	return time.Hour
}

// saveSmartDevices saves SMART device data to the smart_devices collection
func (sys *System) saveSmartDevices(smartData map[string]smart.SmartData) error {
	hub := sys.manager.hub
	collection, err := hub.FindCachedCollectionByNameOrId("smart_devices")
	if err != nil {
		return err
	}

	activeRecordIds := make(map[string]struct{}, len(smartData))
	if len(smartData) == 0 {
		return sys.pruneStaleSmartDeviceRecords(activeRecordIds)
	}
	for deviceKey, device := range smartData {
		activeRecordIds[makeStableHashId(sys.Id, deviceKey)] = struct{}{}
		if err := sys.upsertSmartDeviceRecord(collection, deviceKey, device); err != nil {
			return err
		}
	}

	return sys.pruneStaleSmartDeviceRecords(activeRecordIds)
}

func (sys *System) updateSmartCapabilityResult(err error, deviceCount int) {
	if sys.manager == nil || sys.manager.hub == nil {
		return
	}
	record, recordErr := sys.manager.hub.FindRecordById("systems", sys.Id)
	if recordErr != nil || record == nil {
		return
	}
	var info system.Info
	if unmarshalErr := record.UnmarshalJSONField("info", &info); unmarshalErr != nil || info.Capabilities == nil {
		return
	}
	if info.Capabilities.CollectionResults == nil {
		info.Capabilities.CollectionResults = map[string]system.CapabilityStatus{}
	}
	if info.Capabilities.Diagnostics == nil {
		info.Capabilities.Diagnostics = map[string]system.CapabilityStatus{}
	}
	status := system.CapabilityStatus{
		State:     system.CapabilityStateUnavailable,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
		Reason:    "SMART collection completed but no readable devices were returned",
		Count:     deviceCount,
	}
	if err != nil {
		status.State = system.CapabilityStateFailed
		status.Reason = err.Error()
	} else if deviceCount > 0 {
		status.State = system.CapabilityStateConfirmed
		status.Reason = "SMART devices collected"
	}
	info.Capabilities.CollectionResults["smart"] = status
	info.Capabilities.Diagnostics["smart"] = status
	record.Set("info", info)
	if saveErr := sys.manager.hub.SaveNoValidate(record); saveErr != nil {
		sys.manager.hub.Logger().Warn("Failed to update SMART capability result", "system", sys.Id, "err", saveErr)
	}
}

func (sys *System) upsertSmartDeviceRecord(collection *core.Collection, deviceKey string, device smart.SmartData) error {
	hub := sys.manager.hub
	recordID := makeStableHashId(sys.Id, deviceKey)

	record, err := hub.FindRecordById(collection, recordID)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		record = core.NewRecord(collection)
		record.Set("id", recordID)
	}

	name := device.DiskName
	if name == "" {
		name = deviceKey
	}

	powerOnHours, powerCycles := extractPowerMetrics(device.Attributes)
	record.Set("system", sys.Id)
	record.Set("name", name)
	record.Set("model", device.ModelName)
	record.Set("state", device.SmartStatus)
	record.Set("capacity", device.Capacity)
	record.Set("temp", device.Temperature)
	record.Set("firmware", device.FirmwareVersion)
	record.Set("serial", device.SerialNumber)
	record.Set("type", device.DiskType)
	record.Set("media_type", device.MediaType)
	record.Set("hours", powerOnHours)
	record.Set("cycles", powerCycles)
	record.Set("attributes", device.Attributes)

	return hub.SaveNoValidate(record)
}

func (sys *System) pruneStaleSmartDeviceRecords(activeRecordIds map[string]struct{}) error {
	records, err := sys.manager.hub.FindRecordsByFilter("smart_devices", "system = {:system}", "", -1, 0, map[string]any{
		"system": sys.Id,
	})
	if err != nil {
		return err
	}
	for _, record := range records {
		if _, ok := activeRecordIds[record.Id]; ok {
			continue
		}
		if err := sys.manager.hub.Delete(record); err != nil {
			return err
		}
	}
	return nil
}

// extractPowerMetrics extracts power on hours and power cycles from SMART attributes
func extractPowerMetrics(attributes []*smart.SmartAttribute) (powerOnHours, powerCycles uint64) {
	for _, attr := range attributes {
		nameLower := strings.ToLower(attr.Name)
		if powerOnHours == 0 && (strings.Contains(nameLower, "poweronhours") || strings.Contains(nameLower, "power_on_hours")) {
			powerOnHours = attr.RawValue
		}
		if powerCycles == 0 && ((strings.Contains(nameLower, "power") && strings.Contains(nameLower, "cycle")) || strings.Contains(nameLower, "startstopcycles")) {
			powerCycles = attr.RawValue
		}
		if powerOnHours > 0 && powerCycles > 0 {
			break
		}
	}
	return
}
