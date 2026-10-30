package agent

import (
	"strings"

	"gutenacht.site/pulse/internal/entities/system"
)

func makeVirtualizationDetails(virtType string, role string) system.VirtualizationDetails {
	virtType = normalizeVirtualizationType(virtType)
	if virtType == "" || virtType == "none" {
		return system.VirtualizationDetails{}
	}
	if role == "" {
		role = "guest"
	}
	return system.VirtualizationDetails{
		Type: virtType,
		Role: role,
		Name: virtualizationDisplayName(virtType, role),
	}
}

func makeVirtualizationHostDetails(virtType string, virtualMachines []system.VirtualMachine) system.VirtualizationDetails {
	details := makeVirtualizationDetails(virtType, "host")
	details.VirtualMachines = normalizeVirtualMachines(virtualMachines)
	return details
}

func classifyVirtualizationText(value string) string {
	normalized := strings.ToLower(value)
	switch {
	case strings.Contains(normalized, "vmware"):
		return "vmware"
	case strings.Contains(normalized, "virtualbox") || strings.Contains(normalized, "innotek"):
		return "virtualbox"
	case strings.Contains(normalized, "qemu") || strings.Contains(normalized, "kvm"):
		return "kvm"
	case strings.Contains(normalized, "microsoft corporation") && strings.Contains(normalized, "virtual"):
		return "hyperv"
	case strings.Contains(normalized, "hyper-v") || strings.Contains(normalized, "hyperv"):
		return "hyperv"
	case strings.Contains(normalized, "xen"):
		return "xen"
	case strings.Contains(normalized, "parallels"):
		return "parallels"
	case strings.Contains(normalized, "bhyve"):
		return "bhyve"
	case strings.Contains(normalized, "proxmox"):
		return "proxmox"
	}
	return ""
}

func normalizeVirtualizationType(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.ReplaceAll(value, "_", "-")
	switch value {
	case "", "none":
		return ""
	case "microsoft", "hyper-v", "hyperv":
		return "hyperv"
	case "oracle", "virtualbox":
		return "virtualbox"
	case "qemu", "kvm", "qemu-kvm":
		return "kvm"
	case "vmware":
		return "vmware"
	case "xen", "parallels", "bhyve", "proxmox":
		return value
	default:
		return value
	}
}

func virtualizationDisplayName(virtType string, role string) string {
	base := map[string]string{
		"hyperv":     "Hyper-V",
		"kvm":        "KVM/QEMU",
		"vmware":     "VMware",
		"virtualbox": "VirtualBox",
		"xen":        "Xen",
		"parallels":  "Parallels",
		"bhyve":      "bhyve",
		"proxmox":    "Proxmox",
	}[virtType]
	if base == "" {
		base = strings.ToUpper(virtType[:1]) + virtType[1:]
	}
	if role == "host" {
		return base + " 宿主机"
	}
	return base + " 虚拟机"
}

func normalizeVirtualMachineStatus(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, "_", "-")
	switch value {
	case "running", "up", "on", "started", "active", "powerstate/running":
		return "running"
	case "stopped", "down", "off", "shut off", "shutoff", "poweredoff", "powerstate/poweredoff":
		return "stopped"
	case "paused", "suspended", "saved":
		return "paused"
	default:
		return value
	}
}

func normalizeVirtualMachines(machines []system.VirtualMachine) []system.VirtualMachine {
	if len(machines) == 0 {
		return nil
	}
	normalized := make([]system.VirtualMachine, 0, len(machines))
	seen := make(map[string]struct{}, len(machines))
	for _, machine := range machines {
		machine.Name = strings.TrimSpace(machine.Name)
		if machine.Name == "" {
			continue
		}
		machine.Id = strings.TrimSpace(machine.Id)
		machine.Status = normalizeVirtualMachineStatus(machine.Status)
		key := strings.ToLower(machine.Id)
		if key == "" {
			key = strings.ToLower(machine.Name)
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, machine)
	}
	return normalized
}

func parseVirtualBoxVMLine(line string) (string, string) {
	line = strings.TrimSpace(line)
	name := line
	id := ""
	if before, after, ok := strings.Cut(line, " {"); ok {
		name = strings.Trim(strings.TrimSpace(before), `"`)
		id = strings.TrimSuffix(strings.TrimSpace(after), "}")
	}
	return name, id
}

func parseNonEmptyLines(text string) []string {
	lines := strings.Split(text, "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			result = append(result, line)
		}
	}
	return result
}
