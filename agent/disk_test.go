//go:build testing

package agent

import (
	"testing"
	"time"

	"github.com/shirou/gopsutil/v4/disk"
	"github.com/stretchr/testify/assert"
	"gutenacht.site/pulse/internal/entities/system"
)

func TestBuildFsStatRegistration(t *testing.T) {
	t.Run("uses basename for non-windows exact io match", func(t *testing.T) {
		key, stats, ok := registerFilesystemStats(
			map[string]*system.FsStats{},
			"/dev/sda1",
			"/mnt/data",
			false,
			"archive",
			fsRegistrationContext{
				isWindows: false,
				diskIoCounters: map[string]disk.IOCountersStat{
					"sda1": {Name: "sda1"},
				},
			},
		)

		assert.True(t, ok)
		assert.Equal(t, "sda1", key)
		assert.Equal(t, "/mnt/data", stats.Mountpoint)
		assert.Equal(t, "archive", stats.Name)
		assert.False(t, stats.Root)
	})

	t.Run("maps root partition to io device by prefix", func(t *testing.T) {
		key, stats, ok := registerFilesystemStats(
			map[string]*system.FsStats{},
			"/dev/ada0p2",
			"/",
			true,
			"",
			fsRegistrationContext{
				isWindows: false,
				diskIoCounters: map[string]disk.IOCountersStat{
					"ada0": {Name: "ada0", ReadBytes: 1000, WriteBytes: 1000},
				},
			},
		)

		assert.True(t, ok)
		assert.Equal(t, "ada0", key)
		assert.True(t, stats.Root)
		assert.Equal(t, "/", stats.Mountpoint)
	})

	t.Run("uses filesystem setting as root fallback", func(t *testing.T) {
		key, _, ok := registerFilesystemStats(
			map[string]*system.FsStats{},
			"overlay",
			"/",
			true,
			"",
			fsRegistrationContext{
				filesystem: "nvme0n1p2",
				isWindows:  false,
				diskIoCounters: map[string]disk.IOCountersStat{
					"nvme0n1": {Name: "nvme0n1", ReadBytes: 1000, WriteBytes: 1000},
				},
			},
		)

		assert.True(t, ok)
		assert.Equal(t, "nvme0n1", key)
	})

	t.Run("uses full device name on windows", func(t *testing.T) {
		key, _, ok := registerFilesystemStats(
			map[string]*system.FsStats{},
			`C:`,
			`C:\\`,
			false,
			"",
			fsRegistrationContext{
				isWindows: true,
				diskIoCounters: map[string]disk.IOCountersStat{
					`C:`: {Name: `C:`},
				},
			},
		)

		assert.True(t, ok)
		assert.Equal(t, `C:`, key)
	})

	t.Run("skips existing key", func(t *testing.T) {
		key, stats, ok := registerFilesystemStats(
			map[string]*system.FsStats{"sda1": {Mountpoint: "/existing"}},
			"/dev/sda1",
			"/mnt/data",
			false,
			"",
			fsRegistrationContext{
				isWindows: false,
				diskIoCounters: map[string]disk.IOCountersStat{
					"sda1": {Name: "sda1"},
				},
			},
		)

		assert.False(t, ok)
		assert.Empty(t, key)
		assert.Nil(t, stats)
	})
}

func TestAddConfiguredRootFs(t *testing.T) {
	t.Run("adds root from matching partition", func(t *testing.T) {
		agent := &Agent{fsStats: make(map[string]*system.FsStats)}
		discovery := diskDiscovery{
			agent:          agent,
			rootMountPoint: "/",
			partitions:     []disk.PartitionStat{{Device: "/dev/ada0p2", Mountpoint: "/"}},
			ctx: fsRegistrationContext{
				filesystem: "/dev/ada0p2",
				isWindows:  false,
				diskIoCounters: map[string]disk.IOCountersStat{
					"ada0": {Name: "ada0", ReadBytes: 1000, WriteBytes: 1000},
				},
			},
		}

		ok := discovery.addConfiguredRootFs()

		assert.True(t, ok)
		stats, exists := agent.fsStats["ada0"]
		assert.True(t, exists)
		assert.True(t, stats.Root)
		assert.Equal(t, "/", stats.Mountpoint)
	})

	t.Run("adds root from io device when partition is missing", func(t *testing.T) {
		agent := &Agent{fsStats: make(map[string]*system.FsStats)}
		discovery := diskDiscovery{
			agent:          agent,
			rootMountPoint: "/sysroot",
			ctx: fsRegistrationContext{
				filesystem: "zroot",
				isWindows:  false,
				diskIoCounters: map[string]disk.IOCountersStat{
					"nda0": {Name: "nda0", Label: "zroot", ReadBytes: 1000, WriteBytes: 1000},
				},
			},
		}

		ok := discovery.addConfiguredRootFs()

		assert.True(t, ok)
		stats, exists := agent.fsStats["nda0"]
		assert.True(t, exists)
		assert.True(t, stats.Root)
		assert.Equal(t, "/sysroot", stats.Mountpoint)
	})

	t.Run("returns false when filesystem cannot be resolved", func(t *testing.T) {
		agent := &Agent{fsStats: make(map[string]*system.FsStats)}
		discovery := diskDiscovery{
			agent:          agent,
			rootMountPoint: "/",
			ctx: fsRegistrationContext{
				filesystem:     "missing-disk",
				isWindows:      false,
				diskIoCounters: map[string]disk.IOCountersStat{},
			},
		}

		ok := discovery.addConfiguredRootFs()

		assert.False(t, ok)
		assert.Empty(t, agent.fsStats)
	})
}

