package system

// TODO: this is confusing, make common package with common/types common/helpers etc

import (
	"encoding/json"
	"time"

	"gutenacht.site/pulse/internal/entities/container"
	"gutenacht.site/pulse/internal/entities/service"
)

type Stats struct {
	Cpu            float64             `json:"cpu" cbor:"0,keyasint"`
	MaxCpu         float64             `json:"cpum,omitempty" cbor:"-"`
	Mem            float64             `json:"m" cbor:"2,keyasint"`
	MaxMem         float64             `json:"mm,omitempty" cbor:"-"`
	MemUsed        float64             `json:"mu" cbor:"3,keyasint"`
	MemPct         float64             `json:"mp" cbor:"4,keyasint"`
	MemBuffCache   float64             `json:"mb" cbor:"5,keyasint"`
	MemZfsArc      float64             `json:"mz,omitempty" cbor:"6,keyasint,omitempty"` // ZFS ARC memory
	Swap           float64             `json:"s,omitempty" cbor:"7,keyasint,omitempty"`
	SwapUsed       float64             `json:"su,omitempty" cbor:"8,keyasint,omitempty"`
	DiskTotal      float64             `json:"d" cbor:"9,keyasint"`
	DiskUsed       float64             `json:"du" cbor:"10,keyasint"`
	DiskPct        float64             `json:"dp" cbor:"11,keyasint"`
	DiskReadPs     float64             `json:"dr,omitzero" cbor:"12,keyasint,omitzero"`
	DiskWritePs    float64             `json:"dw,omitzero" cbor:"13,keyasint,omitzero"`
	MaxDiskReadPs  float64             `json:"drm,omitempty" cbor:"-"`
	MaxDiskWritePs float64             `json:"dwm,omitempty" cbor:"-"`
	NetworkSent    float64             `json:"ns,omitzero" cbor:"16,keyasint,omitzero"`
	NetworkRecv    float64             `json:"nr,omitzero" cbor:"17,keyasint,omitzero"`
	MaxNetworkSent float64             `json:"nsm,omitempty" cbor:"-"`
	MaxNetworkRecv float64             `json:"nrm,omitempty" cbor:"-"`
	Temperatures   map[string]float64  `json:"t,omitempty" cbor:"20,keyasint,omitempty"`
	ExtraFs        map[string]*FsStats `json:"efs,omitempty" cbor:"21,keyasint,omitempty"`
	GPUData        map[string]GPUData  `json:"g,omitempty" cbor:"22,keyasint,omitempty"`
	// LoadAvg1       float64             `json:"l1,omitempty" cbor:"23,keyasint,omitempty"`
	// LoadAvg5       float64             `json:"l5,omitempty" cbor:"24,keyasint,omitempty"`
	// LoadAvg15      float64             `json:"l15,omitempty" cbor:"25,keyasint,omitempty"`
	Bandwidth    [2]uint64 `json:"b,omitzero" cbor:"26,keyasint,omitzero"` // [sent bytes, recv bytes]
	MaxBandwidth [2]uint64 `json:"bm,omitzero" cbor:"-"`                   // [sent bytes, recv bytes]
	// TODO: remove other load fields in future release in favor of load avg array
	LoadAvg           [3]float64           `json:"la,omitempty" cbor:"28,keyasint"`
	Battery           [2]uint8             `json:"bat,omitzero" cbor:"29,keyasint,omitzero"`    // [percent, charge state, current]
	NetworkInterfaces map[string][4]uint64 `json:"ni,omitempty" cbor:"31,keyasint,omitempty"`   // [upload bytes, download bytes, total upload, total download]
	DiskIO            [2]uint64            `json:"dio,omitzero" cbor:"32,keyasint,omitzero"`    // [read bytes, write bytes]
	MaxDiskIO         [2]uint64            `json:"diom,omitzero" cbor:"-"`                      // [max read bytes, max write bytes]
	CpuBreakdown      []float64            `json:"cpub,omitempty" cbor:"33,keyasint,omitempty"` // [user, system, iowait, steal, idle]
	CpuCoresUsage     Uint8Slice           `json:"cpus,omitempty" cbor:"34,keyasint,omitempty"` // per-core busy usage [CPU0..]
	DiskIoStats       [6]float64           `json:"dios,omitzero" cbor:"35,keyasint,omitzero"`   // [read time %, write time %, io utilization %, r_await ms, w_await ms, weighted io %]
	MaxDiskIoStats    [6]float64           `json:"diosm,omitzero" cbor:"-"`                     // max values for DiskIoStats
}

// Uint8Slice wraps []uint8 to customize JSON encoding while keeping CBOR efficient.
// JSON: encodes as array of numbers (avoids base64 string).
// CBOR: falls back to default handling for []uint8 (byte string), keeping payload small.
type Uint8Slice []uint8

