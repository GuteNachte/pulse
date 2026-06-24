//go:build windows && !embedded_smartctl

package agent

import "errors"

func ensureEmbeddedSmartctl() (string, error) {
	return "", errors.New("embedded smartctl is not included in this build")
}
