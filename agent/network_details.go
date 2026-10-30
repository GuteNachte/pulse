package agent

import (
	"net"
	"reflect"
	"strings"

	psutilNet "github.com/shirou/gopsutil/v4/net"
	"gutenacht.site/pulse/internal/entities/system"
)

var detectNetworkInterfaceDetailsFunc = detectNetworkInterfaceDetails

func (a *Agent) refreshNetworkInterfaceDetails() {
	details := detectNetworkInterfaceDetailsFunc(a.netInterfaces)
	if len(details) == 0 {
		return
	}
	if reflect.DeepEqual(a.systemDetails.NetworkInterfaces, details) {
		return
	}
	a.updateSystemDetails(func(systemDetails *system.Details) {
		systemDetails.NetworkInterfaces = details
	})
}

func makeNetworkInterfaceDetails(
	name string,
	displayName string,
	mac string,
	linkSpeed uint64,
	status string,
	ipMethod string,
	ipv4 []string,
	ipv6 []string,
	gateways []string,
	dnsServers []string,
) system.NetworkInterfaceDetails {
	return system.NetworkInterfaceDetails{
		Name:        name,
		DisplayName: displayName,
		Mac:         mac,
		LinkSpeed:   linkSpeed,
		Status:      status,
		IPMethod:    ipMethod,
		IPv4:        ipv4,
		IPv6:        ipv6,
		Gateways:    gateways,
		DNSServers:  dnsServers,
	}
}

func networkInterfaceAddresses(interfaces []psutilNet.InterfaceStat, name string) ([]string, []string) {
	var ipv4 []string
	var ipv6 []string
	for _, iface := range interfaces {
		if !strings.EqualFold(strings.TrimSpace(iface.Name), strings.TrimSpace(name)) {
			continue
		}
		for _, address := range iface.Addrs {
			value := strings.TrimSpace(address.Addr)
			ip, _, err := net.ParseCIDR(value)
			if err != nil {
				ip = net.ParseIP(value)
			}
			if ip == nil || ip.IsUnspecified() || ip.IsMulticast() {
				continue
			}
			if ip4 := ip.To4(); ip4 != nil {
				ipv4 = append(ipv4, ip4.String())
			} else {
				ipv6 = append(ipv6, ip.String())
			}
		}
		break
	}
	return normalizeStringList(ipv4), normalizeStringList(ipv6)
}
