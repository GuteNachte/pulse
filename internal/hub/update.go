package hub

import (
	"fmt"

	"github.com/spf13/cobra"
)

// Update is kept as a compatibility command for older local scripts.
// Pulse releases are built and deployed through explicit Hub / Agent versions,
// not by downloading upstream GitHub release assets at runtime.
func Update(cmd *cobra.Command, _ []string) {
	fmt.Fprintln(cmd.ErrOrStderr(), "Pulse Hub runtime self-update is disabled.")
	fmt.Fprintln(cmd.ErrOrStderr(), "Use supplemental/scripts/publish-release-v1.ps1 with an explicit version, then update the deployed Docker Compose images.")
}
