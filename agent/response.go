package agent

import (
	"strings"
	"unicode/utf8"

	"github.com/fxamacker/cbor/v2"
	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/entities/smart"
	"gutenacht.site/pulse/internal/entities/system"
)

// newAgentResponse creates an AgentResponse using legacy typed fields.
// This maintains backward compatibility with <= 0.17 hubs that expect specific fields.
func newAgentResponse(data any, requestID *uint32) common.AgentResponse {
	response := common.AgentResponse{Id: requestID}
	switch v := data.(type) {
	case *system.CombinedData:
		response.SystemData = v
		response.Data, _ = cbor.Marshal(v)
	case *common.FingerprintResponse:
		response.Fingerprint = v
	case string:
		response.String = &v
	case map[string]smart.SmartData:
		response.SmartData = v
	case common.OperationResult:
		v.Message = sanitizeResponseText(v.Message)
		response.Data, _ = cbor.Marshal(v)
	default:
		// For unknown types, use the generic Data field
		response.Data, _ = cbor.Marshal(data)
	}
	return response
}

func sanitizeResponseText(text string) string {
	text = strings.TrimSpace(text)
	if text == "" || utf8.ValidString(text) {
		return text
	}
	return strings.TrimSpace(strings.ToValidUTF8(text, ""))
}
