package main

import "testing"

func TestSharedDataDirUsesInstallerValue(t *testing.T) {
	t.Setenv("DATA_DIR", `D:\Pulse Agent\data`)
	if actual := sharedDataDir(); actual != `D:\Pulse Agent\data` {
		t.Fatalf("sharedDataDir() = %q", actual)
	}
}
