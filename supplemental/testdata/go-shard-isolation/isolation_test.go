package goshardisolation

import (
	"os"
	"testing"
)

const pollutionKey = "PULSE_GO_SHARD_PROCESS_POLLUTION"

func TestPollutesProcess(t *testing.T) {
	if err := os.Setenv(pollutionKey, "set-by-previous-test"); err != nil {
		t.Fatal(err)
	}
}

func TestRequiresCleanProcess(t *testing.T) {
	if value := os.Getenv(pollutionKey); value != "" {
		t.Fatalf("expected a clean test process, found %s=%q", pollutionKey, value)
	}
}
