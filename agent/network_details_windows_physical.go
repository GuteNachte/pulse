//go:build windows

package agent

func physicalNetworkInterfaces() map[string]struct{} {
	rows := filterWindowsPhysicalAdapters(getWindowsNetAdapters(nil))
	physical := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		physical[row.Name] = struct{}{}
	}
	if len(physical) == 0 {
		return nil
	}
	return physical
}
