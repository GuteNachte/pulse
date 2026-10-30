//go:build testing

package agent

import (
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/entities/container"
	"gutenacht.site/pulse/internal/entities/system"
)

func createTestCacheData() *system.CombinedData {
	return &system.CombinedData{
		Stats: system.Stats{
			Cpu:       50.5,
			Mem:       8192,
			DiskTotal: 100000,
		},
		Info: system.Info{
			AgentVersion: "0.12.0",
		},
		Containers: []*container.Stats{
			{
				Name: "test-container",
				Cpu:  25.0,
			},
		},
	}
}

func TestNewSystemDataCache(t *testing.T) {
	cache := NewSystemDataCache()
	require.NotNil(t, cache)
	assert.NotNil(t, cache.cache)
	assert.Empty(t, cache.cache)
}

func TestCacheGetSet(t *testing.T) {
	cache := NewSystemDataCache()
	data := createTestCacheData()

	// Test setting data
	cache.Set(data, cacheKeyForDataOptions(1000, nil)) // 1 second cache

	// Test getting fresh data
	retrieved, isCached := cache.Get(cacheKeyForDataOptions(1000, nil), 1000)
	assert.True(t, isCached)
	assert.Equal(t, data, retrieved)

	// Test getting non-existent cache key
	_, isCached = cache.Get(cacheKeyForDataOptions(2000, nil), 2000)
	assert.False(t, isCached)
}

func TestCacheFreshness(t *testing.T) {
	cache := NewSystemDataCache()
	data := createTestCacheData()

	testCases := []struct {
		name        string
		cacheTimeMs uint16
		sleepMs     time.Duration
		expectFresh bool
	}{
		{
			name:        "fresh data - well within cache time",
			cacheTimeMs: 1000, // 1 second
			sleepMs:     100,  // 100ms
			expectFresh: true,
		},
		{
			name:        "fresh data - past 50% of cache time",
			cacheTimeMs: 1000, // 1 second
			sleepMs:     499,  // just under 500ms
			expectFresh: true,
		},
		{
			// 2026-10-22 Agent 2.0 阶段一：60s 主档快照由后台预计算生产，
			// 新鲜度放宽为整窗口——50% 位置仍在窗口内。
			name:        "fresh data - exactly at 50% cache time",
			cacheTimeMs: 1000, // 1 second
			sleepMs:     500,  // exactly 500ms
			expectFresh: true,
		},
		{
			name:        "fresh data - within full cache window",
			cacheTimeMs: 1000, // 1 second
			sleepMs:     800,  // 800ms
			expectFresh: true,
		},
		{
			name:        "stale data - exactly at full cache time",
			cacheTimeMs: 1000, // 1 second
			sleepMs:     1000, // exactly 1000ms
			expectFresh: false,
		},
		{
			name:        "short cache time",
			cacheTimeMs: 200, // 200ms
			sleepMs:     250, // 250ms >= 200ms
			expectFresh: false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				// Set data
				cache.Set(data, cacheKeyForDataOptions(tc.cacheTimeMs, nil))

				// Wait for the specified duration
				if tc.sleepMs > 0 {
					time.Sleep(tc.sleepMs * time.Millisecond)
				}

				// Check freshness
				_, isCached := cache.Get(cacheKeyForDataOptions(tc.cacheTimeMs, nil), tc.cacheTimeMs)
				assert.Equal(t, tc.expectFresh, isCached)
			})
		})
	}
}

