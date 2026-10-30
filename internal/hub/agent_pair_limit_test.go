//go:build testing

package hub_test

import (
	"net/http"
	"strings"
	"testing"

	pulseTests "gutenacht.site/pulse/internal/tests"
)

// TestPairAgentRateLimit verifies the public pairing endpoint throttles
// brute-force attempts per source IP while leaving other sources untouched.
func TestPairAgentRateLimit(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	_ = user

	doPair := func(ip string) int {
		res := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/pulse/agent-pair",
			strings.NewReader(`{"code":"000000","hostname":"probe","fingerprint":"probe-fp"}`),
			map[string]string{"X-Forwarded-For": ip, "Content-Type": "application/json"})
		return res.Status
	}

	const attemptsUntilLock = 20
	for i := 1; i <= attemptsUntilLock; i++ {
		if code := doPair("192.168.9.100"); code == http.StatusTooManyRequests {
			t.Fatalf("request %d locked earlier than expected", i)
		}
	}
	// the failing attempt that reaches the threshold locks the key; the next
	// request from the same IP gets 429 without hitting the handler
	if code := doPair("192.168.9.100"); code != http.StatusTooManyRequests {
		t.Fatalf("attempt after %d failures should be limited with 429, got %d", attemptsUntilLock, code)
	}
	if code := doPair("192.168.9.101"); code == http.StatusTooManyRequests {
		t.Fatalf("a different source IP must not be locked by another IP's failures")
	}
}