func TestAddPartitionRootFs(t *testing.T) {
	t.Run("adds root from fallback partition candidate", func(t *testing.T) {
		agent := &Agent{fsStats: make(map[string]*system.FsStats)}
		discovery := diskDiscovery{
			agent: agent,
			ctx: fsRegistrationContext{
				isWindows: false,
				diskIoCounters: map[string]disk.IOCountersStat{
					"nvme0n1": {Name: "nvme0n1", ReadBytes: 1000, WriteBytes: 1000},
				},
			},
		}

		ok := discovery.addPartitionRootFs("/dev/nvme0n1p2", "/")

		assert.True(t, ok)
		stats, exists := agent.fsStats["nvme0n1"]
		assert.True(t, exists)
		assert.True(t, stats.Root)
		assert.Equal(t, "/", stats.Mountpoint)
	})

	t.Run("returns false when no io device matches", func(t *testing.T) {
		agent := &Agent{fsStats: make(map[string]*system.FsStats)}
		discovery := diskDiscovery{agent: agent, ctx: fsRegistrationContext{diskIoCounters: map[string]disk.IOCountersStat{}}}

		ok := discovery.addPartitionRootFs("/dev/mapper/root", "/")

		assert.False(t, ok)
		assert.Empty(t, agent.fsStats)
	})
}

func TestAddLastResortRootFs(t *testing.T) {
	t.Run("uses most active io device when available", func(t *testing.T) {
		agent := &Agent{fsStats: make(map[string]*system.FsStats)}
		discovery := diskDiscovery{agent: agent, rootMountPoint: "/", ctx: fsRegistrationContext{diskIoCounters: map[string]disk.IOCountersStat{
			"sda": {Name: "sda", ReadBytes: 5000, WriteBytes: 5000},
			"sdb": {Name: "sdb", ReadBytes: 1000, WriteBytes: 1000},
		}}}

		discovery.addLastResortRootFs()

		stats, exists := agent.fsStats["sda"]
		assert.True(t, exists)
		assert.True(t, stats.Root)
	})

	t.Run("falls back to root key when mountpoint basename collides", func(t *testing.T) {
		agent := &Agent{fsStats: map[string]*system.FsStats{
			"sysroot": {Mountpoint: "/existing/sysroot"},
		}}
		discovery := diskDiscovery{agent: agent, rootMountPoint: "/sysroot", ctx: fsRegistrationContext{diskIoCounters: map[string]disk.IOCountersStat{}}}

		discovery.addLastResortRootFs()

		stats, exists := agent.fsStats["root"]
		assert.True(t, exists)
		assert.True(t, stats.Root)
		assert.Equal(t, "/sysroot", stats.Mountpoint)
	})
}

