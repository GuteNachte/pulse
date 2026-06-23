//go:build linux

package agent

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/entities/system"
)

var linuxDmiVirtualizationRoot = "/sys/class/dmi/id"

func detectVirtualizationDetails() system.VirtualizationDetails {
	if details := detectLinuxVirtualizationHostDetails(); details.HasData() {
		return details
	}

	if virtType := detectLinuxVirtualizationWithSystemd(); virtType != "" {
		return makeVirtualizationDetails(virtType, "guest")
	}

	values := []string{
		readLinuxDmiValue("sys_vendor"),
		readLinuxDmiValue("product_name"),
		readLinuxDmiValue("product_version"),
		readLinuxDmiValue("board_vendor"),
		readLinuxDmiValue("bios_vendor"),
	}
	if virtType := classifyVirtualizationText(strings.Join(values, " ")); virtType != "" {
		return makeVirtualizationDetails(virtType, "guest")
	}
	return system.VirtualizationDetails{}
}

func detectLinuxVirtualizationHostDetails() system.VirtualizationDetails {
	if machines := detectVirshVirtualMachines(); len(machines) > 0 {
		return makeVirtualizationHostDetails("kvm", machines)
	}
	if machines := detectProxmoxVirtualMachines(); len(machines) > 0 {
		return makeVirtualizationHostDetails("proxmox", machines)
	}
	if machines := detectVirtualBoxVirtualMachines(); len(machines) > 0 {
		return makeVirtualizationHostDetails("virtualbox", machines)
	}
	return system.VirtualizationDetails{}
}

func detectLinuxVirtualizationWithSystemd() string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "systemd-detect-virt", "--vm").Output()
	if err != nil {
		return ""
	}
	return normalizeVirtualizationType(strings.TrimSpace(string(out)))
}

func readLinuxDmiValue(name string) string {
	raw, err := os.ReadFile(filepath.Join(linuxDmiVirtualizationRoot, name))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

func detectVirshVirtualMachines() []system.VirtualMachine {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "virsh", "list", "--all", "--name").Output()
	if err != nil {
		return nil
	}
	names := parseNonEmptyLines(string(out))
	if len(names) == 0 {
		return nil
	}
	machines := make([]system.VirtualMachine, 0, len(names))
	for _, name := range names {
		machines = append(machines, system.VirtualMachine{
			Id:     name,
			Name:   name,
			Status: detectVirshVirtualMachineStatus(name),
		})
	}
	return machines
}

func detectVirshVirtualMachineStatus(name string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "virsh", "domstate", name).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

type proxmoxVirtualMachineRow struct {
	Vmid   int    `json:"vmid"`
	Name   string `json:"name"`
	Status string `json:"status"`
	Cpus   int    `json:"cpus"`
	Mem    uint64 `json:"mem"`
	MaxMem uint64 `json:"maxmem"`
}

func detectProxmoxVirtualMachines() []system.VirtualMachine {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "qm", "list", "--output-format", "json").Output()
	if err == nil && len(out) > 0 {
		if machines := parseProxmoxVirtualMachinesJSON(out); len(machines) > 0 {
			return machines
		}
	}

	ctx, cancel = context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	out, err = exec.CommandContext(ctx, "qm", "list").Output()
	if err != nil || len(out) == 0 {
		return nil
	}
	return parseProxmoxVirtualMachinesTable(string(out))
}

func parseProxmoxVirtualMachinesJSON(out []byte) []system.VirtualMachine {
	var rows []proxmoxVirtualMachineRow
	if err := json.Unmarshal(out, &rows); err != nil {
		return nil
	}
	return proxmoxRowsToVirtualMachines(rows)
}

func proxmoxRowsToVirtualMachines(rows []proxmoxVirtualMachineRow) []system.VirtualMachine {
	machines := make([]system.VirtualMachine, 0, len(rows))
	for _, row := range rows {
		name := strings.TrimSpace(row.Name)
		if name == "" {
			name = strconv.Itoa(row.Vmid)
		}
		memory := row.MaxMem
		if memory == 0 {
			memory = row.Mem
		}
		machines = append(machines, system.VirtualMachine{
			Id:     strconv.Itoa(row.Vmid),
			Name:   name,
			Status: row.Status,
			Vcpu:   row.Cpus,
			Memory: memory,
		})
	}
	return machines
}

func parseProxmoxVirtualMachinesTable(text string) []system.VirtualMachine {
	lines := parseNonEmptyLines(text)
	if len(lines) <= 1 {
		return nil
	}
	rows := make([]proxmoxVirtualMachineRow, 0, len(lines)-1)
	for _, line := range lines[1:] {
		parts := strings.Fields(line)
		if len(parts) < 3 {
			continue
		}
		vmid, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}
		memMb := uint64(0)
		if len(parts) >= 4 {
			if parsed, err := strconv.ParseUint(parts[3], 10, 64); err == nil {
				memMb = parsed
			}
		}
		rows = append(rows, proxmoxVirtualMachineRow{
			Vmid:   vmid,
			Name:   parts[1],
			Status: parts[2],
			MaxMem: memMb * 1024 * 1024,
		})
	}
	return proxmoxRowsToVirtualMachines(rows)
}

func detectVirtualBoxVirtualMachines() []system.VirtualMachine {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "VBoxManage", "list", "vms").Output()
	if err != nil {
		return nil
	}
	lines := parseNonEmptyLines(string(out))
	if len(lines) == 0 {
		return nil
	}
	running := detectVirtualBoxRunningVMs()
	machines := make([]system.VirtualMachine, 0, len(lines))
	for _, line := range lines {
		name, id := parseVirtualBoxVMLine(line)
		status := "stopped"
		if _, ok := running[name]; ok {
			status = "running"
		}
		if _, ok := running[id]; ok {
			status = "running"
		}
		machines = append(machines, system.VirtualMachine{
			Id:     id,
			Name:   name,
			Status: status,
		})
	}
	return machines
}

func detectVirtualBoxRunningVMs() map[string]struct{} {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "VBoxManage", "list", "runningvms").Output()
	if err != nil {
		return nil
	}
	running := make(map[string]struct{})
	for _, line := range parseNonEmptyLines(string(out)) {
		name, id := parseVirtualBoxVMLine(line)
		if name != "" {
			running[name] = struct{}{}
		}
		if id != "" {
			running[id] = struct{}{}
		}
	}
	return running
}
