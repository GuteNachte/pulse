//go:build windows || testing

package agent

import "encoding/json"

type windowsProcessRow struct {
	Name       string `json:"Name"`
	ProcessID  uint32 `json:"ProcessId"`
	Executable string `json:"ExecutablePath"`
	SessionID  uint32 `json:"SessionId"`
}

func parseWindowsProcessRows(output []byte) ([]windowsProcessRow, error) {
	var rows []windowsProcessRow
	if err := json.Unmarshal(output, &rows); err != nil {
		var row windowsProcessRow
		if singleErr := json.Unmarshal(output, &row); singleErr != nil {
			return nil, err
		}
		rows = []windowsProcessRow{row}
	}
	return rows, nil
}
