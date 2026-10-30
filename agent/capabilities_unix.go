//go:build !windows

package agent

import "os"

func detectPrivilege() string {
	if os.Geteuid() == 0 {
		return "root"
	}
	return "user"
}
