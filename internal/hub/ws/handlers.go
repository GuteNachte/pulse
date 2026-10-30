package ws

import (
	"context"
	"errors"

	"github.com/fxamacker/cbor/v2"
	"github.com/lxzan/gws"
	"gutenacht.site/pulse/internal/common"
)

// ResponseHandler defines interface for handling agent responses.
// This is used by handleAgentRequest for legacy response handling.
type ResponseHandler interface {
	Handle(agentResponse common.AgentResponse) error
	HandleLegacy(rawData []byte) error
}

// BaseHandler provides a default implementation that can be embedded to make HandleLegacy optional
type BaseHandler struct{}

func (h *BaseHandler) HandleLegacy(rawData []byte) error {
	return errors.New("legacy format not supported")
}

////////////////////////////////////////////////////////////////////////////
// Device identity handling (used for WebSocket authentication)
////////////////////////////////////////////////////////////////////////////

// fingerprintHandler implements ResponseHandler for device identity requests.
type fingerprintHandler struct {
	result *common.FingerprintResponse
}

func (h *fingerprintHandler) HandleLegacy(rawData []byte) error {
	return cbor.Unmarshal(rawData, h.result)
}

func (h *fingerprintHandler) Handle(agentResponse common.AgentResponse) error {
	if agentResponse.Fingerprint != nil {
		*h.result = *agentResponse.Fingerprint
		return nil
	}
	return errors.New("no fingerprint data in response")
}

// GetFingerprint requests the agent's stable device identity over the already token-authenticated WebSocket.
func (ws *WsConn) GetFingerprint(ctx context.Context, needSysInfo bool) (common.FingerprintResponse, error) {
	if !ws.IsConnected() {
		return common.FingerprintResponse{}, gws.ErrConnClosed
	}

	req, err := ws.requestManager.SendRequest(ctx, common.CheckFingerprint, common.FingerprintRequest{
		NeedSysInfo: needSysInfo,
	})
	if err != nil {
		return common.FingerprintResponse{}, err
	}

	var result common.FingerprintResponse
	handler := &fingerprintHandler{result: &result}
	err = ws.handleAgentRequest(req, handler)
	return result, err
}
