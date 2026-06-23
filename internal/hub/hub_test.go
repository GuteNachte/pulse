//go:build testing

package hub_test

import (
	"testing"

	pulseTests "gutenacht.site/pulse/internal/tests"

	"github.com/stretchr/testify/assert"
)

func TestMakeLink(t *testing.T) {
	hub, _ := pulseTests.NewTestHub(t.TempDir())

	tests := []struct {
		name     string
		appURL   string
		parts    []string
		expected string
	}{
		{
			name:     "no parts, no trailing slash in AppURL",
			appURL:   "http://localhost:8090",
			parts:    []string{},
			expected: "http://localhost:8090",
		},
		{
			name:     "no parts, with trailing slash in AppURL",
			appURL:   "http://localhost:8090/",
			parts:    []string{},
			expected: "http://localhost:8090", // TrimSuffix should handle the trailing slash
		},
		{
			name:     "one part",
			appURL:   "http://example.com",
			parts:    []string{"one"},
			expected: "http://example.com/one",
		},
		{
			name:     "multiple parts",
			appURL:   "http://example.com",
			parts:    []string{"alpha", "beta", "gamma"},
			expected: "http://example.com/alpha/beta/gamma",
		},
		{
			name:     "parts with spaces needing escaping",
			appURL:   "http://example.com",
			parts:    []string{"path with spaces", "another part"},
			expected: "http://example.com/path%20with%20spaces/another%20part",
		},
		{
			name:     "parts with slashes needing escaping",
			appURL:   "http://example.com",
			parts:    []string{"a/b", "c"},
			expected: "http://example.com/a%2Fb/c", // url.PathEscape escapes '/'
		},
		{
			name:     "AppURL with subpath, no trailing slash",
			appURL:   "http://localhost/sub",
			parts:    []string{"resource"},
			expected: "http://localhost/sub/resource",
		},
		{
			name:     "AppURL with subpath, with trailing slash",
			appURL:   "http://localhost/sub/",
			parts:    []string{"item"},
			expected: "http://localhost/sub/item",
		},
		{
			name:     "empty parts in the middle",
			appURL:   "http://localhost",
			parts:    []string{"first", "", "third"},
			expected: "http://localhost/first/third",
		},
		{
			name:     "leading and trailing empty parts",
			appURL:   "http://localhost",
			parts:    []string{"", "path", ""},
			expected: "http://localhost/path",
		},
		{
			name:     "parts with various special characters",
			appURL:   "https://test.dev/",
			parts:    []string{"p@th?", "key=value&"},
			expected: "https://test.dev/p@th%3F/key=value&",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Store original app URL and restore it after the test
			originalAppURL := hub.Settings().Meta.AppURL
			hub.Settings().Meta.AppURL = tt.appURL
			defer func() { hub.Settings().Meta.AppURL = originalAppURL }()

			got := hub.MakeLink(tt.parts...)
			assert.Equal(t, tt.expected, got, "MakeLink generated URL does not match expected")
		})
	}
}

func TestAppUrl(t *testing.T) {
	t.Run("no APP_URL does't change app url", func(t *testing.T) {
		hub, _ := pulseTests.NewTestHub(t.TempDir())
		defer hub.Cleanup()

		settings := hub.Settings()
		assert.Equal(t, "http://localhost:8090", settings.Meta.AppURL)
	})
	t.Run("APP_URL changes app url", func(t *testing.T) {
		t.Setenv("APP_URL", "http://example.com/app")
		hub, _ := pulseTests.NewTestHub(t.TempDir())
		defer hub.Cleanup()

		settings := hub.Settings()
		assert.Equal(t, "http://example.com/app", settings.Meta.AppURL)
	})
}
