//go:build testing && windows

package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeWindowsPipePath(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "docker npipe url path",
			input:    "//./pipe/docker_engine",
			expected: `\\.\pipe\docker_engine`,
		},
		{
			name:     "already absolute",
			input:    `\\.\pipe\docker_engine`,
			expected: `\\.\pipe\docker_engine`,
		},
		{
			name:     "relative pipe",
			input:    `pipe\docker_engine`,
			expected: `\\.\pipe\docker_engine`,
		},
		{
			name:     "empty falls back",
			input:    "",
			expected: defaultWindowsDockerPipe,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, normalizeWindowsPipePath(tt.input))
		})
	}
}
