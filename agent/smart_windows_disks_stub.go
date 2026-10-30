//go:build !windows

package agent

// windowsPhysicalDiskDevices is only available on Windows; other platforms use
// their own SMART collectors.
func windowsPhysicalDiskDevices() ([]*DeviceInfo, map[string]windowsDiskEntry) {
	return nil, nil
}
