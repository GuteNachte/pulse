//go:build !windows && !linux

package agent

import "gutenacht.site/pulse/internal/entities/system"

func detectNetworkInterfaceDetails(valid map[string]struct{}) []system.NetworkInterfaceDetails {
	return nil
}

func physicalNetworkInterfaces() map[string]struct{} {
	return nil
}
