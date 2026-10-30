//go:build testing

package hub

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEvaluateCronHeartbeat(t *testing.T) {
	now := time.Now()
	threshold := 5 * time.Minute

	t.Run("no heartbeat means pending and not stale", func(t *testing.T) {
		entry := cronHeartbeat{}
		assert.Equal(t, cronRunPending, evaluateCronHeartbeat(entry, threshold, now))
	})

	t.Run("recently started without finish is normal", func(t *testing.T) {
		entry := cronHeartbeat{LastStart: now.Add(-30 * time.Second)}
		assert.Equal(t, cronRunNormal, evaluateCronHeartbeat(entry, threshold, now))
	})

	t.Run("recent finish is normal", func(t *testing.T) {
		entry := cronHeartbeat{LastStart: now.Add(-2 * time.Minute), LastFinish: now.Add(-time.Minute)}
		assert.Equal(t, cronRunNormal, evaluateCronHeartbeat(entry, threshold, now))
	})

	t.Run("old finish beyond threshold is stale", func(t *testing.T) {
		entry := cronHeartbeat{LastStart: now.Add(-3 * threshold), LastFinish: now.Add(-2 * threshold)}
		assert.Equal(t, cronRunStale, evaluateCronHeartbeat(entry, threshold, now))
	})

	t.Run("old start without finish is stale", func(t *testing.T) {
		// 任务开始后长时间未返回（挂起），按开始时间判定逾期。
		entry := cronHeartbeat{LastStart: now.Add(-2 * threshold)}
		assert.Equal(t, cronRunStale, evaluateCronHeartbeat(entry, threshold, now))
	})

	t.Run("finish exactly at threshold is not stale", func(t *testing.T) {
		entry := cronHeartbeat{LastStart: now.Add(-threshold), LastFinish: now.Add(-threshold)}
		assert.Equal(t, cronRunNormal, evaluateCronHeartbeat(entry, threshold, now))
	})
}

func TestCronHeartbeatTracker(t *testing.T) {
	tracker := newCronHeartbeatTracker()

	t.Run("unknown task returns zero entry", func(t *testing.T) {
		assert.Equal(t, cronHeartbeat{}, tracker.get("missing"))
	})

	t.Run("start records last start only", func(t *testing.T) {
		start := time.Now()
		tracker.recordStart("task", start)
		entry := tracker.get("task")
		assert.Equal(t, start, entry.LastStart)
		assert.True(t, entry.LastFinish.IsZero())
		assert.Empty(t, entry.LastError)
	})

	t.Run("finish with error records error", func(t *testing.T) {
		finish := time.Now()
		tracker.recordFinish("task", finish, "boom")
		entry := tracker.get("task")
		assert.Equal(t, finish, entry.LastFinish)
		assert.Equal(t, "boom", entry.LastError)
	})

	t.Run("successful finish clears previous error", func(t *testing.T) {
		tracker.recordFinish("task", time.Now(), "")
		entry := tracker.get("task")
		assert.False(t, entry.LastFinish.IsZero())
		assert.Empty(t, entry.LastError)
	})

	t.Run("next start keeps last finish until new finish", func(t *testing.T) {
		secondStart := time.Now()
		tracker.recordStart("task", secondStart)
		entry := tracker.get("task")
		assert.Equal(t, secondStart, entry.LastStart)
		assert.False(t, entry.LastFinish.IsZero())
	})

	t.Run("tasks are tracked independently", func(t *testing.T) {
		tracker.recordStart("other", time.Now())
		assert.True(t, tracker.get("missing").LastStart.IsZero())
		assert.False(t, tracker.get("other").LastStart.IsZero())
	})
}

func TestCronTaskDefinitions(t *testing.T) {
	h := &Hub{}
	definitions := h.cronTaskDefinitions()

	expected := []struct {
		name           string
		cronName       string
		schedule       string
		staleThreshold time.Duration
	}{
		{cronTaskDeleteOldRecords, "delete old records", "8 * * * *", 2 * time.Hour},
		{cronTaskCreateLongerRecords, "create longer records", "*/10 * * * *", 30 * time.Minute},
		{cronTaskMonitorRetention, "monitor retention cleanup", "0 3 * * *", 26 * time.Hour},
		{cronTaskCheckWebsiteMonitors, "check website monitors", "* * * * *", 5 * time.Minute},
		{cronTaskCheckAssetPresence, "check asset presence", "* * * * *", 5 * time.Minute},
		{cronTaskRefreshInternetAddresses, "refresh internet public addresses", internetAddressRefreshSchedule, 2 * time.Hour},
		{cronTaskScheduledBackupCheck, "scheduled daily backup", "*/5 * * * *", 30 * time.Minute},
	}

	require.Len(t, definitions, len(expected))
	names := make(map[string]bool, len(definitions))
	for i, definition := range definitions {
		want := expected[i]
		assert.Equal(t, want.name, definition.name)
		assert.Equal(t, want.cronName, definition.cronName)
		assert.Equal(t, want.schedule, definition.schedule)
		assert.Equal(t, want.staleThreshold, definition.staleThreshold)
		assert.NotNil(t, definition.run)
		names[definition.name] = true
	}
	assert.Len(t, names, len(expected), "task names should be unique")
}

func TestWithCronHeartbeat(t *testing.T) {
	h := &Hub{cronHeartbeats: newCronHeartbeatTracker()}
	task := cronTaskDefinition{name: "wrapped", run: func() {}}

	h.withCronHeartbeat(task)()
	entry := h.cronHeartbeats.get("wrapped")
	assert.False(t, entry.LastStart.IsZero())
	assert.False(t, entry.LastFinish.IsZero())
	assert.True(t, entry.LastStart.Before(entry.LastFinish) || entry.LastStart.Equal(entry.LastFinish))
	assert.Empty(t, entry.LastError)
}
