//go:build windows

package main

import (
	"fmt"
	"log/slog"

	"golang.org/x/sys/windows/svc"
	"gutenacht.site/pulse/agent"
)

const windowsServiceName = "pulse-agent"

// runAgentProcess starts the normal foreground agent unless Windows launched
// the executable through the Service Control Manager.
func runAgentProcess() error {
	isService, err := svc.IsWindowsService()
	if err != nil {
		return fmt.Errorf("detect Windows service mode: %w", err)
	}
	if !isService {
		a, err := agent.NewAgent()
		if err != nil {
			return fmt.Errorf("create agent: %w", err)
		}
		return a.Start()
	}
	return svc.Run(windowsServiceName, &windowsAgentService{})
}

type windowsAgentService struct{}

func (s *windowsAgentService) Execute(_ []string, requests <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	a, err := agent.NewAgent()
	if err != nil {
		slog.Error("create agent for Windows service", "err", err)
		return false, 1
	}
	done := make(chan error, 1)
	go func() { done <- a.Start() }()
	changes <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}

	for {
		select {
		case err := <-done:
			if err != nil {
				slog.Error("agent stopped unexpectedly", "err", err)
				return false, 1
			}
			return false, 0
		case request, ok := <-requests:
			if !ok {
				return false, 0
			}
			switch request.Cmd {
			case svc.Stop, svc.Shutdown:
				changes <- svc.Status{State: svc.StopPending}
				if err := a.Stop(); err != nil {
					slog.Error("stop agent Windows service", "err", err)
					return false, 1
				}
				return false, 0
			default:
				slog.Warn("unsupported Windows service control request", "cmd", request.Cmd)
			}
		}
	}
}
