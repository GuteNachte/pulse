//go:build testing

package systems

import (
	"testing"

	"gutenacht.site/pulse/internal/entities/system"

	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/require"
)

func TestCombinedData_MigrateDeprecatedFields(t *testing.T) {
	t.Run("Migrate NetworkSent and NetworkRecv to Bandwidth", func(t *testing.T) {
		cd := &system.CombinedData{
			Stats: system.Stats{
				NetworkSent: 1.5, // 1.5 MB
				NetworkRecv: 2.5, // 2.5 MB
			},
		}
		migrateDeprecatedFields(cd, true)

		expectedSent := uint64(1.5 * 1024 * 1024)
		expectedRecv := uint64(2.5 * 1024 * 1024)

		if cd.Stats.Bandwidth[0] != expectedSent {
			t.Errorf("expected Bandwidth[0] %d, got %d", expectedSent, cd.Stats.Bandwidth[0])
		}
		if cd.Stats.Bandwidth[1] != expectedRecv {
			t.Errorf("expected Bandwidth[1] %d, got %d", expectedRecv, cd.Stats.Bandwidth[1])
		}
		if cd.Stats.NetworkSent != 0 || cd.Stats.NetworkRecv != 0 {
			t.Errorf("expected NetworkSent and NetworkRecv to be reset, got %f, %f", cd.Stats.NetworkSent, cd.Stats.NetworkRecv)
		}
	})

	t.Run("Migrate Info.Bandwidth to Info.BandwidthBytes", func(t *testing.T) {
		cd := &system.CombinedData{
			Info: system.Info{
				Bandwidth: 10.0, // 10 MB
			},
		}
		migrateDeprecatedFields(cd, true)

		expected := uint64(10 * 1024 * 1024)
		if cd.Info.BandwidthBytes != expected {
			t.Errorf("expected BandwidthBytes %d, got %d", expected, cd.Info.BandwidthBytes)
		}
		if cd.Info.Bandwidth != 0 {
			t.Errorf("expected Info.Bandwidth to be reset, got %f", cd.Info.Bandwidth)
		}
	})

	t.Run("Copy Stats.Bandwidth into Info.BandwidthBytesByDirection", func(t *testing.T) {
		cd := &system.CombinedData{
			Stats: system.Stats{
				Bandwidth: [2]uint64{4096, 8192},
			},
		}
		migrateDeprecatedFields(cd, true)

		if cd.Info.BandwidthBytesByDirection != cd.Stats.Bandwidth {
			t.Errorf(
				"expected BandwidthBytesByDirection %v, got %v",
				cd.Stats.Bandwidth,
				cd.Info.BandwidthBytesByDirection,
			)
		}
	})

	t.Run("Migrate DiskReadPs and DiskWritePs to DiskIO", func(t *testing.T) {
		cd := &system.CombinedData{
			Stats: system.Stats{
				DiskReadPs:  3.0, // 3 MB
				DiskWritePs: 4.0, // 4 MB
			},
		}
		migrateDeprecatedFields(cd, true)

		expectedRead := uint64(3 * 1024 * 1024)
		expectedWrite := uint64(4 * 1024 * 1024)

		if cd.Stats.DiskIO[0] != expectedRead {
			t.Errorf("expected DiskIO[0] %d, got %d", expectedRead, cd.Stats.DiskIO[0])
		}
		if cd.Stats.DiskIO[1] != expectedWrite {
			t.Errorf("expected DiskIO[1] %d, got %d", expectedWrite, cd.Stats.DiskIO[1])
		}
		if cd.Stats.DiskReadPs != 0 || cd.Stats.DiskWritePs != 0 {
			t.Errorf("expected DiskReadPs and DiskWritePs to be reset, got %f, %f", cd.Stats.DiskReadPs, cd.Stats.DiskWritePs)
		}
	})

	t.Run("Migrate Info fields to Details struct", func(t *testing.T) {
		cd := &system.CombinedData{
			Stats: system.Stats{
				Mem: 16.0, // 16 GB
			},
			Info: system.Info{
				Hostname:      "test-host",
				KernelVersion: "6.8.0",
				Cores:         8,
				Threads:       16,
				CpuModel:      "Intel i7",
				Podman:        true,
				Os:            system.Linux,
			},
		}
		migrateDeprecatedFields(cd, true)

		if cd.Details == nil {
			t.Fatal("expected Details struct to be created")
		}
		if cd.Details.Hostname != "test-host" {
			t.Errorf("expected Hostname 'test-host', got '%s'", cd.Details.Hostname)
		}
		if cd.Details.Kernel != "6.8.0" {
			t.Errorf("expected Kernel '6.8.0', got '%s'", cd.Details.Kernel)
		}
		if cd.Details.Cores != 8 {
			t.Errorf("expected Cores 8, got %d", cd.Details.Cores)
		}
		if cd.Details.Threads != 16 {
			t.Errorf("expected Threads 16, got %d", cd.Details.Threads)
		}
		if cd.Details.CpuModel != "Intel i7" {
			t.Errorf("expected CpuModel 'Intel i7', got '%s'", cd.Details.CpuModel)
		}
		if cd.Details.Podman != true {
			t.Errorf("expected Podman true, got %v", cd.Details.Podman)
		}
		if cd.Details.Os != system.Linux {
			t.Errorf("expected Os Linux, got %d", cd.Details.Os)
		}
		expectedMem := uint64(16 * 1024 * 1024 * 1024)
		if cd.Details.MemoryTotal != expectedMem {
			t.Errorf("expected MemoryTotal %d, got %d", expectedMem, cd.Details.MemoryTotal)
		}

		if cd.Info.Hostname != "" || cd.Info.KernelVersion != "" || cd.Info.Cores != 0 || cd.Info.CpuModel != "" || cd.Info.Podman != false || cd.Info.Os != 0 {
			t.Errorf("expected Info fields to be reset, got %+v", cd.Info)
		}
	})

	t.Run("Do not migrate if Details already exists", func(t *testing.T) {
		cd := &system.CombinedData{
			Details: &system.Details{Hostname: "existing-host"},
			Info: system.Info{
				Hostname: "deprecated-host",
			},
		}
		migrateDeprecatedFields(cd, true)

		if cd.Details.Hostname != "existing-host" {
			t.Errorf("expected Hostname 'existing-host', got '%s'", cd.Details.Hostname)
		}
		if cd.Info.Hostname != "deprecated-host" {
			t.Errorf("expected Info.Hostname to remain 'deprecated-host', got '%s'", cd.Info.Hostname)
		}
	})

	t.Run("Do not create details if migrateDetails is false", func(t *testing.T) {
		cd := &system.CombinedData{
			Info: system.Info{
				Hostname: "deprecated-host",
			},
		}
		migrateDeprecatedFields(cd, false)

		if cd.Details != nil {
			t.Fatal("expected Details struct to not be created")
		}

		if cd.Info.Hostname != "" {
			t.Errorf("expected Info.Hostname to be reset, got '%s'", cd.Info.Hostname)
		}
	})
}