func TestCacheMultipleIntervals(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		cache := NewSystemDataCache()
		data1 := createTestCacheData()
		data2 := &system.CombinedData{
			Stats: system.Stats{
				Cpu: 75.0,
				Mem: 16384,
			},
			Info: system.Info{
				AgentVersion: "0.12.0",
			},
			Containers: []*container.Stats{},
		}

		// Set data for different intervals
		cache.Set(data1, cacheKeyForDataOptions(500, nil))  // 500ms cache
		cache.Set(data2, cacheKeyForDataOptions(1000, nil)) // 1000ms cache

		// Both should be fresh immediately
		retrieved1, isCached1 := cache.Get(cacheKeyForDataOptions(500, nil), 500)
		assert.True(t, isCached1)
		assert.Equal(t, data1, retrieved1)

		retrieved2, isCached2 := cache.Get(cacheKeyForDataOptions(1000, nil), 1000)
		assert.True(t, isCached2)
		assert.Equal(t, data2, retrieved2)

		// Wait 300ms - both within their full windows (500ms / 1000ms)
		time.Sleep(300 * time.Millisecond)

		_, isCached1 = cache.Get(cacheKeyForDataOptions(500, nil), 500)
		assert.True(t, isCached1)

		_, isCached2 = cache.Get(cacheKeyForDataOptions(1000, nil), 1000)
		assert.True(t, isCached2)

		// Wait another 300ms (total 600ms) - 500ms cache stale, 1000ms still fresh
		time.Sleep(300 * time.Millisecond)
		_, isCached1 = cache.Get(cacheKeyForDataOptions(500, nil), 500)
		assert.False(t, isCached1)

		_, isCached2 = cache.Get(cacheKeyForDataOptions(1000, nil), 1000)
		assert.True(t, isCached2)

		// Wait another 600ms (total 1200ms) - now 1000ms cache should also be stale
		time.Sleep(600 * time.Millisecond)
		_, isCached2 = cache.Get(cacheKeyForDataOptions(1000, nil), 1000)
		assert.False(t, isCached2)
	})
}

func TestCacheKeyIncludesMonitoredServices(t *testing.T) {
	assert.Equal(t, "60000|svc=Spooler,W32Time", cacheKeyForDataOptions(60000, []string{"W32Time", "Spooler", "Spooler", ""}))
	assert.Equal(t, "60000|svc=", cacheKeyForDataOptions(60000, nil))
	assert.Equal(t, "1000|svc=Spooler", cacheKeyForDataOptions(1000, []string{" Spooler "}))
}

func TestCacheOverwrite(t *testing.T) {
	cache := NewSystemDataCache()
	data1 := createTestCacheData()
	data2 := &system.CombinedData{
		Stats: system.Stats{
			Cpu: 90.0,
			Mem: 32768,
		},
		Info: system.Info{
			AgentVersion: "0.12.0",
		},
		Containers: []*container.Stats{},
	}

	// Set initial data
	cache.Set(data1, cacheKeyForDataOptions(1000, nil))
	retrieved, isCached := cache.Get(cacheKeyForDataOptions(1000, nil), 1000)
	assert.True(t, isCached)
	assert.Equal(t, data1, retrieved)

	// Overwrite with new data
	cache.Set(data2, cacheKeyForDataOptions(1000, nil))
	retrieved, isCached = cache.Get(cacheKeyForDataOptions(1000, nil), 1000)
	assert.True(t, isCached)
	assert.Equal(t, data2, retrieved)
	assert.NotEqual(t, data1, retrieved)
}

func TestCacheMiss(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		cache := NewSystemDataCache()

		// Test getting from empty cache
		_, isCached := cache.Get(cacheKeyForDataOptions(1000, nil), 1000)
		assert.False(t, isCached)

		// Set data for one interval
		data := createTestCacheData()
		cache.Set(data, cacheKeyForDataOptions(1000, nil))

		// Test getting different interval
		_, isCached = cache.Get(cacheKeyForDataOptions(2000, nil), 2000)
		assert.False(t, isCached)

		// Test getting after data has expired
		time.Sleep(1100 * time.Millisecond) // 1100ms >= 1000ms full window
		_, isCached = cache.Get(cacheKeyForDataOptions(1000, nil), 1000)
		assert.False(t, isCached)
	})
}

func TestCacheZeroInterval(t *testing.T) {
	cache := NewSystemDataCache()
	data := createTestCacheData()

	// Set with zero interval - should allow immediate cache
	cache.Set(data, cacheKeyForDataOptions(0, nil))

	// With 0 interval, 50% is 0, so it should never be considered fresh
	// (time.Since(lastUpdate) >= 0, which is not < 0)
	_, isCached := cache.Get(cacheKeyForDataOptions(0, nil), 0)
	assert.False(t, isCached)
}

func TestCacheLargeInterval(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		cache := NewSystemDataCache()
		data := createTestCacheData()

		// Test with maximum uint16 value
		cache.Set(data, cacheKeyForDataOptions(65535, nil)) // ~65 seconds

		// Should be fresh immediately
		_, isCached := cache.Get(cacheKeyForDataOptions(65535, nil), 65535)
		assert.True(t, isCached)

		// Should still be fresh after a short time
		time.Sleep(100 * time.Millisecond)
		_, isCached = cache.Get(cacheKeyForDataOptions(65535, nil), 65535)
		assert.True(t, isCached)
	})
}
