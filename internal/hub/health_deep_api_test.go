//go:build testing

package hub_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	pulseTests "gutenacht.site/pulse/internal/tests"

	"github.com/stretchr/testify/require"
)

type deepHealthDbWriteResponse struct {
	Ok         bool   `json:"ok"`
	DurationMs int64  `json:"durationMs"`
	Error      string `json:"error"`
}

type deepHealthCronTaskResponse struct {
	Name           string  `json:"name"`
	LastStart      *string `json:"lastStart"`
	LastFinish     *string `json:"lastFinish"`
	LastError      string  `json:"lastError"`
	Stale          bool    `json:"stale"`
	StaleThreshold int64   `json:"staleThreshold"`
}

type deepHealthBackupDirResponse struct {
	Configured string `json:"configured"`
	Reachable  bool   `json:"reachable"`
	IsDir      bool   `json:"isDir"`
	Error      string `json:"error"`
}

type deepHealthDiskResponse struct {
	Path        string  `json:"path"`
	TotalBytes  uint64  `json:"totalBytes"`
	FreeBytes   uint64  `json:"freeBytes"`
	UsedPercent float64 `json:"usedPercent"`
	Error       string  `json:"error"`
}

type deepHealthReportResponse struct {
	StartedAt   string                       `json:"startedAt"`
	GeneratedAt string                       `json:"generatedAt"`
	DbWrite     deepHealthDbWriteResponse    `json:"dbWrite"`
	CronTasks   []deepHealthCronTaskResponse `json:"cronTasks"`
	BackupDir   deepHealthBackupDirResponse  `json:"backupDir"`
	Disk        deepHealthDiskResponse       `json:"disk"`
}

func TestDeepHealthRequiresAdminRole(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	readOnly, err := pulseTests.CreateUserWithRole(hub, "deephealth-readonly@example.com", "password123", "readonly")
	require.NoError(t, err)
	readOnlyToken, err := readOnly.NewAuthToken()
	require.NoError(t, err)

	// anonymous -> unauthorized
	res := performTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/health/deep", nil, nil)
	require.Equal(t, http.StatusUnauthorized, res.Status)

	// non-admin user -> forbidden
	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	res = performTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/health/deep", nil, map[string]string{"Authorization": userToken})
	require.Equal(t, http.StatusForbidden, res.Status)

	// readonly -> forbidden
	res = performTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/health/deep", nil, map[string]string{"Authorization": readOnlyToken})
	require.Equal(t, http.StatusForbidden, res.Status)
}

func TestDeepHealthReport(t *testing.T) {
	hub, _ := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	admin, err := pulseTests.CreateUserWithRole(hub, "deephealth-admin@example.com", "password123", "admin")
	require.NoError(t, err)
	adminToken, err := admin.NewAuthToken()
	require.NoError(t, err)

	// 第一次请求会触发 OnServe（注册路由和 cron），随后才能拿到已包装的任务。
	res := performTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/health/deep", nil, map[string]string{"Authorization": adminToken})
	require.Equal(t, http.StatusOK, res.Status)

	// 手动触发其中一个定时任务（走的是带心跳包装的注册函数）。
	triggered := false
	const triggeredJobId = "scheduled daily backup"
	for _, job := range hub.Cron().Jobs() {
		if job.Id() == triggeredJobId {
			job.Run()
			triggered = true
		}
	}
	require.True(t, triggered, "cron job %q should be registered", triggeredJobId)

	res = performTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/health/deep", nil, map[string]string{"Authorization": adminToken})
	require.Equal(t, http.StatusOK, res.Status)

	var report deepHealthReportResponse
	require.NoError(t, json.Unmarshal([]byte(res.Body), &report), "body: %s", res.Body)

	t.Run("db write probe succeeds", func(t *testing.T) {
		require.True(t, report.DbWrite.Ok, "db write probe failed: %s", report.DbWrite.Error)
		require.Empty(t, report.DbWrite.Error)
		require.GreaterOrEqual(t, report.DbWrite.DurationMs, int64(0))
	})

	t.Run("probe record is cleaned up", func(t *testing.T) {
		// FindFirstRecordByFilter 返回 sql.ErrNoRows 即"记录已删除"（期望结果）。
		_, err := hub.FindFirstRecordByFilter("system_settings", "key = {:key}", map[string]any{"key": "_health_probe"})
		require.Error(t, err, "health probe record should be deleted after the check")
	})

	t.Run("all seven cron tasks have heartbeat entries", func(t *testing.T) {
		expected := map[string]int64{
			"delete_old_records":         int64(2 * time.Hour / time.Second),
			"create_longer_records":      int64(30 * time.Minute / time.Second),
			"monitor_retention":          int64(26 * time.Hour / time.Second),
			"check_website_monitors":     int64(5 * time.Minute / time.Second),
			"check_asset_presence":       int64(5 * time.Minute / time.Second),
			"refresh_internet_addresses": int64(2 * time.Hour / time.Second),
			"scheduled_backup_check":     int64(30 * time.Minute / time.Second),
		}
		require.Len(t, report.CronTasks, len(expected))
		seen := make(map[string]bool, len(report.CronTasks))
		for _, task := range report.CronTasks {
			seen[task.Name] = true
			require.Contains(t, expected, task.Name)
			require.Equal(t, expected[task.Name], task.StaleThreshold, "unexpected stale threshold for %s", task.Name)
		}
		require.Len(t, seen, len(expected))
	})

	t.Run("manually triggered task has heartbeat and others are pending", func(t *testing.T) {
		for _, task := range report.CronTasks {
			if task.Name == "scheduled_backup_check" {
				require.NotNil(t, task.LastStart, "triggered task should have lastStart")
				require.NotNil(t, task.LastFinish, "triggered task should have lastFinish")
				require.Empty(t, task.LastError)
				require.False(t, task.Stale)
				start, err := time.Parse(time.RFC3339, *task.LastStart)
				require.NoError(t, err)
				finish, err := time.Parse(time.RFC3339, *task.LastFinish)
				require.NoError(t, err)
				require.False(t, start.Before(finish.Add(-time.Minute)), "lastStart should be close to lastFinish")
			} else {
				require.Nil(t, task.LastStart, "%s should have no heartbeat yet", task.Name)
				require.Nil(t, task.LastFinish, "%s should have no lastFinish yet", task.Name)
				require.False(t, task.Stale, "%s should not be stale before first run", task.Name)
			}
		}
	})

	t.Run("disk and timestamps are populated", func(t *testing.T) {
		require.Empty(t, report.Disk.Error)
		require.NotEmpty(t, report.Disk.Path)
		require.Greater(t, report.Disk.TotalBytes, uint64(0))

		startedAt, err := time.Parse(time.RFC3339, report.StartedAt)
		require.NoError(t, err)
		require.False(t, startedAt.IsZero())
		generatedAt, err := time.Parse(time.RFC3339, report.GeneratedAt)
		require.NoError(t, err)
		require.False(t, generatedAt.Before(startedAt))
	})

	t.Run("backup dir reports unconfigured state", func(t *testing.T) {
		// 测试环境没有配置自动备份目录，应给出未配置提示而非崩溃。
		require.False(t, report.BackupDir.Reachable)
		require.Empty(t, report.BackupDir.Configured)
		require.NotEmpty(t, report.BackupDir.Error)
	})
}
