//go:build testing

package hub

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

type moduleContractEntry struct {
	ID           string   `json:"id"`
	Required     bool     `json:"required"`
	Dependencies []string `json:"dependencies"`
}

func TestModulePoliciesMatchSharedContract(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "docs", "module-contract.json"))
	if err != nil {
		t.Fatalf("read shared module contract: %v", err)
	}

	var contract []moduleContractEntry
	if err := json.Unmarshal(data, &contract); err != nil {
		t.Fatalf("decode shared module contract: %v", err)
	}

	actual := make([]moduleContractEntry, 0, len(pulseModulePolicies))
	for _, entry := range contract {
		policy, ok := pulseModulePolicies[entry.ID]
		if !ok {
			t.Fatalf("module %q exists in shared contract but not in Hub policies", entry.ID)
		}
		actual = append(actual, moduleContractEntry{
			ID:           entry.ID,
			Required:     policy.Required,
			Dependencies: normalizeModuleDependencies(policy.Dependencies),
		})
	}

	if len(actual) != len(pulseModulePolicies) {
		t.Fatalf("Hub policies contain %d modules, shared contract contains %d", len(pulseModulePolicies), len(actual))
	}
	if !reflect.DeepEqual(actual, contract) {
		t.Fatalf("Hub module policies differ from shared contract:\nactual=%v\ncontract=%v", actual, contract)
	}
}

func normalizeModuleDependencies(dependencies []string) []string {
	if dependencies == nil {
		return []string{}
	}
	return dependencies
}
