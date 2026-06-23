//go:build windows && testing

package agent

import (
	"testing"

	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/entities/service"
)

func TestMatchWindowsProcessesExcludesContainerRuntimes(t *testing.T) {
	t.Parallel()

	rows := []windowsProcessRow{
		{Name: "Docker Desktop.exe", Executable: `C:\Program Files\Docker\Docker\Docker Desktop.exe`},
		{Name: "com.docker.backend.exe", Executable: `C:\Program Files\Docker\Docker\resources\com.docker.backend.exe`},
		{Name: "containerd.exe", Executable: `C:\Program Files\Docker\Docker\resources\containerd.exe`},
		{Name: "podman.exe", Executable: `C:\Program Files\RedHat\Podman\podman.exe`},
		{Name: "explorer.exe", Executable: `C:\Windows\explorer.exe`},
		{Name: "NVDisplay.Container.exe", Executable: `C:\Windows\System32\DriverStore\NVDisplay.Container.exe`},
	}

	results := matchWindowsProcesses([]string{"docker", "containerd", "podman", "explorer", "NVDisplay.Container"}, rows)

	byName := make(map[string]*service.Service, len(results))
	for _, result := range results {
		byName[result.Name] = result
	}

	require.Equal(t, service.StateStopped, byName["docker"].State)
	require.Equal(t, service.StateStopped, byName["containerd"].State)
	require.Equal(t, service.StateStopped, byName["podman"].State)
	require.Equal(t, service.StateRunning, byName["explorer"].State)
	require.Equal(t, service.StateRunning, byName["NVDisplay.Container"].State)
}
