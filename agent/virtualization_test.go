package agent

import (
	"testing"

	"gutenacht.site/pulse/internal/entities/system"
)

func TestClassifyVirtualizationText(t *testing.T) {
	tests := []struct {
		name string
		text string
		want string
	}{
		{name: "hyperv", text: "Microsoft Corporation Virtual Machine", want: "hyperv"},
		{name: "kvm", text: "QEMU Standard PC (Q35 + ICH9, 2009)", want: "kvm"},
		{name: "vmware", text: "VMware, Inc. VMware Virtual Platform", want: "vmware"},
		{name: "virtualbox", text: "innotek GmbH VirtualBox", want: "virtualbox"},
		{name: "physical", text: "Dell Inc. OptiPlex 7090", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := classifyVirtualizationText(tt.text); got != tt.want {
				t.Fatalf("classifyVirtualizationText(%q) = %q, want %q", tt.text, got, tt.want)
			}
		})
	}
}

func TestMakeVirtualizationDetails(t *testing.T) {
	details := makeVirtualizationDetails("qemu-kvm", "guest")
	if details.Type != "kvm" {
		t.Fatalf("expected normalized type kvm, got %q", details.Type)
	}
	if details.Role != "guest" {
		t.Fatalf("expected guest role, got %q", details.Role)
	}
	if details.Name != "KVM/QEMU 虚拟机" {
		t.Fatalf("expected display name, got %q", details.Name)
	}
}

func TestNormalizeVirtualMachines(t *testing.T) {
	machines := normalizeVirtualMachines([]system.VirtualMachine{
		{Id: "vm-1", Name: "  VM One  ", Status: "Running"},
		{Id: "vm-1", Name: "Duplicate", Status: "Stopped"},
		{Name: "VM Two", Status: "shut off"},
		{Name: " "},
	})
	if len(machines) != 2 {
		t.Fatalf("expected 2 normalized machines, got %d", len(machines))
	}
	if machines[0].Name != "VM One" || machines[0].Status != "running" {
		t.Fatalf("unexpected first vm: %+v", machines[0])
	}
	if machines[1].Name != "VM Two" || machines[1].Status != "stopped" {
		t.Fatalf("unexpected second vm: %+v", machines[1])
	}
}

func TestParseVirtualBoxVMLine(t *testing.T) {
	name, id := parseVirtualBoxVMLine(`"ubuntu-dev" {8eec8c64-fc56-44cc-a2d1-8d7f0ff6b858}`)
	if name != "ubuntu-dev" {
		t.Fatalf("expected vm name ubuntu-dev, got %q", name)
	}
	if id != "8eec8c64-fc56-44cc-a2d1-8d7f0ff6b858" {
		t.Fatalf("expected parsed id, got %q", id)
	}
}
