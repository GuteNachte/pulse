//go:build testing

package alerts

import (
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/common"
)

func TestBuildEmailShoutrrrURL(t *testing.T) {
	settings := &UserEmailSettings{
		Host:     "smtp.qq.com",
		Port:     465,
		Username: "user@qq.com",
		Password: `p@ss:w0rd/12&=+?#`,
		From:     "user@qq.com",
		To:       "admin@example.com",
	}
	mailURL, err := buildEmailShoutrrrURL(settings, "SMART 硬盘异常")
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(mailURL, "smtp://"), "mail URL should use the smtp scheme: %s", mailURL)

	parsed, err := url.Parse(mailURL)
	require.NoError(t, err)
	assert.Equal(t, "smtp", parsed.Scheme)
	assert.Equal(t, "smtp.qq.com", parsed.Hostname())
	assert.Equal(t, "465", parsed.Port())
	assert.Equal(t, "user@qq.com", parsed.User.Username())
	password, ok := parsed.User.Password()
	require.True(t, ok, "mail URL should carry the password")
	assert.Equal(t, `p@ss:w0rd/12&=+?#`, password, "special characters in the password should survive the URL round-trip")

	query := parsed.Query()
	assert.Equal(t, "user@qq.com", query.Get("fromaddress"))
	assert.Equal(t, "admin@example.com", query.Get("toaddresses"))
	assert.Equal(t, "SMART 硬盘异常", query.Get("subject"))
	assert.Equal(t, "Auto", query.Get("encryption"))
}

func TestBuildEmailShoutrrrURLOmitsPortWhenUnset(t *testing.T) {
	mailURL, err := buildEmailShoutrrrURL(&UserEmailSettings{
		Host: "smtp.example.com",
		From: "sender@example.com",
		To:   "receiver@example.com",
	}, "标题")
	require.NoError(t, err)

	parsed, err := url.Parse(mailURL)
	require.NoError(t, err)
	assert.Equal(t, "smtp.example.com", parsed.Hostname())
	assert.Empty(t, parsed.Port(), "port 0 means auto and must not be written into the URL")
}

func TestBuildEmailShoutrrrURLRedactsPassword(t *testing.T) {
	const password = "super-secret-auth-code"
	mailURL, err := buildEmailShoutrrrURL(&UserEmailSettings{
		Host:     "smtp.qq.com",
		Port:     587,
		Username: "user@qq.com",
		Password: password,
		From:     "user@qq.com",
		To:       "admin@example.com",
	}, "测试告警")
	require.NoError(t, err)

	redacted := common.RedactSensitiveText("sending message via service at " + mailURL + " failed")
	assert.NotContains(t, redacted, password, "mail URL credentials must be redacted before logging or recording")
	assert.Contains(t, redacted, "smtp://***@")
}

func TestBuildEmailShoutrrrURLRequiresHostFromAndTo(t *testing.T) {
	cases := map[string]*UserEmailSettings{
		"nil settings": nil,
		"no host":      {From: "sender@example.com", To: "receiver@example.com"},
		"no from":      {Host: "smtp.example.com", To: "receiver@example.com"},
		"no to":        {Host: "smtp.example.com", From: "sender@example.com"},
	}
	for name, settings := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := buildEmailShoutrrrURL(settings, "标题")
			assert.Error(t, err)
		})
	}
}

func TestEmailConfigured(t *testing.T) {
	assert.False(t, emailConfigured(nil))
	assert.False(t, emailConfigured(&UserEmailSettings{Host: "smtp.example.com"}))
	assert.False(t, emailConfigured(&UserEmailSettings{To: "receiver@example.com"}))
	assert.True(t, emailConfigured(&UserEmailSettings{
		Host: "smtp.example.com",
		To:   "receiver@example.com",
	}))
}

func TestEmailNotificationTarget(t *testing.T) {
	assert.Equal(t, "email", emailNotificationTarget(&UserEmailSettings{}))
	assert.Equal(t, "smtp://smtp.qq.com", emailNotificationTarget(&UserEmailSettings{Host: "smtp.qq.com"}))
	assert.Equal(t, "smtp://smtp.qq.com:465", emailNotificationTarget(&UserEmailSettings{Host: "smtp.qq.com", Port: 465}))
}
