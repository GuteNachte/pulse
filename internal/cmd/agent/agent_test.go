package main

import (
	"os"
	"testing"

	"github.com/spf13/pflag"
	"github.com/stretchr/testify/assert"
)

func TestParseFlagsWebSocketOnly(t *testing.T) {
	oldArgs := os.Args
	defer func() {
		os.Args = oldArgs
		pflag.CommandLine = pflag.NewFlagSet(os.Args[0], pflag.ExitOnError)
	}()

	tests := []struct {
		name     string
		args     []string
		expected cmdOptions
	}{
		{
			name: "no flags",
			args: []string{"cmd"},
		},
		{
			name: "url and token flags",
			args: []string{"cmd", "--url", "http://127.0.0.1:8090", "--token", "test-token"},
			expected: cmdOptions{
				hubURL: "http://127.0.0.1:8090",
				token:  "test-token",
			},
		},
		{
			name: "legacy single dash url and token flags",
			args: []string{"cmd", "-url", "http://127.0.0.1:8090", "-token", "test-token"},
			expected: cmdOptions{
				hubURL: "http://127.0.0.1:8090",
				token:  "test-token",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pflag.CommandLine = pflag.NewFlagSet(tt.args[0], pflag.ExitOnError)
			os.Args = tt.args

			var opts cmdOptions
			opts.parse()

			assert.Equal(t, tt.expected, opts)
		})
	}
}