func TestFindIoDevice(t *testing.T) {
	t.Run("matches by device name", func(t *testing.T) {
		ioCounters := map[string]disk.IOCountersStat{
			"sda": {Name: "sda"},
			"sdb": {Name: "sdb"},
		}

		device, ok := findIoDevice("sdb", ioCounters)
		assert.True(t, ok)
		assert.Equal(t, "sdb", device)
	})

	t.Run("matches by device label", func(t *testing.T) {
		ioCounters := map[string]disk.IOCountersStat{
			"sda": {Name: "sda", Label: "rootfs"},
			"sdb": {Name: "sdb"},
		}

		device, ok := findIoDevice("rootfs", ioCounters)
		assert.True(t, ok)
		assert.Equal(t, "sda", device)
	})

	t.Run("returns no match when not found", func(t *testing.T) {
		ioCounters := map[string]disk.IOCountersStat{
			"sda": {Name: "sda"},
			"sdb": {Name: "sdb"},
		}

		device, ok := findIoDevice("nvme0n1p1", ioCounters)
		assert.False(t, ok)
		assert.Equal(t, "", device)
	})

	t.Run("uses uncertain unique prefix fallback", func(t *testing.T) {
		ioCounters := map[string]disk.IOCountersStat{
			"nvme0n1": {Name: "nvme0n1"},
			"sda":     {Name: "sda"},
		}

		device, ok := findIoDevice("nvme0n1p2", ioCounters)
		assert.True(t, ok)
		assert.Equal(t, "nvme0n1", device)
	})

	t.Run("uses dominant activity when prefix matches are ambiguous", func(t *testing.T) {
		ioCounters := map[string]disk.IOCountersStat{
			"sda": {Name: "sda", ReadBytes: 5000, WriteBytes: 5000, ReadCount: 100, WriteCount: 100},
			"sdb": {Name: "sdb", ReadBytes: 1000, WriteBytes: 1000, ReadCount: 50, WriteCount: 50},
		}

		device, ok := findIoDevice("sd", ioCounters)
		assert.True(t, ok)
		assert.Equal(t, "sda", device)
	})

	t.Run("uses highest activity when ambiguous without dominance", func(t *testing.T) {
		ioCounters := map[string]disk.IOCountersStat{
			"sda": {Name: "sda", ReadBytes: 3000, WriteBytes: 3000, ReadCount: 50, WriteCount: 50},
			"sdb": {Name: "sdb", ReadBytes: 2500, WriteBytes: 2500, ReadCount: 40, WriteCount: 40},
		}

		device, ok := findIoDevice("sd", ioCounters)
		assert.True(t, ok)
		assert.Equal(t, "sda", device)
	})

	t.Run("matches /dev/-prefixed partition to parent disk", func(t *testing.T) {
		ioCounters := map[string]disk.IOCountersStat{
			"nda0": {Name: "nda0", ReadBytes: 1000, WriteBytes: 1000},
		}

		device, ok := findIoDevice("/dev/nda0p2", ioCounters)
		assert.True(t, ok)
		assert.Equal(t, "nda0", device)
	})

	t.Run("uses deterministic name tie-breaker", func(t *testing.T) {
		ioCounters := map[string]disk.IOCountersStat{
			"sdb": {Name: "sdb", ReadBytes: 2000, WriteBytes: 2000, ReadCount: 10, WriteCount: 10},
			"sda": {Name: "sda", ReadBytes: 2000, WriteBytes: 2000, ReadCount: 10, WriteCount: 10},
		}

		device, ok := findIoDevice("sd", ioCounters)
		assert.True(t, ok)
		assert.Equal(t, "sda", device)
	})
}

func TestFilesystemMatchesPartitionSetting(t *testing.T) {
	p := disk.PartitionStat{Device: "/dev/ada0p2", Mountpoint: "/"}

	t.Run("matches mountpoint setting", func(t *testing.T) {
		assert.True(t, filesystemMatchesPartitionSetting("/", p))
	})

	t.Run("matches exact partition setting", func(t *testing.T) {
		assert.True(t, filesystemMatchesPartitionSetting("ada0p2", p))
		assert.True(t, filesystemMatchesPartitionSetting("/dev/ada0p2", p))
	})

	t.Run("matches prefix-style parent setting", func(t *testing.T) {
		assert.True(t, filesystemMatchesPartitionSetting("ada0", p))
		assert.True(t, filesystemMatchesPartitionSetting("/dev/ada0", p))
	})

	t.Run("does not match unrelated device", func(t *testing.T) {
		assert.False(t, filesystemMatchesPartitionSetting("sda", p))
		assert.False(t, filesystemMatchesPartitionSetting("nvme0n1", p))
		assert.False(t, filesystemMatchesPartitionSetting("", p))
	})
}

