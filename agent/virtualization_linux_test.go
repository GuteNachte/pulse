//go:build linux

package agent

import "testing"

func TestParseProxmoxVirtualMachinesTable(t *testing.T) {
	machines := parseProxmoxVirtualMachinesTable(`VMID NAME                 STATUS     MEM(MB)    BOOTDISK(GB) PID
100  ubuntu-dev           running    4096       32.00        1234
101  win-test             stopped    8192       64.00        0`)
	if len(machines) != 2 {
		t.Fatalf("expected 2 proxmox machines, got %d", len(machines))
	}
	if machines[0].Id != "100" || machines[0].Name != "ubuntu-dev" || machines[0].Status != "running" {
		t.Fatalf("unexpected first proxmox vm: %+v", machines[0])
	}
	if machines[1].Memory != 8192*1024*1024 {
		t.Fatalf("expected memory bytes, got %d", machines[1].Memory)
	}
}