func TestUpdateLocalSystemMarkerFromInfoKeepsWindowsHostRemoteNonLocal(t *testing.T) {
	record := newSystemTestRecord(t)
	record.Set("is_local", true)

	updateLocalSystemMarkerFromInfo(record, system.Info{
		RemoteIP: "192.168.1.5",
		Capabilities: &system.AgentCapabilities{
			Platform:      "windows",
			InstallMethod: "windows",
			RunMode:       "host",
			AgentProfile:  "windows-host",
		},
	})

	require.False(t, record.GetBool("is_local"))
}

func TestUpdateLocalSystemMarkerFromInfoKeepsExistingDevLoopbackHubMarker(t *testing.T) {
	t.Setenv("PULSE_DEV_LOCAL_AGENT_AS_HUB", "true")
	record := newSystemTestRecord(t)
	record.Set("is_local", true)
	record.Set("primary_use", "primary")
	record.Set("description", "自己主要用的机器")

	updateLocalSystemMarkerFromInfo(record, system.Info{
		RemoteIP: "127.0.0.1",
		Capabilities: &system.AgentCapabilities{
			Platform:      "windows",
			InstallMethod: "windows",
			RunMode:       "host",
			AgentProfile:  "windows-host",
		},
	})

	require.True(t, record.GetBool("is_local"))
	require.Equal(t, "development", record.GetString("primary_use"))
	require.Equal(t, "Hub 开发机器", record.GetString("description"))
}

