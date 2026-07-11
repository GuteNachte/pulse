//go:build testing

package hub

import "testing"

func TestCoreOperationalModulesAreRequired(t *testing.T) {
	for _, id := range []string{"alerts", "notifications", "agent-management", "maintenance"} {
		policy, ok := pulseModulePolicies[id]
		if !ok {
			t.Fatalf("missing module policy for %q", id)
		}
		if !policy.Required {
			t.Fatalf("module %q must be required", id)
		}
	}
}
