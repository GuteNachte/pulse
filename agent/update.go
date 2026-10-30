package agent

import (
	"fmt"
	"runtime"
)

// Update is the legacy CLI update entrypoint. This build only supports
// controlled self-update for Windows service agents. Linux / NAS agents are
// updated by replacing the Docker image through Compose.
func Update() error {
	if runtime.GOOS == "windows" {
		return fmt.Errorf("manual CLI update is disabled; use the Windows service update operation from the Hub")
	}
	return fmt.Errorf("host binary update is disabled; update Linux / NAS agents by replacing the Docker image")
}
