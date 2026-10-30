//go:build testing

package systems

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"gutenacht.site/pulse/internal/hub/transport"
)

func TestExpectedAgentDisconnectError(t *testing.T) {
	assert.True(t, isExpectedAgentDisconnectError(transport.ErrWebSocketNotConnected))
	assert.True(t, isExpectedAgentDisconnectError(errors.New("no websocket connection")))
	assert.False(t, isExpectedAgentDisconnectError(errors.New("agent returned malformed data")))
	assert.False(t, isExpectedAgentDisconnectError(nil))
}
