//go:build windows

package agent

import "golang.org/x/sys/windows"

func detectPrivilege() string {
	if windows.GetCurrentProcessToken().IsElevated() {
		return "admin"
	}
	return "user"
}
