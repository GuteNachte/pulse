// Package pulse provides core application constants and version information
// which are used throughout the application.
package pulse

import "github.com/blang/semver"

// Version is the current version of the application.
// It is a variable so release builds can inject Agent/Hub versions with -ldflags -X.
var Version = "1.0.6-beta.1"

// BuildCommit and BuildTime are injected by release and local build scripts.
// Empty values mean the binary was built without build metadata, usually in a
// local development path.
var BuildCommit = ""
var BuildTime = ""

const (
	// AppName is the name of the application.
	AppName = "pulse"
)

// MinVersionCbor is the minimum supported version for CBOR compatibility.
var MinVersionCbor = semver.MustParse("0.12.0")

// MinVersionAgentResponse is the minimum supported version for AgentResponse compatibility.
var MinVersionAgentResponse = semver.MustParse("0.13.0")
