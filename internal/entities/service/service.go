package service

type State uint8

const (
	StateUnknown State = iota
	StateRunning
	StateStopped
	StatePaused
	StateStarting
	StateStopping
	StateOther
)

type Service struct {
	Name        string `json:"name" cbor:"0,keyasint"`
	DisplayName string `json:"displayName,omitempty" cbor:"1,keyasint,omitempty"`
	Platform    string `json:"platform" cbor:"2,keyasint"`
	State       State  `json:"state" cbor:"3,keyasint"`
	StartType   string `json:"startType,omitempty" cbor:"4,keyasint,omitempty"`
}
