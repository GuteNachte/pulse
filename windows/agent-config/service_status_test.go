package main

import "testing"

func TestReadAgentServiceStatusReturnsValue(t *testing.T) {
	if status := readAgentServiceStatus(); status == "" {
		t.Fatal("readAgentServiceStatus returned an empty status")
	}
}