func TestUpdateLocalSystemMarkerFromInfoDoesNotPromoteNewPairedDevLoopbackAgent(t *testing.T) {
	t.Setenv("PULSE_DEV_LOCAL_AGENT_AS_HUB", "true")
	record := newSystemTestRecord(t)
	record.Set("is_local", false)
	record.Set("primary_use", "primary")
	record.Set("description", "普通配对机器")

	updateLocalSystemMarkerFromInfo(record, system.Info{
		RemoteIP: "127.0.0.1",
		Capabilities: &system.AgentCapabilities{
			Platform:      "windows",
			InstallMethod: "windows",
			RunMode:       "host",
			AgentProfile:  "windows-host",
		},
	})

	require.False(t, record.GetBool("is_local"))
	require.Equal(t, "primary", record.GetString("primary_use"))
	require.Equal(t, "普通配对机器", record.GetString("description"))
}

func TestUpdateLocalSystemMarkerFromInfoDoesNotMarkRemoteDevWindowsHostAsHub(t *testing.T) {
	t.Setenv("PULSE_DEV_LOCAL_AGENT_AS_HUB", "true")
	record := newSystemTestRecord(t)
	record.Set("is_local", false)
	record.Set("primary_use", "primary")

	updateLocalSystemMarkerFromInfo(record, system.Info{
		RemoteIP: "192.168.1.5",
		Capabilities: &system.AgentCapabilities{
			Platform:      "windows",
			InstallMethod: "windows",
			RunMode:       "host",
			AgentProfile:  "windows-host",
		},
	})

	require.False(t, record.GetBool("is_local"))
	require.Equal(t, "primary", record.GetString("primary_use"))
}

func TestSelectSystemIdentityIPUsesPhysicalLANAddressForLoopbackAgent(t *testing.T) {
	details := &system.Details{NetworkInterfaces: []system.NetworkInterfaceDetails{
		{Name: "docker0", Status: "up", IPv4: []string{"172.17.0.1"}},
		{Name: "enp2s0", Status: "up", IPv4: []string{"192.168.1.30"}},
	}}

	require.Equal(t, "192.168.1.30", selectSystemIdentityIP("127.0.0.1", details))
}

func TestSelectSystemIdentityIPKeepsObservedAddressForRemoteAgent(t *testing.T) {
	details := &system.Details{NetworkInterfaces: []system.NetworkInterfaceDetails{
		{Name: "enp2s0", Status: "up", IPv4: []string{"192.168.1.30"}},
	}}

	require.Equal(t, "192.168.1.10", selectSystemIdentityIP("192.168.1.10", details))
}

func TestPersistedSystemIdentityIPKeepsLocalLANAddressWithoutFreshDetails(t *testing.T) {
	record := newSystemTestRecord(t)
	record.Set("is_local", true)
	record.Set("info", system.Info{RemoteIP: "192.168.1.30"})

	require.Equal(t, "192.168.1.30", persistedSystemIdentityIP(record, "127.0.0.1"))
}

func newSystemTestRecord(t *testing.T) *core.Record {
	t.Helper()
	app, err := pbtests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	t.Cleanup(app.Cleanup)

	collection, err := app.FindCachedCollectionByNameOrId("systems")
	require.NoError(t, err)
	return core.NewRecord(collection)
}
