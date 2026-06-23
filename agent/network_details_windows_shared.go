package agent

import (
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type windowsNetAdapterRow struct {
	Name                 string
	InterfaceDescription string
	HardwareInterface    bool
	Virtual              bool
	MacAddress           string
	LinkSpeed            string
	Status               string
	Dhcp                 string
	IPv4                 []string
	IPv6                 []string
	Gateways             []string
	DNSServers           []string
}

type windowsStringList []string

func (values *windowsStringList) UnmarshalJSON(data []byte) error {
	raw := strings.TrimSpace(string(data))
	if raw == "" || raw == "null" || raw == "{}" {
		*values = nil
		return nil
	}
	if strings.HasPrefix(raw, "\"") {
		var value string
		if err := json.Unmarshal(data, &value); err != nil {
			return err
		}
		if strings.TrimSpace(value) == "" {
			*values = nil
			return nil
		}
		*values = []string{value}
		return nil
	}
	var list []string
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}
	*values = list
	return nil
}

func parseWindowsNetAdapterRows(out []byte) ([]windowsNetAdapterRow, error) {
	if len(out) == 0 || strings.TrimSpace(string(out)) == "" {
		return nil, nil
	}
	var rows []windowsNetAdapterRow
	if err := json.Unmarshal(out, &rows); err == nil {
		return rows, nil
	}
	var row windowsNetAdapterRow
	if err := json.Unmarshal(out, &row); err != nil {
		return nil, err
	}
	if strings.TrimSpace(row.Name) == "" {
		return nil, nil
	}
	return []windowsNetAdapterRow{row}, nil
}

func (row *windowsNetAdapterRow) UnmarshalJSON(data []byte) error {
	var raw struct {
		Name                 string
		InterfaceDescription string
		HardwareInterface    bool
		Virtual              bool
		MacAddress           string
		LinkSpeed            string
		Status               string
		Dhcp                 string
		IPv4                 windowsStringList
		IPv6                 windowsStringList
		Gateways             windowsStringList
		DNSServers           windowsStringList
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	row.Name = raw.Name
	row.InterfaceDescription = raw.InterfaceDescription
	row.HardwareInterface = raw.HardwareInterface
	row.Virtual = raw.Virtual
	row.MacAddress = raw.MacAddress
	row.LinkSpeed = raw.LinkSpeed
	row.Status = raw.Status
	row.Dhcp = raw.Dhcp
	row.IPv4 = []string(raw.IPv4)
	row.IPv6 = []string(raw.IPv6)
	row.Gateways = []string(raw.Gateways)
	row.DNSServers = []string(raw.DNSServers)
	return nil
}

func buildWindowsNetAdapterCommand(valid map[string]struct{}) string {
	names := make([]string, 0, len(valid))
	for name := range valid {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		names = append(names, quotePowerShellString(name))
	}
	sort.Strings(names)

	source := "Get-NetAdapter"
	if len(names) > 0 {
		source = "$names = @(" + strings.Join(names, ", ") + "); Get-NetAdapter -Name $names -ErrorAction SilentlyContinue"
	}
	return source + ` | ForEach-Object { $adapter = $_; $ip = Get-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1; $config = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue; [pscustomobject]@{ Name = $adapter.Name; InterfaceDescription = $adapter.InterfaceDescription; HardwareInterface = [bool]$adapter.HardwareInterface; Virtual = [bool]$adapter.Virtual; MacAddress = $adapter.MacAddress; LinkSpeed = $adapter.LinkSpeed; Status = $adapter.Status; Dhcp = if ($ip) { [string]$ip.Dhcp } else { "" }; IPv4 = @($config.IPv4Address | ForEach-Object { $_.IPAddress }); IPv6 = @($config.IPv6Address | ForEach-Object { $_.IPAddress }); Gateways = @(@($config.IPv4DefaultGateway.NextHop; $config.IPv6DefaultGateway.NextHop) | Where-Object { $_ }); DNSServers = @($config.DNSServer.ServerAddresses) } } | ConvertTo-Json -Compress`
}

func filterWindowsPhysicalAdapters(rows []windowsNetAdapterRow) []windowsNetAdapterRow {
	filtered := make([]windowsNetAdapterRow, 0, len(rows))
	for _, row := range rows {
		if row.HardwareInterface && !row.Virtual {
			filtered = append(filtered, row)
		}
	}
	return filtered
}

func buildWindowsAdapterLookups(rows []windowsNetAdapterRow) (map[string]windowsNetAdapterRow, map[string]windowsNetAdapterRow) {
	byName := make(map[string]windowsNetAdapterRow, len(rows))
	byMac := make(map[string]windowsNetAdapterRow, len(rows))
	for _, row := range rows {
		name := strings.ToLower(strings.TrimSpace(row.Name))
		if name != "" {
			byName[name] = row
		}
		mac := normalizeHardwareAddress(row.MacAddress)
		if mac != "" {
			byMac[mac] = row
		}
	}
	return byName, byMac
}

func findWindowsAdapterForInterface(
	name string,
	mac string,
	byName map[string]windowsNetAdapterRow,
	byMac map[string]windowsNetAdapterRow,
) (windowsNetAdapterRow, bool) {
	if mac != "" {
		if row, ok := byMac[normalizeHardwareAddress(mac)]; ok {
			return row, true
		}
	}
	if row, ok := byName[strings.ToLower(strings.TrimSpace(name))]; ok {
		return row, true
	}
	return windowsNetAdapterRow{}, false
}

func normalizeHardwareAddress(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return ""
	}
	value = strings.ReplaceAll(value, "-", "")
	value = strings.ReplaceAll(value, ":", "")
	value = strings.ReplaceAll(value, ".", "")
	return value
}

func normalizeWindowsHardwareAddress(value string) string {
	value = normalizeHardwareAddress(value)
	if len(value) != 12 {
		return value
	}
	parts := make([]string, 0, 6)
	for i := 0; i < len(value); i += 2 {
		parts = append(parts, value[i:i+2])
	}
	return strings.Join(parts, ":")
}

func parseWindowsLinkSpeed(value string) uint64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	re := regexp.MustCompile(`(?i)([\d.]+)\s*([kmgt]?bps)`)
	matches := re.FindStringSubmatch(value)
	if len(matches) != 3 {
		return 0
	}
	number, err := strconv.ParseFloat(matches[1], 64)
	if err != nil {
		return 0
	}
	multiplier := float64(1)
	switch strings.ToLower(matches[2]) {
	case "kbps":
		multiplier = 1_000
	case "mbps":
		multiplier = 1_000_000
	case "gbps":
		multiplier = 1_000_000_000
	case "tbps":
		multiplier = 1_000_000_000_000
	}
	return uint64(number * multiplier)
}

func normalizeWindowsIPMethod(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "enabled":
		return "dhcp"
	case "disabled":
		return "static"
	default:
		return ""
	}
}

func normalizeStringList(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
	}
	return normalized
}
