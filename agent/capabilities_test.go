package agent

import (
	"runtime"
	"testing"

	"gutenacht.site/pulse/internal/entities/system"
)

func TestIsContainerRunModeHonorsExplicitDockerMarkers(t *testing.T) {
	tests := []struct {
		name          string
		installMethod string
		runMode       string
	}{
		{name: "install method docker", installMethod: "docker", runMode: "manual"},
		{name: "run mode docker", installMethod: "host", runMode: "docker"},
		{name: "trim and case", installMethod: " Docker ", runMode: "manual"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !isContainerRunMode(tt.installMethod, tt.runMode) {
				t.Fatalf("expected container mode for installMethod=%q runMode=%q", tt.installMethod, tt.runMode)
			}
		})
	}
}

func TestBuildCapabilitiesDoesNotAdvertiseDisabledOperations(t *testing.T) {
	agent := &Agent{}

	capabilities := agent.buildCapabilities()

	for _, disabled := range []string{"software_control", "shutdown", "reboot"} {
		if containsString(capabilities.Operations, disabled) {
			t.Fatalf("did not expect disabled operation %q in %#v", disabled, capabilities.Operations)
		}
	}
	if containsString(capabilities.Collection, "extra_filesystems") {
		t.Fatalf("did not expect extra_filesystems collection in %#v", capabilities.Collection)
	}
	if _, ok := capabilities.UnsupportedReasons["software_control"]; ok {
		t.Fatal("did not expect software_control unsupported reason")
	}
	if _, ok := capabilities.UnsupportedReasons["extra_filesystems"]; ok {
		t.Fatal("did not expect extra_filesystems unsupported reason")
	}
}

func TestBuildCapabilitiesWindowsSoftwareMonitorOnly(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("windows capability assertion")
	}
	agent := &Agent{}

	capabilities := agent.buildCapabilities()

	if !containsString(capabilities.Collection, "software_monitor") {
		t.Fatalf("expected software_monitor collection in %#v", capabilities.Collection)
	}
	if containsString(capabilities.Operations, "software_control") {
		t.Fatalf("did not expect software_control in %#v", capabilities.Operations)
	}
}

func TestBuildCapabilitiesLinuxContainerOmitsRemovedHostFeatures(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("linux capability assertion")
	}
	t.Setenv("INSTALL_METHOD", "docker")
	t.Setenv("RUN_MODE", "docker")
	agent := &Agent{}

	capabilities := agent.buildCapabilities()

	for _, removed := range []string{"systemd_services", "service_control", "software_monitor"} {
		if containsString(capabilities.Collection, removed) {
			t.Fatalf("did not expect removed collection %q in %#v", removed, capabilities.Collection)
		}
		if containsString(capabilities.Operations, removed) {
			t.Fatalf("did not expect removed operation %q in %#v", removed, capabilities.Operations)
		}
		if _, ok := capabilities.UnsupportedReasons[removed]; ok {
			t.Fatalf("did not expect removed unsupported reason %q in %#v", removed, capabilities.UnsupportedReasons)
		}
	}
}

func TestBuildCapabilitiesLinuxDefaultsToContainerProfile(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("linux capability assertion")
	}
	agent := &Agent{}

	capabilities := agent.buildCapabilities()

	if capabilities.AgentProfile != "linux-container" {
		t.Fatalf("expected linux-container profile, got %q", capabilities.AgentProfile)
	}
	if _, ok := capabilities.UnsupportedReasons["service_control"]; ok {
		t.Fatal("did not expect service_control unsupported reason for linux container profile")
	}
}

func TestUpdateCapabilityResultsSeparatesDeclarationFromCollectionResult(t *testing.T) {
	agent := &Agent{}
	data := &system.CombinedData{
		Stats: system.Stats{
			Mem:       16,
			MemPct:    42,
			DiskTotal: 128,
		},
		Info: system.Info{
			Capabilities: &system.AgentCapabilities{
				Collection: []string{"metrics_basic"},
				UnsupportedReasons: map[string]string{
					"containers": "Docker socket is not available",
					"smart":      "SMART collector is not available",
					"gpu":        "GPU collector is not available",
				},
			},
		},
	}

	agent.updateCapabilityResults(data)

	if data.Info.Capabilities.CollectionResults["metrics_basic"].State != system.CapabilityStateConfirmed {
		t.Fatalf("expected metrics to be confirmed, got %#v", data.Info.Capabilities.CollectionResults["metrics_basic"])
	}
	if data.Info.Capabilities.CollectionResults["containers"].State != system.CapabilityStateUnavailable {
		t.Fatalf("expected containers to be unavailable, got %#v", data.Info.Capabilities.CollectionResults["containers"])
	}
	if data.Info.Capabilities.CollectionResults["smart"].State != system.CapabilityStateUnsupported {
		t.Fatalf("expected smart to be unsupported, got %#v", data.Info.Capabilities.CollectionResults["smart"])
	}
	if data.Info.Capabilities.Diagnostics["docker_socket"].State != system.CapabilityStateUnavailable {
		t.Fatalf("expected docker socket diagnostic, got %#v", data.Info.Capabilities.Diagnostics["docker_socket"])
	}
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
