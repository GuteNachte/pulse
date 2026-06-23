//go:build testing

package agent

import "testing"

func TestIsContainerRelatedSoftwareName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		want bool
	}{
		{name: "docker.exe", want: true},
		{name: "Docker Desktop.exe", want: true},
		{name: "com.docker.backend.exe", want: true},
		{name: "containerd.exe", want: true},
		{name: "containerd-shim-runc-v2.exe", want: true},
		{name: "podman.exe", want: true},
		{name: "podman-remote.exe", want: true},
		{name: "NVDisplay.Container.exe", want: false},
		{name: "nvcontainer.exe", want: false},
		{name: "explorer.exe", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isContainerRelatedSoftwareName(tt.name); got != tt.want {
				t.Fatalf("isContainerRelatedSoftwareName(%q) = %v, want %v", tt.name, got, tt.want)
			}
		})
	}
}
