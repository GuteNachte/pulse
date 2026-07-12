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