func (s Uint8Slice) MarshalJSON() ([]byte, error) {
	if s == nil {
		return []byte("null"), nil
	}
	// Convert to wider ints to force array-of-numbers encoding.
	arr := make([]uint16, len(s))
	for i, v := range s {
		arr[i] = uint16(v)
	}
	return json.Marshal(arr)
}

type GPUData struct {
	Name        string             `json:"n" cbor:"0,keyasint"`
	Type        string             `json:"gt,omitempty" cbor:"7,keyasint,omitempty"`
	Temperature float64            `json:"-"`
	MemoryUsed  float64            `json:"mu,omitempty,omitzero" cbor:"1,keyasint,omitempty,omitzero"`
	MemoryTotal float64            `json:"mt,omitempty,omitzero" cbor:"2,keyasint,omitempty,omitzero"`
	Usage       float64            `json:"u" cbor:"3,keyasint,omitempty"`
	Power       float64            `json:"p,omitempty" cbor:"4,keyasint,omitempty"`
	Count       float64            `json:"-"`
	Engines     map[string]float64 `json:"e,omitempty" cbor:"5,keyasint,omitempty"`
	PowerPkg    float64            `json:"pp,omitempty" cbor:"6,keyasint,omitempty"`
}

type FsStats struct {
	Time           time.Time `json:"-"`
	Root           bool      `json:"-"`
	Mountpoint     string    `json:"-"`
	Name           string    `json:"-"`
	DiskTotal      float64   `json:"d" cbor:"0,keyasint"`
	DiskUsed       float64   `json:"du" cbor:"1,keyasint"`
	TotalRead      uint64    `json:"-"`
	TotalWrite     uint64    `json:"-"`
	DiskReadPs     float64   `json:"r" cbor:"2,keyasint"`
	DiskWritePs    float64   `json:"w" cbor:"3,keyasint"`
	MaxDiskReadPS  float64   `json:"rm,omitempty" cbor:"-"`
	MaxDiskWritePS float64   `json:"wm,omitempty" cbor:"-"`
	// TODO: remove DiskReadPs and DiskWritePs in future release in favor of DiskReadBytes and DiskWriteBytes
	DiskReadBytes     uint64     `json:"rb" cbor:"6,keyasint,omitempty"`
	DiskWriteBytes    uint64     `json:"wb" cbor:"7,keyasint,omitempty"`
	MaxDiskReadBytes  uint64     `json:"rbm,omitempty" cbor:"-"`
	MaxDiskWriteBytes uint64     `json:"wbm,omitempty" cbor:"-"`
	DiskIoStats       [6]float64 `json:"dios,omitzero" cbor:"8,keyasint,omitzero"` // [read time %, write time %, io utilization %, r_await ms, w_await ms, weighted io %]
	MaxDiskIoStats    [6]float64 `json:"diosm,omitzero" cbor:"-"`                  // max values for DiskIoStats
}

type NetIoStats struct {
	BytesRecv uint64
	BytesSent uint64
	Time      time.Time
	Name      string
}

type Os = uint8

const (
	Linux Os = iota
	Darwin
	Windows
	Freebsd
)

type ConnectionType = uint8

const (
	ConnectionTypeNone      ConnectionType = 0
	ConnectionTypeWebSocket ConnectionType = 2
)

