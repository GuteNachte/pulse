//go:build windows

package agent

import (
	"context"
	"encoding/json"
	"os/exec"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/entities/system"
)

type windowsComputerSystemRow struct {
	Manufacturer      string
	Model             string
	HypervisorPresent bool
}

type windowsHyperVVMRow struct {
	Id               string
	Name             string
	State            string
	ProcessorCount   int
	MemoryAssigned   uint64
	MemoryStartup    uint64
	MemoryStartupRam uint64
}

func detectVirtualizationDetails() system.VirtualizationDetails {
	if details := detectWindowsVirtualizationHostDetails(); details.HasData() {
		return details
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	command := `Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,HypervisorPresent | ConvertTo-Json -Compress`
	out, err := runPowerShellCommand(ctx, command)
	if err != nil || len(out) == 0 {
		return system.VirtualizationDetails{}
	}

	var row windowsComputerSystemRow
	if err := json.Unmarshal(out, &row); err != nil {
		return system.VirtualizationDetails{}
	}

	virtType := classifyVirtualizationText(strings.Join([]string{row.Manufacturer, row.Model}, " "))
	if virtType == "" && row.HypervisorPresent && strings.Contains(strings.ToLower(row.Model), "virtual") {
		virtType = "hyperv"
	}
	if virtType == "" {
		return system.VirtualizationDetails{}
	}
	return makeVirtualizationDetails(virtType, "guest")
}

func detectWindowsVirtualizationHostDetails() system.VirtualizationDetails {
	if machines := detectWindowsHyperVVirtualMachines(); len(machines) > 0 {
		return makeVirtualizationHostDetails("hyperv", machines)
	}
	if machines := detectWindowsVirtualBoxVirtualMachines(); len(machines) > 0 {
		return makeVirtualizationHostDetails("virtualbox", machines)
	}
	return system.VirtualizationDetails{}
}

func detectWindowsHyperVVirtualMachines() []system.VirtualMachine {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	command := `if (Get-Command Get-VM -ErrorAction SilentlyContinue) { Get-VM | Select-Object Id,Name,State,ProcessorCount,MemoryAssigned,MemoryStartup,MemoryStartupRam | ConvertTo-Json -Compress }`
	out, err := runPowerShellCommand(ctx, command)
	if err != nil || len(out) == 0 {
		return nil
	}

	var rows []windowsHyperVVMRow
	if !unmarshalJSONList(out, &rows) {
		return nil
	}
	machines := make([]system.VirtualMachine, 0, len(rows))
	for _, row := range rows {
		memory := row.MemoryAssigned
		if memory == 0 {
			memory = row.MemoryStartup
		}
		if memory == 0 {
			memory = row.MemoryStartupRam
		}
		machines = append(machines, system.VirtualMachine{
			Id:     row.Id,
			Name:   row.Name,
			Status: row.State,
			Vcpu:   row.ProcessorCount,
			Memory: memory,
		})
	}
	return machines
}

func detectWindowsVirtualBoxVirtualMachines() []system.VirtualMachine {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "VBoxManage.exe", "list", "vms").Output()
	if err != nil {
		return nil
	}
	lines := parseNonEmptyLines(string(out))
	if len(lines) == 0 {
		return nil
	}
	running := detectWindowsVirtualBoxRunningVMs()
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

func detectWindowsVirtualBoxRunningVMs() map[string]struct{} {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "VBoxManage.exe", "list", "runningvms").Output()
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

func unmarshalJSONList[T any](raw []byte, rows *[]T) bool {
	if err := json.Unmarshal(raw, rows); err == nil {
		return true
	}
	var single T
	if err := json.Unmarshal(raw, &single); err != nil {
		return false
	}
	*rows = []T{single}
	return true
}
