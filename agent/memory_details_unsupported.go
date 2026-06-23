//go:build !windows && !linux

package agent

import "gutenacht.site/pulse/internal/entities/system"

func detectMemoryModuleDetails() []system.MemoryModuleDetails {
	return nil
}
