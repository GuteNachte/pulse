//go:build testing

package hub

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	pbTests "github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/require"
	_ "gutenacht.site/pulse/internal/migrations"
)

func atUTC(year int, month time.Month, day int, hour int, minute int) time.Time {
	return time.Date(year, month, day, hour, minute, 0, 0, time.UTC)
}

func TestPlanScheduledBackupCleanup(t *testing.T) {
	now := atUTC(2026, time.September, 30, 12, 0)

	tests := []struct {
		name             string
		now              time.Time
		files            []backupFileInfo
		retentionDaily   int
		retentionWeekly  int
		retentionMonthly int
		wantRemove       []string
	}{
		{
			name: "同日多份只留最新",
			now:  now,
			files: []backupFileInfo{
				{Name: "sep30_0900.zip", ModTime: atUTC(2026, time.September, 30, 9, 0)},
				{Name: "sep30_1000.zip", ModTime: atUTC(2026, time.September, 30, 10, 0)},
			},
			retentionDaily: 7, retentionWeekly: 4, retentionMonthly: 12,
			wantRemove: []string{"sep30_0900.zip"},
		},
		{
			name: "正常清理：只留最近 3 天，其余被删除",
			now:  now,
			files: []backupFileInfo{
				{Name: "sep30_1000.zip", ModTime: atUTC(2026, time.September, 30, 10, 0)},
				{Name: "sep29_1000.zip", ModTime: atUTC(2026, time.September, 29, 10, 0)},
				{Name: "sep28_1000.zip", ModTime: atUTC(2026, time.September, 28, 10, 0)},
				{Name: "sep27_1000.zip", ModTime: atUTC(2026, time.September, 27, 10, 0)},
			},
			retentionDaily: 3, retentionWeekly: 1, retentionMonthly: 1,
			wantRemove: []string{"sep27_1000.zip"},
		},
		{
			name: "历史不足时按周桶全部保留",
			now:  now,
			files: []backupFileInfo{
				{Name: "sep30_1000.zip", ModTime: atUTC(2026, time.September, 30, 10, 0)},
				{Name: "sep23_1000.zip", ModTime: atUTC(2026, time.September, 23, 10, 0)},
				{Name: "sep16_1000.zip", ModTime: atUTC(2026, time.September, 16, 10, 0)},
				{Name: "sep09_1000.zip", ModTime: atUTC(2026, time.September, 9, 10, 0)},
			},
			retentionDaily: 7, retentionWeekly: 4, retentionMonthly: 12,
			wantRemove: nil,
		},
		{
			name: "最后一份永不删除",
			now:  atUTC(2027, time.March, 15, 12, 0),
			files: []backupFileInfo{
				{Name: "sep30_1000.zip", ModTime: atUTC(2026, time.September, 30, 10, 0)},
			},
			retentionDaily: 7, retentionWeekly: 4, retentionMonthly: 12,
			wantRemove: nil,
		},
		{
			name: "月桶只留最近 3 个月各一份",
			now:  atUTC(2026, time.September, 15, 12, 0),
			files: []backupFileInfo{
				{Name: "sep10.zip", ModTime: atUTC(2026, time.September, 10, 2, 0)},
				{Name: "aug10.zip", ModTime: atUTC(2026, time.August, 10, 2, 0)},
				{Name: "jul10.zip", ModTime: atUTC(2026, time.July, 10, 2, 0)},
				{Name: "jun10.zip", ModTime: atUTC(2026, time.June, 10, 2, 0)},
				{Name: "may10.zip", ModTime: atUTC(2026, time.May, 10, 2, 0)},
			},
			retentionDaily: 1, retentionWeekly: 1, retentionMonthly: 3,
			wantRemove: []string{"jun10.zip", "may10.zip"},
		},
		{
			name: "保留数量小于 1 时按 1 处理",
			now:  now,
			files: []backupFileInfo{
				{Name: "sep30_0900.zip", ModTime: atUTC(2026, time.September, 30, 9, 0)},
				{Name: "sep30_1000.zip", ModTime: atUTC(2026, time.September, 30, 10, 0)},
			},
			retentionDaily: 0, retentionWeekly: 0, retentionMonthly: 0,
			wantRemove: []string{"sep30_0900.zip"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := planScheduledBackupCleanup(test.files, test.now, test.retentionDaily, test.retentionWeekly, test.retentionMonthly)
			require.ElementsMatch(t, test.wantRemove, got)
		})
	}
}

func TestWithinDailyBackupWindow(t *testing.T) {
	tests := []struct {
		name     string
		now      string
		schedule string
		want     bool
	}{
		{name: "同窗口命中", now: "02:03", schedule: "02:00", want: true},
		{name: "整点命中", now: "02:00", schedule: "02:00", want: true},
		{name: "窗口后错过", now: "02:07", schedule: "02:00", want: false},
		{name: "窗口前未到", now: "01:58", schedule: "02:00", want: false},
		{name: "非整点配置命中", now: "23:55", schedule: "23:59", want: true},
		{name: "零点配置命中", now: "00:00", schedule: "00:00", want: true},
		{name: "非法配置不命中", now: "12:00", schedule: "25:00", want: false},
		{name: "空配置不命中", now: "12:00", schedule: "", want: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			minutes, ok := parseDailyBackupTime(test.now)
			require.True(t, ok)
			now := time.Date(2026, time.September, 30, minutes/60, minutes%60, 0, 0, time.Local)
			require.Equal(t, test.want, withinDailyBackupWindow(now, test.schedule))
		})
	}
}

