package agent

import (
	"reflect"

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
