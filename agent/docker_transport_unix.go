//go:build !windows

package agent

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
)

func configureDockerTransport(transport *http.Transport, dockerURL *url.URL) error {
	switch dockerURL.Scheme {
	case "unix":
		transport.DialContext = func(ctx context.Context, proto, addr string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "unix", dockerURL.Path)
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

// Test docker / podman sockets and return if one exists.
func getDockerHost() string {
	scheme := "unix://"
	socks := []string{"/var/run/docker.sock", fmt.Sprintf("/run/user/%v/podman/podman.sock", os.Getuid())}
	for _, sock := range socks {
		if _, err := os.Stat(sock); err == nil {
			return scheme + sock
		}
	}
	return scheme + socks[0]
}
