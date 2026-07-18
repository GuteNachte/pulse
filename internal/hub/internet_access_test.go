//go:build testing

package hub

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

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

func TestApplyDetectedInternetAddressesPreservesManualValueAsCandidate(t *testing.T) {
	metadata := map[string]any{
		"public_ipv4":        "198.51.100.8",
		"public_ipv4_source": "manual",
		"public_ipv6":        "2001:db8::8",
	}
	result := publicInternetAddresses{
		IPv4:      "203.0.113.10",
		IPv6Error: "检测服务不可达",
	}

	changed := applyDetectedInternetAddresses(metadata, result, "2026-07-19T00:00:00Z")

	require.Empty(t, changed)
	require.Equal(t, "198.51.100.8", metadata["public_ipv4"])
	require.Equal(t, "203.0.113.10", metadata["public_ipv4_candidate"])
	require.Equal(t, "manual", metadata["public_ipv4_source"])
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
	require.Equal(t, "dynamic", metadata["public_ipv4_source"])
	require.Equal(t, "dynamic", metadata["public_ipv6_source"])
}

func TestInternetAddressScheduleTargetsOnlyActiveInternetAssets(t *testing.T) {
	require.Equal(t, "*/30 * * * *", internetAddressRefreshSchedule)
	require.Equal(t, "type = 'internet' && status = 'active'", activeInternetAssetFilter)
}
