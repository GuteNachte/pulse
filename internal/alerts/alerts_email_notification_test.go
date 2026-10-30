//go:build testing

package alerts_test

import (
	"fmt"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/alerts"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

// notificationRecorder 记录所有经 sendShoutrrr 发出的请求。webhook 与邮件共用同一个
// sender stub，用 URL 前缀区分通道：webhook 是 generic+http://pulse.test，邮件是 smtp://。
type notificationRecorder struct {
	mu      sync.Mutex
	urls    []string
	bodies  []string
	errFunc func(url string, message string) error
}

func newNotificationRecorder(t *testing.T) *notificationRecorder {
	t.Helper()

	recorder := &notificationRecorder{}
	alerts.SetShoutrrrSenderForTest(func(url string, message string) error {
		recorder.mu.Lock()
		err := recorder.errFunc
		recorder.urls = append(recorder.urls, url)
		recorder.bodies = append(recorder.bodies, message)
		recorder.mu.Unlock()
		if err != nil {
			return err(url, message)
		}
		return nil
	})
	t.Cleanup(func() { alerts.SetShoutrrrSenderForTest(nil) })
	return recorder
}

func (r *notificationRecorder) setErrFunc(fn func(url string, message string) error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.errFunc = fn
}

func (r *notificationRecorder) all() ([]string, []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.urls...), append([]string(nil), r.bodies...)
}

func (r *notificationRecorder) smtpURLs() []string {
	urls, _ := r.all()
	var smtpURLs []string
	for _, url := range urls {
		if strings.HasPrefix(url, "smtp://") {
			smtpURLs = append(smtpURLs, url)
		}
	}
	return smtpURLs
}

func (r *notificationRecorder) webhookCount() int {
	urls, _ := r.all()
	count := 0
	for _, url := range urls {
		if strings.HasPrefix(url, "generic+") {
			count++
		}
	}
	return count
}

func setUserEmailConfig(t *testing.T, hub core.App, userID string, webhooks []string, email map[string]any) {
	t.Helper()

	userSettings, err := hub.FindFirstRecordByFilter("user_settings", "user={:user}", map[string]any{"user": userID})
	if err != nil {
		userSettings, err = pulseTests.CreateRecord(hub, "user_settings", map[string]any{"user": userID})
		require.NoError(t, err)
	}
	settings := map[string]any{"webhooks": webhooks}
	if email != nil {
		settings["email"] = email
	}
	userSettings.Set("settings", settings)
	require.NoError(t, hub.Save(userSettings))
}

func completeEmailConfig() map[string]any {
	return map[string]any{
		"host":       "smtp.qq.com",
		"port":       465,
		"username":   "user@qq.com",
		"password":   "auth-code-secret",
		"from":       "user@qq.com",
		"to":         "admin@example.com",
		"encryption": "auto",
	}
}

func TestImportantAlertSendsEmailWhileResourceAlertDoesNot(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	webhookURL := "generic+http://pulse.test/webhook"
	setUserEmailConfig(t, hub, user.Id, []string{webhookURL}, completeEmailConfig())

	recorder := newNotificationRecorder(t)

	// 资源阈值类告警（Important=false）：只走 webhook，不发邮件。
	require.NoError(t, hub.GetAlertManager().SendAlert(alerts.AlertMessageData{
		UserID:   user.Id,
		Title:    "test-system CPU above threshold",
		Message:  "CPU averaged 92.00% for the previous 5 minutes.",
		Link:     "http://localhost/system/abc",
		LinkText: "View test-system",
	}))
	assert.Zero(t, len(recorder.smtpURLs()), "resource threshold alerts must not send email")
	assert.Equal(t, 1, recorder.webhookCount())

	// 重要告警（Important=true）：webhook 与邮件都发送，主题走 URL 的 subject 参数。
	title := "SMART failure on nas: sda"
	message := "Disk sda SMART status changed to FAILED"
	require.NoError(t, hub.GetAlertManager().SendAlert(alerts.AlertMessageData{
		UserID:    user.Id,
		Title:     title,
		Message:   message,
		Link:      "http://localhost/system/abc",
		LinkText:  "View test-system",
		Important: true,
	}))
	smtpURLs := recorder.smtpURLs()
	require.Len(t, smtpURLs, 1, "important alert should send exactly one email")
	parsed, err := url.Parse(smtpURLs[0])
	require.NoError(t, err)
	assert.Equal(t, "smtp.qq.com", parsed.Hostname())
	assert.Equal(t, "465", parsed.Port())
	assert.Equal(t, title, parsed.Query().Get("subject"))
	assert.Equal(t, "Auto", parsed.Query().Get("encryption"))
	_, bodies := recorder.all()
	require.NotEmpty(t, bodies)
	assert.Contains(t, bodies[len(bodies)-1], message)

	// 恢复通知（Resolved=true）同样按分级发送邮件。
	require.NoError(t, hub.GetAlertManager().SendAlert(alerts.AlertMessageData{
		UserID:    user.Id,
		Title:     "SMART ok on nas: sda",
		Message:   "Disk sda SMART status recovered",
		Link:      "http://localhost/system/abc",
		LinkText:  "View test-system",
		Resolved:  true,
		Important: true,
	}))
	assert.Len(t, recorder.smtpURLs(), 2, "resolved important alerts should send email too")
}