// Core system data that is needed in All Systems table
type Info struct {
	Hostname      string `json:"h,omitempty" cbor:"0,keyasint,omitempty"` // deprecated - moved to Details struct
	KernelVersion string `json:"k,omitempty" cbor:"1,keyasint,omitempty"` // deprecated - moved to Details struct
	Cores         int    `json:"c,omitzero" cbor:"2,keyasint,omitzero"`   // deprecated - moved to Details struct
	// Threads is needed in Info struct to calculate load average thresholds
	Threads       int     `json:"t,omitempty" cbor:"3,keyasint,omitempty"`
	CpuModel      string  `json:"m,omitempty" cbor:"4,keyasint,omitempty"` // deprecated - moved to Details struct
	Uptime        uint64  `json:"u" cbor:"5,keyasint"`
	Cpu           float64 `json:"cpu" cbor:"6,keyasint"`
	MemPct        float64 `json:"mp" cbor:"7,keyasint"`
	DiskPct       float64 `json:"dp" cbor:"8,keyasint"`
	Bandwidth     float64 `json:"b,omitzero" cbor:"9,keyasint"` // deprecated in favor of BandwidthBytes
	AgentVersion  string  `json:"v" cbor:"10,keyasint"`
	Podman        bool    `json:"p,omitempty" cbor:"11,keyasint,omitempty"` // deprecated - moved to Details struct
	GpuPct        float64 `json:"g,omitempty" cbor:"12,keyasint,omitempty"`
	DashboardTemp float64 `json:"dt,omitempty" cbor:"13,keyasint,omitempty"`
	Os            Os      `json:"os,omitempty" cbor:"14,keyasint,omitempty"` // deprecated - moved to Details struct
	// LoadAvg1       float64 `json:"l1,omitempty" cbor:"15,keyasint,omitempty"`  // deprecated - use `la` array instead
	// LoadAvg5       float64 `json:"l5,omitempty" cbor:"16,keyasint,omitempty"`  // deprecated - use `la` array instead
	// LoadAvg15      float64 `json:"l15,omitempty" cbor:"17,keyasint,omitempty"` // deprecated - use `la` array instead

	BandwidthBytes            uint64             `json:"bb" cbor:"18,keyasint"`
	LoadAvg                   [3]float64         `json:"la,omitempty" cbor:"19,keyasint"`
	ConnectionType            ConnectionType     `json:"ct,omitempty" cbor:"20,keyasint,omitempty,omitzero"`
	ExtraFsPct                map[string]float64 `json:"efs,omitempty" cbor:"21,keyasint,omitempty"`
	Services                  []uint16           `json:"sv,omitempty" cbor:"22,keyasint,omitempty"`  // [totalServices, numFailedServices]
	Battery                   [2]uint8           `json:"bat,omitzero" cbor:"23,keyasint,omitzero"`   // [percent, charge state]
	ManagedServices           []uint16           `json:"msv,omitempty" cbor:"24,keyasint,omitempty"` // [totalServices, nonRunningServices]
	Capabilities              *AgentCapabilities `json:"cap,omitempty" cbor:"25,keyasint,omitempty"`
	GpuSupported              bool               `json:"gs,omitempty" cbor:"26,keyasint,omitempty"`
	RemoteIP                  string             `json:"ip,omitempty" cbor:"27,keyasint,omitempty"`
	BandwidthBytesByDirection [2]uint64          `json:"bbd,omitzero" cbor:"28,keyasint,omitzero"` // [sent bytes/s, recv bytes/s]
}

type AgentCapabilities struct {
	Platform           string                      `json:"platform" cbor:"0,keyasint"`
	Arch               string                      `json:"arch" cbor:"1,keyasint"`
	AgentVersion       string                      `json:"agent_version" cbor:"2,keyasint"`
	InstallMethod      string                      `json:"install_method,omitempty" cbor:"3,keyasint,omitempty"`
	RunMode            string                      `json:"run_mode,omitempty" cbor:"4,keyasint,omitempty"`
	AgentProfile       string                      `json:"agent_profile,omitempty" cbor:"10,keyasint,omitempty"`
	Privilege          string                      `json:"privilege" cbor:"5,keyasint"`
	Collection         []string                    `json:"collection" cbor:"6,keyasint"`
	Operations         []string                    `json:"operations" cbor:"7,keyasint"`
	UnsupportedReasons map[string]string           `json:"unsupported_reasons,omitempty" cbor:"8,keyasint,omitempty"`
	LastUpdate         *AgentUpdateResult          `json:"last_update,omitempty" cbor:"9,keyasint,omitempty"`
	CollectionResults  map[string]CapabilityStatus `json:"collection_results,omitempty" cbor:"11,keyasint,omitempty"`
	Diagnostics        map[string]CapabilityStatus `json:"diagnostics,omitempty" cbor:"12,keyasint,omitempty"`
}

type AgentUpdateResult struct {
	Status  string `json:"status" cbor:"0,keyasint"`
	Version string `json:"version,omitempty" cbor:"1,keyasint,omitempty"`
	Message string `json:"message,omitempty" cbor:"2,keyasint,omitempty"`
	Time    string `json:"time,omitempty" cbor:"3,keyasint,omitempty"`
}

type CapabilityState string

const (
	CapabilityStateConfirmed   CapabilityState = "confirmed"
	CapabilityStateUnavailable CapabilityState = "unavailable"
	CapabilityStateUnsupported CapabilityState = "unsupported"
	CapabilityStateUnknown     CapabilityState = "unknown"
	CapabilityStateFailed      CapabilityState = "failed"
	CapabilityStateStale       CapabilityState = "stale"
)

type CapabilityStatus struct {
	State     CapabilityState `json:"state" cbor:"0,keyasint"`
	CheckedAt string          `json:"checked_at,omitempty" cbor:"1,keyasint,omitempty"`
	Reason    string          `json:"reason,omitempty" cbor:"2,keyasint,omitempty"`
	Detail    string          `json:"detail,omitempty" cbor:"3,keyasint,omitempty"`
	Count     int             `json:"count,omitempty" cbor:"4,keyasint,omitempty"`
}

