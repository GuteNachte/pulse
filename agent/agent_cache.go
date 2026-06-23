package agent

import (
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"gutenacht.site/pulse/internal/entities/system"
)

type systemDataCache struct {
	sync.RWMutex
	cache map[string]*cacheNode
}

type cacheNode struct {
	data       *system.CombinedData
	lastUpdate time.Time
}

// NewSystemDataCache creates a cache keyed by the polling interval in milliseconds.
func NewSystemDataCache() *systemDataCache {
	return &systemDataCache{
		cache: make(map[string]*cacheNode),
	}
}

func cacheKeyForDataOptions(cacheTimeMs uint16, monitoredServices []string) string {
	services := normalizeMonitoredServiceNames(monitoredServices)
	return strings.Join([]string{strconv.FormatUint(uint64(cacheTimeMs), 10), "svc=" + strings.Join(services, ",")}, "|")
}

func cacheKeyForTypedDataOptions(cacheTimeMs uint16, monitoredServices []string, monitoredSoftware []string) string {
	services := normalizeMonitoredServiceNames(monitoredServices)
	software := normalizeMonitoredServiceNames(monitoredSoftware)
	return strings.Join([]string{
		strconv.FormatUint(uint64(cacheTimeMs), 10),
		"svc=" + strings.Join(services, ","),
		"sw=" + strings.Join(software, ","),
	}, "|")
}

func normalizeMonitoredServiceNames(names []string) []string {
	if len(names) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(names))
	normalized := make([]string, 0, len(names))
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, name)
	}
	sort.Strings(normalized)
	return normalized
}

// Get returns cached combined data when the entry is still considered fresh.
func (c *systemDataCache) Get(cacheKey string, cacheTimeMs uint16) (stats *system.CombinedData, isCached bool) {
	c.RLock()
	defer c.RUnlock()

	node, ok := c.cache[cacheKey]
	if !ok {
		return &system.CombinedData{}, false
	}
	// allowedSkew := time.Second
	// isFresh := time.Since(node.lastUpdate) < time.Duration(cacheTimeMs)*time.Millisecond-allowedSkew
	// allow a 50% skew of the cache time
	isFresh := time.Since(node.lastUpdate) < time.Duration(cacheTimeMs/2)*time.Millisecond
	return node.data, isFresh
}

// Set stores the latest combined data snapshot for the given interval.
func (c *systemDataCache) Set(data *system.CombinedData, cacheKey string) {
	c.Lock()
	defer c.Unlock()

	node, ok := c.cache[cacheKey]
	if !ok {
		node = &cacheNode{}
		c.cache[cacheKey] = node
	}
	node.data = data
	node.lastUpdate = time.Now()
}
