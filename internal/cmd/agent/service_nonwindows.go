//go:build !windows

package main

import "gutenacht.site/pulse/agent"

func runAgentProcess() error {
	a, err := agent.NewAgent()
	if err != nil {
		return err
	}
	return a.Start()
}
