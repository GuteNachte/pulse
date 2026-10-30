//go:build testing

package migrations_test

import (
	"crypto/sha256"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestMigrationsNoDuplicateFiles guards against copy-paste migration accidents:
// two byte-identical migration files mean one intent was never implemented and
// the same change registers twice (seen once in this repo, see PBL-020).
func TestMigrationsNoDuplicateFiles(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatalf("read migrations dir: %v", err)
	}

	hashes := make(map[string]string)
	registers := make(map[string]int)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(".", entry.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", entry.Name(), err)
		}
		sum := sha256.Sum256(raw)
		key := string(sum[:])
		if prev, dup := hashes[key]; dup {
			t.Errorf("migrations %s and %s are byte-identical: one intent was never implemented", prev, entry.Name())
			continue
		}
		hashes[key] = entry.Name()
		registers[entry.Name()] = strings.Count(string(raw), "m.Register(")
	}

	for name, count := range registers {
		if count > 1 {
			t.Errorf("migration %s registers %d migrations in one file; split them so each file is one intent", name, count)
		}
	}
}
