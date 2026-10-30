//go:build testing

package agent

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeHardwareAddress(t *testing.T) {
	require.Equal(t, "5847ca706ac2", normalizeHardwareAddress("58-47-CA-70-6A-C2"))
	require.Equal(t, "5847ca706ac2", normalizeHardwareAddress("58:47:ca:70:6a:c2"))
	require.Equal(t, "5847ca706ac2", normalizeHardwareAddress("5847.ca70.6ac2"))
}

func TestNormalizeWindowsHardwareAddress(t *testing.T) {
	require.Equal(t, "58:47:ca:70:6a:c2", normalizeWindowsHardwareAddress("58-47-CA-70-6A-C2"))
	require.Equal(t, "58:47:ca:70:6a:c2", normalizeWindowsHardwareAddress("58:47:ca:70:6a:c2"))
	require.Equal(t, "", normalizeWindowsHardwareAddress(""))
}

func TestFindWindowsAdapterForInterfacePrefersMac(t *testing.T) {
	rows := []windowsNetAdapterRow{
		{
			Name:       "Ethernet",
			MacAddress: "58-47-CA-70-6A-C2",
			LinkSpeed:  "2.5 Gbps",
			Status:     "Up",
		},
	}
	byName, byMac := buildWindowsAdapterLookups(rows)

	row, ok := findWindowsAdapterForInterface("garbled-name", "58:47:ca:70:6a:c2", byName, byMac)

	require.True(t, ok)
	require.Equal(t, "Ethernet", row.Name)
	require.Equal(t, uint64(2_500_000_000), parseWindowsLinkSpeed(row.LinkSpeed))
}

func TestFindWindowsAdapterForInterfaceFallsBackToName(t *testing.T) {
	rows := []windowsNetAdapterRow{
		{
			Name:       "Ethernet",
			MacAddress: "",
			LinkSpeed:  "1 Gbps",
			Status:     "Up",
		},
	}
	byName, byMac := buildWindowsAdapterLookups(rows)

	row, ok := findWindowsAdapterForInterface("ethernet", "", byName, byMac)

	require.True(t, ok)
	require.Equal(t, "Ethernet", row.Name)
	require.Equal(t, uint64(1_000_000_000), parseWindowsLinkSpeed(row.LinkSpeed))
}

func TestNormalizeWindowsIPMethod(t *testing.T) {
	require.Equal(t, "dhcp", normalizeWindowsIPMethod("Enabled"))
	require.Equal(t, "static", normalizeWindowsIPMethod("Disabled"))
	require.Equal(t, "", normalizeWindowsIPMethod(""))
	require.Equal(t, "", normalizeWindowsIPMethod("Unknown"))
}

func TestNormalizeStringList(t *testing.T) {
	require.Equal(t, []string{"192.168.1.10", "fe80::1"}, normalizeStringList([]string{" 192.168.1.10 ", "", "fe80::1", "192.168.1.10"}))
}

func TestMakeNetworkInterfaceDetailsPreservesAddressMetadata(t *testing.T) {
	details := makeNetworkInterfaceDetails(
		"以太网",
		"Intel(R) Ethernet Controller (3) I225-V",
		"58:47:ca:70:6a:c2",
		2_500_000_000,
		"Up",
		"dhcp",
		[]string{"192.168.1.10"},
		[]string{"fe80::1"},
		[]string{"192.168.1.1"},
		[]string{"192.168.1.1", "223.5.5.5"},
	)

	require.Equal(t, "以太网", details.Name)
	require.Equal(t, "Intel(R) Ethernet Controller (3) I225-V", details.DisplayName)
	require.Equal(t, "58:47:ca:70:6a:c2", details.Mac)
	require.Equal(t, uint64(2_500_000_000), details.LinkSpeed)
	require.Equal(t, "Up", details.Status)
	require.Equal(t, "dhcp", details.IPMethod)
	require.Equal(t, []string{"192.168.1.10"}, details.IPv4)
	require.Equal(t, []string{"fe80::1"}, details.IPv6)
	require.Equal(t, []string{"192.168.1.1"}, details.Gateways)
	require.Equal(t, []string{"192.168.1.1", "223.5.5.5"}, details.DNSServers)
}

func TestParseWindowsNetAdapterRowsAcceptsPowerShellScalarAndEmptyGatewayShapes(t *testing.T) {
	raw := []byte(`[
		{"Name":"vEthernet","InterfaceDescription":"Hyper-V Virtual Ethernet Adapter","MacAddress":"00-15-5D-EE-5B-D9","LinkSpeed":"10 Gbps","Status":"Up","Dhcp":"Disabled","IPv4":["172.29.224.1"],"IPv6":[],"Gateways":{},"DNSServers":["fec0:0:0:ffff::1"]},
		{"Name":"Meta","InterfaceDescription":"Meta Tunnel","MacAddress":"","LinkSpeed":"100 Gbps","Status":"Up","Dhcp":"Disabled","IPv4":["198.18.0.1"],"IPv6":[],"Gateways":"198.18.0.2","DNSServers":["198.18.0.2"]},
		{"Name":"以太网","InterfaceDescription":"Intel(R) Ethernet Controller (3) I225-V","MacAddress":"58-47-CA-70-6A-C2","LinkSpeed":"2.5 Gbps","Status":"Up","Dhcp":"Enabled","IPv4":["192.168.1.10"],"IPv6":["2408:8207:9011:8ee0:5b5f:a14:c82a:828e"],"Gateways":["192.168.1.1","fe80::1"],"DNSServers":["fe80::1","192.168.1.1"]}
	]`)

	rows, err := parseWindowsNetAdapterRows(raw)

	require.NoError(t, err)
	require.Len(t, rows, 3)
	require.Empty(t, rows[0].Gateways)
	require.Equal(t, []string{"198.18.0.2"}, rows[1].Gateways)
	require.Equal(t, []string{"192.168.1.1", "fe80::1"}, rows[2].Gateways)
	require.Equal(t, []string{"192.168.1.10"}, rows[2].IPv4)
	require.Equal(t, []string{"2408:8207:9011:8ee0:5b5f:a14:c82a:828e"}, rows[2].IPv6)
	require.Equal(t, []string{"fe80::1", "192.168.1.1"}, rows[2].DNSServers)
}

func TestBuildWindowsNetAdapterCommandFiltersValidNamesAndKeepsGatewayArray(t *testing.T) {
	command := buildWindowsNetAdapterCommand(map[string]struct{}{
		"以太网":         {},
		"Svc'Adapter": {},
	})

	require.Contains(t, command, "$names = @(")
	require.Contains(t, command, "'以太网'")
	require.Contains(t, command, "'Svc''Adapter'")
	require.Contains(t, command, "Get-NetAdapter -Name $names")
	require.Contains(t, command, "Gateways = @(@(")
}