func TestIncompleteEmailConfigSkipsEmailWithoutError(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	webhookURL := "generic+http://pulse.test/webhook"
	// host 为空（未配置完整）：Important 告警只跳过邮件，不报错、不留失败痕。
	setUserEmailConfig(t, hub, user.Id, []string{webhookURL}, map[string]any{
		"host": "",
		"to":   "admin@example.com",
	})

	recorder := newNotificationRecorder(t)

	require.NoError(t, hub.GetAlertManager().SendAlert(alerts.AlertMessageData{
		UserID:    user.Id,
		AlertID:   "smart:abc",
		Title:     "SMART failure on nas: sda",
		Message:   "Disk sda SMART status changed to FAILED",
		Link:      "http://localhost/system/abc",
		LinkText:  "View test-system",
		Important: true,
	}))
	assert.Zero(t, len(recorder.smtpURLs()), "important alert with incomplete email config should skip email")
	assert.Equal(t, 1, recorder.webhookCount(), "webhook delivery should be unaffected")

	failures, err := hub.FindAllRecords("notification_failures")
	require.NoError(t, err)
	assert.Empty(t, failures, "skipped email must not be recorded as a failure")

	// 未配置 email 字段的旧配置同样只跳过。
	setUserEmailConfig(t, hub, user.Id, []string{webhookURL}, nil)
	require.NoError(t, hub.GetAlertManager().SendAlert(alerts.AlertMessageData{
		UserID:    user.Id,
		Title:     "Connection to nas is down",
		Message:   "Connection to nas is down",
		Link:      "http://localhost/system/abc",
		LinkText:  "View test-system",
		Important: true,
	}))
	assert.Zero(t, len(recorder.smtpURLs()))
}

func TestEmailFailureRecordedAndCleared(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	setUserEmailConfig(t, hub, user.Id, nil, completeEmailConfig())

	recorder := newNotificationRecorder(t)
	// 模拟 shoutrrr 真实报错：错误文本里会回显完整邮件 URL（含授权码）。
	recorder.setErrFunc(func(mailURL string, _ string) error {
		return fmt.Errorf("sending message via service at %q: dial timeout", mailURL)
	})

	data := alerts.AlertMessageData{
		UserID:    user.Id,
		Title:     "每日自动备份失败",
		Message:   "创建备份失败: disk full",
		Link:      "http://localhost/alerts",
		LinkText:  "查看告警",
		Important: true,
	}
	err := hub.GetAlertManager().SendAlert(data)
	require.Error(t, err, "email send failure should surface to the caller")

	failures, err := hub.FindAllRecords("notification_failures")
	require.NoError(t, err)
	require.Len(t, failures, 1)
	assert.Equal(t, "smtp://smtp.qq.com:465", failures[0].GetString("target"))
	assert.Equal(t, "每日自动备份失败", failures[0].GetString("title"))
	assert.Contains(t, failures[0].GetString("error"), "dial timeout")
	assert.Contains(t, failures[0].GetString("error"), "smtp://***@", "recorded email errors must be redacted")
	assert.NotContains(t, failures[0].GetString("error"), "auth-code-secret")

	recorder.setErrFunc(nil)
	require.NoError(t, hub.GetAlertManager().SendAlert(data))

	failures, err = hub.FindAllRecords("notification_failures")
	require.NoError(t, err)
	assert.Empty(t, failures, "successful email send should clear the failure record")
}