func TestValidateDailyBackupSettings(t *testing.T) {
	tests := []struct {
		name     string
		mutate   func(*dailyBackupSettings)
		wantFail bool
	}{
		{name: "默认配置合法", mutate: func(*dailyBackupSettings) {}, wantFail: false},
		{name: "启用时目录必填", mutate: func(s *dailyBackupSettings) { s.Enabled = true; s.Dir = "" }, wantFail: true},
		{name: "目录必须绝对路径", mutate: func(s *dailyBackupSettings) { s.Enabled = true; s.Dir = "relative/backups" }, wantFail: true},
		{name: "绝对路径合法", mutate: func(s *dailyBackupSettings) { s.Dir = filepath.Join(os.TempDir(), "pulse-backups") }, wantFail: false},
		{name: "时间格式非法", mutate: func(s *dailyBackupSettings) { s.Time = "2:00" }, wantFail: true},
		{name: "小时越界", mutate: func(s *dailyBackupSettings) { s.Time = "24:00" }, wantFail: true},
		{name: "分钟越界", mutate: func(s *dailyBackupSettings) { s.Time = "02:60" }, wantFail: true},
		{name: "每日保留下界", mutate: func(s *dailyBackupSettings) { s.RetentionDaily = 0 }, wantFail: true},
		{name: "每周保留上界", mutate: func(s *dailyBackupSettings) { s.RetentionWeekly = 53 }, wantFail: true},
		{name: "每月保留合法边界", mutate: func(s *dailyBackupSettings) { s.RetentionMonthly = 52 }, wantFail: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			settings := defaultDailyBackupSettings()
			test.mutate(&settings)
			err := validateDailyBackupSettings(settings)
			if test.wantFail {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestDailyBackupSettingsRoundtrip(t *testing.T) {
	app, err := pbTests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	hub := NewHub(app)
	defer app.Cleanup()

	settings := hub.loadDailyBackupSettings()
	require.Equal(t, defaultDailyBackupSettings(), settings)

	dir := t.TempDir()
	settings.Enabled = true
	settings.Time = "03:30"
	settings.Dir = dir
	settings.RetentionDaily = 5
	settings.RetentionWeekly = 6
	settings.RetentionMonthly = 7
	require.NoError(t, validateDailyBackupSettings(settings))
	require.NoError(t, hub.saveDailyBackupSettings(settings))

	loaded := hub.loadDailyBackupSettings()
	require.Equal(t, settings, loaded)

	status := dailyBackupStatus{LastRunDate: "20260930", LastError: "未配置备份目录"}
	require.NoError(t, hub.saveDailyBackupStatus(status))
	require.Equal(t, status, hub.loadDailyBackupStatus())
}

func TestDailyBackupFailureRecordsStatusAndAlerts(t *testing.T) {
	app, err := pbTests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	hub := NewHub(app)
	defer app.Cleanup()

	users, err := app.FindCachedCollectionByNameOrId("users")
	require.NoError(t, err)
	admin := core.NewRecord(users)
	admin.Set("email", "backup-admin@example.com")
	admin.Set("password", "password123")
	admin.Set("role", "admin")
	admin.Set("verified", true)
	require.NoError(t, app.Save(admin))

	settings := defaultDailyBackupSettings()
	settings.Dir = "" // 配置错误：目录为空

	require.Error(t, hub.runScheduledBackup(context.Background(), settings))

	status := hub.loadDailyBackupStatus()
	require.Equal(t, time.Now().Format("20060102"), status.LastRunDate)
	require.NotEmpty(t, status.LastAttempt)
	require.Equal(t, "未配置备份目录", status.LastError)
	require.Empty(t, status.LastSuccess)

	findAlerts := func() []*core.Record {
		records, err := app.FindRecordsByFilter("alerts_history", "alert_id = {:id}", "", -1, 0, map[string]any{"id": dailyBackupAlertID})
		require.NoError(t, err)
		return records
	}

	alerts := findAlerts()
	require.Len(t, alerts, 1)
	require.Equal(t, admin.Id, alerts[0].GetString("user"))
	require.Empty(t, alerts[0].GetString("system")) // 备份告警不关联系统
	require.Equal(t, dailyBackupAlertFailedName, alerts[0].GetString("name"))
	require.Empty(t, alerts[0].GetString("resolved"))

	// 再次失败不重复创建告警
	require.Error(t, hub.runScheduledBackup(context.Background(), settings))
	require.Len(t, findAlerts(), 1)

	// 成功后告警转为已恢复命名
	hub.resolveDailyBackupAlerts()
	alerts = findAlerts()
	require.Len(t, alerts, 1)
	require.Equal(t, dailyBackupAlertOkName, alerts[0].GetString("name"))
	require.NotEmpty(t, alerts[0].GetString("resolved"))
}
