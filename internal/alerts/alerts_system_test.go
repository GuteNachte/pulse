//go:build testing

package alerts_test

import (
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/entities/system"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

// alertPollTimeout bounds how long polls wait for the asynchronous alert
// delivery (record write + webhook) to settle. Polls normally succeed within
// milliseconds; the timeout only guards against regressions.
const alertPollTimeout = 5 * time.Second

type systemAlertValueSetter[T any] func(info *system.Info, stats *system.Stats, value T)

type systemAlertTestFixture struct {
	hub      *pulseTests.TestHub
	webhooks *webhookRecorder
	alertID  string
	systemID string
	submit   func(*system.CombinedData) error
}

func createCombinedData[T any](value T, setValue systemAlertValueSetter[T]) *system.CombinedData {
	var data system.CombinedData
	setValue(&data.Info, &data.Stats, value)
	return &data
}

func newSystemAlertTestFixture(t *testing.T, alertName string, min int, threshold float64) *systemAlertTestFixture {
	t.Helper()

	hub, user := pulseTests.GetHubWithUser(t)

	systems, err := pulseTests.CreateSystems(hub, 1, user.Id, "up")
	require.NoError(t, err)
	systemRecord := systems[0]

	sysManagerSystem, err := hub.GetSystemManager().GetSystemFromStore(systemRecord.Id)
	require.NoError(t, err)
	require.NotNil(t, sysManagerSystem)
	sysManagerSystem.StopUpdater()

	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/system-alert"))

	alertRecord, err := pulseTests.CreateRecord(hub, "alerts", map[string]any{
		"name":   alertName,
		"system": systemRecord.Id,
		"user":   user.Id,
		"min":    min,
		"value":  threshold,
	})
	require.NoError(t, err)

	assert.False(t, alertRecord.GetBool("triggered"), "Alert should not be triggered initially")

	alertsCache := hub.GetAlertManager().GetSystemAlertsCache()
	cachedAlerts := alertsCache.GetAlertsExcludingNames(systemRecord.Id, "Status")
	assert.Len(t, cachedAlerts, 1, "Alert should be in cache")

	return &systemAlertTestFixture{
		hub:      hub,
		webhooks: webhooks,
		alertID:  alertRecord.Id,
		systemID: systemRecord.Id,
		submit: func(data *system.CombinedData) error {
			_, err := sysManagerSystem.CreateRecords(data)
			return err
		},
	}
}

func (fixture *systemAlertTestFixture) cleanup() {
	fixture.hub.Cleanup()
}

func submitValue[T any](fixture *systemAlertTestFixture, t *testing.T, value T, setValue systemAlertValueSetter[T]) {
	t.Helper()
	require.NoError(t, fixture.submit(createCombinedData(value, setValue)))
}

func (fixture *systemAlertTestFixture) loadAlertRecord(t *testing.T) *core.Record {
	t.Helper()
	alertRecord, err := fixture.hub.FindRecordById("alerts", fixture.alertID)
	require.NoError(t, err)
	return alertRecord
}

// pollForAlertTriggered waits until the asynchronous alert delivery has settled
// the triggered flag on the alert record.
func pollForAlertTriggered(t *testing.T, fixture *systemAlertTestFixture, want bool, message string) {
	t.Helper()
	deadline := time.Now().Add(alertPollTimeout)
	for alertRecord := fixture.loadAlertRecord(t); alertRecord.GetBool("triggered") != want; alertRecord = fixture.loadAlertRecord(t) {
		if time.Now().After(deadline) {
			require.Equal(t, want, alertRecord.GetBool("triggered"), message)
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
}

// pollForWebhookCount waits until the asynchronous alert delivery has sent the
// expected number of webhook notifications.
func pollForWebhookCount(t *testing.T, fixture *systemAlertTestFixture, want int, message string) {
	t.Helper()
	deadline := time.Now().Add(alertPollTimeout)
	for fixture.webhooks.Count() != want {
		if time.Now().After(deadline) {
			require.Equal(t, want, fixture.webhooks.Count(), message)
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
}

// backdateLatestSystemStat shifts the newest 1m system_stats record into the
// past so multi-minute tests can build a full history window without real
// waiting. The autodate field keeps the manually set value because it differs
// from the last known one.
func backdateLatestSystemStat(t *testing.T, hub *pulseTests.TestHub, systemID string, shift time.Duration) {
	t.Helper()
	statsRecords, err := hub.FindRecordsByFilter(
		"system_stats",
		"system = {:system} && type = '1m'",
		"-created",
		1,
		0,
		dbx.Params{"system": systemID},
	)
	require.NoError(t, err)
	require.Len(t, statsRecords, 1)
	backdated, err := types.ParseDateTime(statsRecords[0].GetDateTime("created").Time().Add(-shift))
	require.NoError(t, err)
	statsRecords[0].SetRaw("created", backdated)
	require.NoError(t, hub.SaveNoValidate(statsRecords[0]))
}

func testOneMinuteSystemAlert[T any](t *testing.T, alertName string, threshold float64, setValue systemAlertValueSetter[T], triggerValue, resolveValue T) {
	t.Helper()

	fixture := newSystemAlertTestFixture(t, alertName, 1, threshold)
	defer fixture.cleanup()

	submitValue(fixture, t, triggerValue, setValue)
	pollForAlertTriggered(t, fixture, true, "Alert should be triggered")
	pollForWebhookCount(t, fixture, 1, "A webhook notification should have been sent")

	submitValue(fixture, t, resolveValue, setValue)
	pollForAlertTriggered(t, fixture, false, "Alert should be untriggered")
	pollForWebhookCount(t, fixture, 2, "A second webhook notification should have been sent for recovery")

	// after recovery no additional notification should arrive
	time.Sleep(300 * time.Millisecond)
	pollForWebhookCount(t, fixture, 2, "No extra webhook notification should be sent after recovery")
}

func testMultiMinuteSystemAlert[T any](t *testing.T, alertName string, threshold float64, min int, setValue systemAlertValueSetter[T], baselineValue, triggerValue, resolveValue T) {
	t.Helper()

	fixture := newSystemAlertTestFixture(t, alertName, min, threshold)
	defer fixture.cleanup()

	// the baseline lands inside the query range but, once backdated, outside
	// the alert history window, so the first trigger value alone cannot fire
	submitValue(fixture, t, baselineValue, setValue)
	backdateLatestSystemStat(t, fixture.hub, fixture.systemID, time.Duration(min+1)*time.Minute)

	submitValue(fixture, t, triggerValue, setValue)
	require.False(t, fixture.loadAlertRecord(t).GetBool("triggered"), "Alert should not be triggered until the history window is full")
	require.Zero(t, fixture.webhooks.Count(), "No webhook should be sent before the history window is full")

	submitValue(fixture, t, triggerValue, setValue)
	pollForAlertTriggered(t, fixture, true, "Alert should be triggered")
	pollForWebhookCount(t, fixture, 1, "A webhook notification should have been sent")

	submitValue(fixture, t, resolveValue, setValue)
	pollForAlertTriggered(t, fixture, false, "Alert should be untriggered")
	pollForWebhookCount(t, fixture, 2, "A second webhook notification should have been sent for recovery")
}

func setCPUAlertValue(info *system.Info, stats *system.Stats, value float64) {
	info.Cpu = value
	stats.Cpu = value
}

func setMemoryAlertValue(info *system.Info, stats *system.Stats, value float64) {
	info.MemPct = value
	stats.MemPct = value
}

func setDiskAlertValue(info *system.Info, stats *system.Stats, value float64) {
	info.DiskPct = value
	stats.DiskPct = value
}

func setBandwidthAlertValue(info *system.Info, stats *system.Stats, value [2]uint64) {
	info.BandwidthBytes = value[0] + value[1]
	stats.Bandwidth = value
}

func megabytesToBytes(mb uint64) uint64 {
	return mb * 1024 * 1024
}

func setGPUAlertValue(info *system.Info, stats *system.Stats, value float64) {
	info.GpuPct = value
	stats.GPUData = map[string]system.GPUData{
		"GPU0": {Usage: value},
	}
}

func setTemperatureAlertValue(info *system.Info, stats *system.Stats, value float64) {
	info.DashboardTemp = value
	stats.Temperatures = map[string]float64{
		"Temp0": value,
	}
}

func setLoadAvgAlertValue(info *system.Info, stats *system.Stats, value [3]float64) {
	info.LoadAvg = value
	stats.LoadAvg = value
}

func setBatteryAlertValue(info *system.Info, stats *system.Stats, value [2]uint8) {
	info.Battery = value
	stats.Battery = value
}

func TestSystemAlertsOneMin(t *testing.T) {
	testOneMinuteSystemAlert(t, "CPU", 50, setCPUAlertValue, 51, 49)
	testOneMinuteSystemAlert(t, "Memory", 50, setMemoryAlertValue, 51, 49)
	testOneMinuteSystemAlert(t, "Disk", 50, setDiskAlertValue, 51, 49)
	testOneMinuteSystemAlert(t, "Bandwidth", 50, setBandwidthAlertValue, [2]uint64{megabytesToBytes(26), megabytesToBytes(25)}, [2]uint64{megabytesToBytes(25), megabytesToBytes(24)})
	testOneMinuteSystemAlert(t, "GPU", 50, setGPUAlertValue, 51, 49)
	testOneMinuteSystemAlert(t, "Temperature", 70, setTemperatureAlertValue, 71, 69)
	testOneMinuteSystemAlert(t, "LoadAvg1", 4, setLoadAvgAlertValue, [3]float64{4.1, 0, 0}, [3]float64{3.9, 0, 0})
	testOneMinuteSystemAlert(t, "LoadAvg5", 4, setLoadAvgAlertValue, [3]float64{0, 4.1, 0}, [3]float64{0, 3.9, 0})
	testOneMinuteSystemAlert(t, "LoadAvg15", 4, setLoadAvgAlertValue, [3]float64{0, 0, 4.1}, [3]float64{0, 0, 3.9})
	testOneMinuteSystemAlert(t, "Battery", 20, setBatteryAlertValue, [2]uint8{19, 0}, [2]uint8{21, 0})
}

func TestSystemAlertsTwoMin(t *testing.T) {
	testMultiMinuteSystemAlert(t, "CPU", 50, 2, setCPUAlertValue, 10, 51, 48)
	testMultiMinuteSystemAlert(t, "Memory", 50, 2, setMemoryAlertValue, 10, 51, 48)
	testMultiMinuteSystemAlert(t, "Disk", 50, 2, setDiskAlertValue, 10, 51, 48)
	testMultiMinuteSystemAlert(t, "Bandwidth", 50, 2, setBandwidthAlertValue, [2]uint64{megabytesToBytes(10), megabytesToBytes(10)}, [2]uint64{megabytesToBytes(26), megabytesToBytes(25)}, [2]uint64{megabytesToBytes(10), megabytesToBytes(10)})
	testMultiMinuteSystemAlert(t, "GPU", 50, 2, setGPUAlertValue, 10, 51, 48)
	testMultiMinuteSystemAlert(t, "Temperature", 70, 2, setTemperatureAlertValue, 10, 71, 67)
	testMultiMinuteSystemAlert(t, "LoadAvg1", 4, 2, setLoadAvgAlertValue, [3]float64{0, 0, 0}, [3]float64{4.1, 0, 0}, [3]float64{3.5, 0, 0})
	testMultiMinuteSystemAlert(t, "LoadAvg5", 4, 2, setLoadAvgAlertValue, [3]float64{0, 2, 0}, [3]float64{0, 4.1, 0}, [3]float64{0, 3.5, 0})
	testMultiMinuteSystemAlert(t, "LoadAvg15", 4, 2, setLoadAvgAlertValue, [3]float64{0, 0, 2}, [3]float64{0, 0, 4.1}, [3]float64{0, 0, 3.5})
	testMultiMinuteSystemAlert(t, "Battery", 20, 2, setBatteryAlertValue, [2]uint8{21, 0}, [2]uint8{19, 0}, [2]uint8{25, 1})
}