type NetworkInterfaceDetails struct {
	Name        string   `json:"name" cbor:"0,keyasint"`
	DisplayName string   `json:"display_name,omitempty" cbor:"1,keyasint,omitempty"`
	Mac         string   `json:"mac,omitempty" cbor:"2,keyasint,omitempty"`
	LinkSpeed   uint64   `json:"link_speed,omitempty" cbor:"3,keyasint,omitempty"`
	Status      string   `json:"status,omitempty" cbor:"4,keyasint,omitempty"`
	IPMethod    string   `json:"ip_method,omitempty" cbor:"5,keyasint,omitempty"`
	IPv4        []string `json:"ipv4,omitempty" cbor:"6,keyasint,omitempty"`
	IPv6        []string `json:"ipv6,omitempty" cbor:"7,keyasint,omitempty"`
	Gateways    []string `json:"gateways,omitempty" cbor:"8,keyasint,omitempty"`
	DNSServers  []string `json:"dns_servers,omitempty" cbor:"9,keyasint,omitempty"`
}

type MemoryModuleDetails struct {
	Locator       string `json:"locator,omitempty" cbor:"0,keyasint,omitempty"`
	Capacity      uint64 `json:"capacity,omitempty" cbor:"1,keyasint,omitempty"`
	MemoryType    string `json:"memory_type,omitempty" cbor:"2,keyasint,omitempty"`
	SpeedMhz      uint64 `json:"speed_mhz,omitempty" cbor:"3,keyasint,omitempty"`
	ConfiguredMhz uint64 `json:"configured_mhz,omitempty" cbor:"4,keyasint,omitempty"`
	Manufacturer  string `json:"manufacturer,omitempty" cbor:"5,keyasint,omitempty"`
	PartNumber    string `json:"part_number,omitempty" cbor:"6,keyasint,omitempty"`
}

type VirtualizationDetails struct {
	Type            string           `json:"type,omitempty" cbor:"0,keyasint,omitempty"`
	Role            string           `json:"role,omitempty" cbor:"1,keyasint,omitempty"`
	Name            string           `json:"name,omitempty" cbor:"2,keyasint,omitempty"`
	VirtualMachines []VirtualMachine `json:"virtual_machines,omitempty" cbor:"3,keyasint,omitempty"`
}

type VirtualMachine struct {
	Id     string `json:"id,omitempty" cbor:"0,keyasint,omitempty"`
	Name   string `json:"name" cbor:"1,keyasint"`
	Status string `json:"status,omitempty" cbor:"2,keyasint,omitempty"`
	Vcpu   int    `json:"vcpu,omitempty" cbor:"3,keyasint,omitempty"`
	Memory uint64 `json:"memory,omitempty" cbor:"4,keyasint,omitempty"`
}

func (v VirtualizationDetails) HasData() bool {
	return v.Type != "" || v.Role != "" || v.Name != "" || len(v.VirtualMachines) > 0
}

// Data that does not change during process lifetime and is not needed in All Systems table
type Details struct {
	Hostname                string                    `cbor:"0,keyasint"`
	Kernel                  string                    `cbor:"1,keyasint,omitempty"`
	Cores                   int                       `cbor:"2,keyasint"`
	Threads                 int                       `cbor:"3,keyasint"`
	CpuModel                string                    `cbor:"4,keyasint"`
	CpuVendor               string                    `cbor:"17,keyasint,omitempty"`
	CpuFrequencyMhz         float64                   `cbor:"14,keyasint,omitempty"`
	Os                      Os                        `cbor:"5,keyasint"`
	OsName                  string                    `cbor:"6,keyasint"`
	Arch                    string                    `cbor:"7,keyasint"`
	Podman                  bool                      `cbor:"8,keyasint,omitempty"`
	MemoryTotal             uint64                    `cbor:"9,keyasint"`
	SmartInterval           time.Duration             `cbor:"10,keyasint,omitempty"`
	ContainerRuntimeName    string                    `cbor:"11,keyasint,omitempty"`
	ContainerRuntimeVersion string                    `cbor:"12,keyasint,omitempty"`
	NetworkInterfaces       []NetworkInterfaceDetails `cbor:"13,keyasint,omitempty"`
	MemoryModules           []MemoryModuleDetails     `cbor:"15,keyasint,omitempty"`
	Virtualization          VirtualizationDetails     `cbor:"16,keyasint,omitempty"`
}

// Final data structure to return to the hub
type CombinedData struct {
	Stats      Stats              `json:"stats" cbor:"0,keyasint"`
	Info       Info               `json:"info" cbor:"1,keyasint"`
	Containers []*container.Stats `json:"container" cbor:"2,keyasint"`
	Details    *Details           `cbor:"4,keyasint,omitempty"`
	Services   []*service.Service `json:"services,omitempty" cbor:"5,keyasint,omitempty"`
	Software   []*service.Service `json:"software,omitempty" cbor:"6,keyasint,omitempty"`
}
