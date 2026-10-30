package utils

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetEnv(t *testing.T) {
	t.Run("unprefixed fallback", func(t *testing.T) {
		clearTestEnv(t)
		t.Setenv("TEST_KEY", "plain-value")

		value, exists := GetEnv("TEST_KEY")

		assert.True(t, exists)
		assert.Equal(t, "plain-value", value)
	})

	t.Run("pulse prefixed value wins", func(t *testing.T) {
		clearTestEnv(t)
		t.Setenv("PULSE_HUB_TEST_KEY", "pulse-value")
		t.Setenv("TEST_KEY", "plain-value")

		value, exists := GetEnv("TEST_KEY")

		assert.True(t, exists)
		assert.Equal(t, "pulse-value", value)
	})
}

func clearTestEnv(t *testing.T) {
	t.Helper()

	previous := map[string]string{}
	for _, key := range []string{"PULSE_HUB_TEST_KEY", "TEST_KEY"} {
		if value, ok := os.LookupEnv(key); ok {
			previous[key] = value
		}
		requireNoError(t, os.Unsetenv(key))
	}

	t.Cleanup(func() {
		for _, key := range []string{"PULSE_HUB_TEST_KEY", "TEST_KEY"} {
			if value, ok := previous[key]; ok {
				_ = os.Setenv(key, value)
			} else {
				_ = os.Unsetenv(key)
			}
		}
	})
}

func requireNoError(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