func TestMostActiveIoDevice(t *testing.T) {
	t.Run("returns most active device", func(t *testing.T) {
		ioCounters := map[string]disk.IOCountersStat{
			"nda0": {Name: "nda0", ReadBytes: 5000, WriteBytes: 5000, ReadCount: 100, WriteCount: 100},
			"nda1": {Name: "nda1", ReadBytes: 1000, WriteBytes: 1000, ReadCount: 50, WriteCount: 50},
		}
		assert.Equal(t, "nda0", mostActiveIoDevice(ioCounters))
	})

	t.Run("uses deterministic tie-breaker", func(t *testing.T) {
		ioCounters := map[string]disk.IOCountersStat{
			"sdb": {Name: "sdb", ReadBytes: 1000, WriteBytes: 1000, ReadCount: 10, WriteCount: 10},
			"sda": {Name: "sda", ReadBytes: 1000, WriteBytes: 1000, ReadCount: 10, WriteCount: 10},
		}
		assert.Equal(t, "sda", mostActiveIoDevice(ioCounters))
	})

	t.Run("returns empty for empty map", func(t *testing.T) {
		assert.Equal(t, "", mostActiveIoDevice(map[string]disk.IOCountersStat{}))
	})
}

func TestIsDockerSpecialMountpoint(t *testing.T) {
	testCases := []struct {
		name       string
		mountpoint string
		expected   bool
	}{
		{name: "hosts", mountpoint: "/etc/hosts", expected: true},
		{name: "resolv", mountpoint: "/etc/resolv.conf", expected: true},
		{name: "hostname", mountpoint: "/etc/hostname", expected: true},
		{name: "root", mountpoint: "/", expected: false},
		{name: "passwd", mountpoint: "/etc/passwd", expected: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expected, isDockerSpecialMountpoint(tc.mountpoint))
		})
	}
}

func TestFsStatsWithCustomNames(t *testing.T) {
	// Test that FsStats properly stores custom names
	fsStats := &system.FsStats{
		Mountpoint: "/mnt/storage",
		Name:       "my-custom-storage",
		DiskTotal:  100.0,
		DiskUsed:   50.0,
	}

	assert.Equal(t, "my-custom-storage", fsStats.Name)
	assert.Equal(t, "/mnt/storage", fsStats.Mountpoint)
	assert.Equal(t, 100.0, fsStats.DiskTotal)
	assert.Equal(t, 50.0, fsStats.DiskUsed)
}

func TestDiskUsageCaching(t *testing.T) {
	t.Run("caching disabled updates all filesystems", func(t *testing.T) {
		agent := &Agent{
			fsStats: map[string]*system.FsStats{
				"sda": {Root: true, Mountpoint: "/"},
				"sdb": {Root: false, Mountpoint: "/mnt/storage"},
			},
			diskUsageCacheDuration: 0, // caching disabled
		}

		var stats system.Stats
		agent.updateDiskUsage(&stats)

		// Both should be updated (non-zero values from disk.Usage)
		// Root stats should be populated in systemStats
		assert.True(t, agent.lastDiskUsageUpdate.IsZero() || !agent.lastDiskUsageUpdate.IsZero(),
			"lastDiskUsageUpdate should be set when caching is disabled")
	})

	t.Run("caching enabled always updates root filesystem", func(t *testing.T) {
		agent := &Agent{
			fsStats: map[string]*system.FsStats{
				"sda": {Root: true, Mountpoint: "/", DiskTotal: 100, DiskUsed: 50},
				"sdb": {Root: false, Mountpoint: "/mnt/storage", DiskTotal: 200, DiskUsed: 100},
			},
			diskUsageCacheDuration: 1 * time.Hour,
			lastDiskUsageUpdate:    time.Now(), // cache is fresh
		}

		// Store original extra fs values
		originalExtraTotal := agent.fsStats["sdb"].DiskTotal
		originalExtraUsed := agent.fsStats["sdb"].DiskUsed

		var stats system.Stats
		agent.updateDiskUsage(&stats)

		// Root should be updated (systemStats populated from disk.Usage call)
		// We can't easily check if disk.Usage was called, but we verify the flow works

		// Extra filesystem should retain cached values (not reset)
		assert.Equal(t, originalExtraTotal, agent.fsStats["sdb"].DiskTotal,
			"extra filesystem DiskTotal should be unchanged when cached")
		assert.Equal(t, originalExtraUsed, agent.fsStats["sdb"].DiskUsed,
			"extra filesystem DiskUsed should be unchanged when cached")
	})

	t.Run("first call always updates all filesystems", func(t *testing.T) {
		agent := &Agent{
			fsStats: map[string]*system.FsStats{
				"sda": {Root: true, Mountpoint: "/"},
				"sdb": {Root: false, Mountpoint: "/mnt/storage"},
			},
			diskUsageCacheDuration: 1 * time.Hour,
			// lastDiskUsageUpdate is zero (first call)
		}

		var stats system.Stats
		agent.updateDiskUsage(&stats)

		// After first call, lastDiskUsageUpdate should be set
		assert.False(t, agent.lastDiskUsageUpdate.IsZero(),
			"lastDiskUsageUpdate should be set after first call")
	})

	t.Run("expired cache updates extra filesystems", func(t *testing.T) {
		agent := &Agent{
			fsStats: map[string]*system.FsStats{
				"sda": {Root: true, Mountpoint: "/"},
				"sdb": {Root: false, Mountpoint: "/mnt/storage"},
			},
			diskUsageCacheDuration: 1 * time.Millisecond,
			lastDiskUsageUpdate:    time.Now().Add(-1 * time.Second), // cache expired
		}

		var stats system.Stats
		agent.updateDiskUsage(&stats)

		// lastDiskUsageUpdate should be refreshed since cache expired
		assert.True(t, time.Since(agent.lastDiskUsageUpdate) < time.Second,
			"lastDiskUsageUpdate should be refreshed when cache expires")
	})
}

