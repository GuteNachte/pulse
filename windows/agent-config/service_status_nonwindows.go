//go:build !windows

package main

func readAgentServiceStatus() string {
	return "仅支持 Windows"
}
