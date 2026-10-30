//go:build !linux && !windows

package agent

import "gutenacht.site/pulse/internal/entities/system"

func detectVirtualizationDetails() system.VirtualizationDetails {
	return system.VirtualizationDetails{}
}
