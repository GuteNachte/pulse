//go:build testing

package records_test

import (
	"testing"
	"time"

	"gutenacht.site/pulse/internal/records"
	"gutenacht.site/pulse/internal/tests"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestRecordManagerCreation tests RecordManager creation
func TestRecordManagerCreation(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	rm := records.NewRecordManager(hub)
	assert.NotNil(t, rm, "RecordManager should not be nil")
}

func TestCreateLongerRecordsSkipsSystemsFilteredByModuleState(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "records-filter@example.com", "password123")
	require.NoError(t, err)
	system, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":   "filtered-system",
		"status": "up",
		"users":  []string{user.Id},
	})
	require.NoError(t, err)
	system.Set("status", "up")
	require.NoError(t, hub.SaveNoValidate(system))

	for i := range 9 {
		_, err = tests.CreateRecord(hub, "system_stats", map[string]any{
			"system":  system.Id,
			"type":    "1m",
			"stats":   `{"cpu":50}`,
			"created": time.Now().UTC().Add(-time.Duration(i) * time.Second),
		})
		require.NoError(t, err)
	}

	rm := records.NewRecordManager(hub)
	rm.SetSystemProcessingFilter(func(core.App, string) bool { return false })
	rm.CreateLongerRecords()

	count, err := hub.CountRecords("system_stats", dbx.NewExp(
		"system = {:system} AND type = {:type}",
		dbx.Params{"system": system.Id, "type": "10m"},
	))
	require.NoError(t, err)
	assert.Zero(t, count)
}

// TestTwoDecimals tests the twoDecimals helper function
func TestTwoDecimals(t *testing.T) {
	testCases := []struct {
		input    float64
		expected float64
	}{
		{1.234567, 1.23},
		{1.235, 1.24}, // Should round up
		{1.0, 1.0},
		{0.0, 0.0},
		{-1.234567, -1.23},
		{-1.235, -1.23}, // Negative rounding
	}

	for _, tc := range testCases {
		result := records.TwoDecimals(tc.input)
		assert.InDelta(t, tc.expected, result, 0.02, "twoDecimals(%f) should equal %f", tc.input, tc.expected)
	}
}
