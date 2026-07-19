//go:build testing

package hub

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestDetectPublicInternetAddressesSeparatesIPv4AndIPv6(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ipv4":
			_, _ = w.Write([]byte("203.0.113.10\n"))
		case "/ipv6":
			_, _ = w.Write([]byte("2001:db8::10\n"))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	result := detectPublicInternetAddresses(context.Background(), server.Client(), server.URL+"/ipv4", server.URL+"/ipv6")
	require.Equal(t, "203.0.113.10", result.IPv4)
	require.Equal(t, "2001:db8::10", result.IPv6)
	require.Empty(t, result.IPv4Error)
	require.Empty(t, result.IPv6Error)
}

func TestApplyDetectedInternetAddressesReplacesLegacyManualValue(t *testing.T) {
	metadata := map[string]any{
		"public_ipv4":                      "198.51.100.8",
		"public_ipv4_source":               "manual",
		"public_ipv4_candidate":            "192.0.2.9",
		"public_ipv4_candidate_checked_at": "2026-07-18T00:00:00Z",
		"public_ipv6":                      "2001:db8::8",
	}
	result := publicInternetAddresses{
		IPv4:      "203.0.113.10",
		IPv6Error: "检测服务不可达",
	}

	changed := applyDetectedInternetAddresses(metadata, result, "2026-07-19T00:00:00Z")

	require.Equal(t, []string{"public_ipv4"}, changed)
	require.Equal(t, "203.0.113.10", metadata["public_ipv4"])
	require.NotContains(t, metadata, "public_ipv4_candidate")
	require.NotContains(t, metadata, "public_ipv4_candidate_checked_at")
	require.NotContains(t, metadata, "public_ipv4_source")
	require.Equal(t, "2001:db8::8", metadata["public_ipv6"])
	require.Equal(t, "检测服务不可达", metadata["public_ipv6_error"])
}

func TestApplyDetectedInternetAddressesRecordsOnlyRealAddressChanges(t *testing.T) {
	metadata := map[string]any{
		"public_ipv4": "198.51.100.8",
		"public_ipv6": "2001:db8::10",
	}

	changed := applyDetectedInternetAddresses(metadata, publicInternetAddresses{
		IPv4: "203.0.113.10",
		IPv6: "2001:db8::10",
	}, "2026-07-19T00:00:00Z")

	require.Equal(t, []string{"public_ipv4"}, changed)
	require.Equal(t, "203.0.113.10", metadata["public_ipv4"])
	require.NotContains(t, metadata, "public_ipv4_source")
	require.NotContains(t, metadata, "public_ipv6_source")
}

func TestInternetAddressScheduleTargetsOnlyActiveInternetAssets(t *testing.T) {
	require.Equal(t, "*/15 * * * *", internetAddressRefreshSchedule)
	require.Equal(t, "type = 'internet' && status = 'active'", activeInternetAssetFilter)
}

func TestInternetAddressAutoRefreshSettingsAndDueTime(t *testing.T) {
	checkedAt := time.Date(2026, time.July, 19, 0, 17, 0, 0, time.UTC)
	metadata := map[string]any{
		"public_ip_auto_refresh":             "yes",
		"public_ip_refresh_interval_minutes": 60,
	}

	applyInternetAddressNextCheck(metadata, "active", checkedAt)
	require.Equal(t, "2026-07-19T01:17:00Z", metadata["public_ip_next_check_at"])
	require.False(t, internetAddressAutoRefreshDue(metadata, checkedAt.Add(59*time.Minute)))
	require.True(t, internetAddressAutoRefreshDue(metadata, checkedAt.Add(60*time.Minute)))

	metadata["public_ip_auto_refresh"] = "no"
	applyInternetAddressNextCheck(metadata, "active", checkedAt)
	require.NotContains(t, metadata, "public_ip_next_check_at")
	require.False(t, internetAddressAutoRefreshDue(metadata, checkedAt.Add(24*time.Hour)))

	for _, minutes := range []int{15, 30, 60, 360, 720, 1440} {
		require.True(t, isAllowedInternetAddressRefreshInterval(minutes))
	}
	require.False(t, isAllowedInternetAddressRefreshInterval(37))
}