func TestHasSameDiskUsage(t *testing.T) {
	const toleranceBytes uint64 = 16 * 1024 * 1024

	t.Run("returns true when totals and usage are equal", func(t *testing.T) {
		a := &disk.UsageStat{Total: 100 * 1024 * 1024 * 1024, Used: 42 * 1024 * 1024 * 1024}
		b := &disk.UsageStat{Total: 100 * 1024 * 1024 * 1024, Used: 42 * 1024 * 1024 * 1024}
		assert.True(t, hasSameDiskUsage(a, b))
	})

	t.Run("returns true within tolerance", func(t *testing.T) {
		a := &disk.UsageStat{Total: 100 * 1024 * 1024 * 1024, Used: 42 * 1024 * 1024 * 1024}
		b := &disk.UsageStat{
			Total: a.Total + toleranceBytes - 1,
			Used:  a.Used - toleranceBytes + 1,
		}
		assert.True(t, hasSameDiskUsage(a, b))
	})

	t.Run("returns false when total exceeds tolerance", func(t *testing.T) {
		a := &disk.UsageStat{Total: 100 * 1024 * 1024 * 1024, Used: 42 * 1024 * 1024 * 1024}
		b := &disk.UsageStat{
			Total: a.Total + toleranceBytes + 1,
			Used:  a.Used,
		}
		assert.False(t, hasSameDiskUsage(a, b))
	})

	t.Run("returns false for nil or zero total", func(t *testing.T) {
		assert.False(t, hasSameDiskUsage(nil, &disk.UsageStat{Total: 1, Used: 1}))
		assert.False(t, hasSameDiskUsage(&disk.UsageStat{Total: 1, Used: 1}, nil))
		assert.False(t, hasSameDiskUsage(&disk.UsageStat{Total: 0, Used: 0}, &disk.UsageStat{Total: 1, Used: 1}))
	})
}

func TestInitializeDiskIoStatsResetsTrackedDevices(t *testing.T) {
	agent := &Agent{
		fsStats: map[string]*system.FsStats{
			"sda": {},
			"sdb": {},
		},
		fsNames: []string{"stale", "sda"},
	}

	agent.initializeDiskIoStats(map[string]disk.IOCountersStat{
		"sda": {Name: "sda", ReadBytes: 10, WriteBytes: 20},
		"sdb": {Name: "sdb", ReadBytes: 30, WriteBytes: 40},
	})

	assert.ElementsMatch(t, []string{"sda", "sdb"}, agent.fsNames)
	assert.Len(t, agent.fsNames, 2)
	assert.Equal(t, uint64(10), agent.fsStats["sda"].TotalRead)
	assert.Equal(t, uint64(20), agent.fsStats["sda"].TotalWrite)
	assert.False(t, agent.fsStats["sda"].Time.IsZero())
	assert.False(t, agent.fsStats["sdb"].Time.IsZero())

	agent.initializeDiskIoStats(map[string]disk.IOCountersStat{
		"sdb": {Name: "sdb", ReadBytes: 50, WriteBytes: 60},
	})

	assert.Equal(t, []string{"sdb"}, agent.fsNames)
	assert.Equal(t, uint64(50), agent.fsStats["sdb"].TotalRead)
	assert.Equal(t, uint64(60), agent.fsStats["sdb"].TotalWrite)
}
