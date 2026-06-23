//go:build windows

package agent

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Microsoft/go-winio"
)

const defaultWindowsDockerPipe = `\\.\pipe\docker_engine`
const dockerDesktopLinuxPipe = `\\.\pipe\dockerDesktopLinuxEngine`

func configureDockerTransport(transport *http.Transport, dockerURL *url.URL) error {
	switch dockerURL.Scheme {
	case "npipe":
		pipePath := dockerURL.Path
		if pipePath == "" {
			pipePath = dockerURL.Host
		}
		pipePath = normalizeWindowsPipePath(pipePath)
		transport.DialContext = func(ctx context.Context, proto, addr string) (net.Conn, error) {
			return winio.DialPipeContext(ctx, pipePath)
		}
	case "tcp", "http", "https":
		transport.DialContext = func(ctx context.Context, proto, addr string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "tcp", dockerURL.Host)
		}
	default:
		return fmt.Errorf("unsupported docker host scheme: %s", dockerURL.Scheme)
	}
	return nil
}

// Windows Docker Desktop / Engine exposes its API through this named pipe by default.
func getDockerHost() string {
	if windowsDockerPipeAvailable(dockerDesktopLinuxPipe) {
		return "npipe:////./pipe/dockerDesktopLinuxEngine"
	}
	return "npipe:////./pipe/docker_engine"
}

func windowsDockerPipeAvailable(pipePath string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()

	conn, err := winio.DialPipeContext(ctx, pipePath)
	if err != nil {
		return false
	}
	defer conn.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://localhost/version", nil)
	if err != nil {
		return false
	}
	if err := req.Write(conn); err != nil {
		return false
	}
	resp, err := http.ReadResponse(bufio.NewReader(conn), req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode == http.StatusOK
}

func normalizeWindowsPipePath(pipePath string) string {
	pipePath = strings.TrimSpace(pipePath)
	pipePath = strings.ReplaceAll(pipePath, "/", `\`)
	pipePath = strings.TrimLeft(pipePath, `\`)
	if strings.HasPrefix(pipePath, `.\`) {
		return `\\` + pipePath
	}
	if strings.HasPrefix(strings.ToLower(pipePath), `pipe\`) {
		return `\\.\` + pipePath
	}
	if strings.HasPrefix(pipePath, `\\`) {
		return pipePath
	}
	return defaultWindowsDockerPipe
}
