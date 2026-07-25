package hub

const portableBackupSchemaV1 = "pulse.instance.backup.v1"

type portableBackupManifest struct {
	Schema            string                 `json:"schema"`
	BackupID          string                 `json:"backup_id"`
	Scope             string                 `json:"scope"`
	PulseVersion      string                 `json:"pulse_version"`
	PocketBaseVersion string                 `json:"pocketbase_version"`
	DatabaseSchema    string                 `json:"database_schema"`
	CreatedAt         string                 `json:"created_at"`
	SourceInstance    string                 `json:"source_instance"`
	Payloads          []archiveEntry         `json:"payloads"`
	External          portableExternalStores `json:"external"`
}

type portableExternalStores struct {
	AssetMedia portableExternalStore `json:"asset_media"`
}

type portableExternalStore struct {
	Included bool   `json:"included"`
	Files    int    `json:"files"`
	Bytes    uint64 `json:"bytes"`
}

type restoreStorageTarget struct {
	AssetMediaRoot string `json:"asset_media_root"`
}

type backupCheck struct {
	Level   string `json:"level"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type portableBackupPreflight struct {
	Key      string                 `json:"key"`
	Status   string                 `json:"status"`
	Manifest portableBackupManifest `json:"manifest"`
	Target   restoreStorageTarget   `json:"target"`
	Checks   []backupCheck          `json:"checks"`
	Blockers []backupCheck          `json:"blockers"`
	Warnings []backupCheck          `json:"warnings"`
}

type portableRestoreTask struct {
	ID                    string                 `json:"id"`
	Key                   string                 `json:"key"`
	Status                string                 `json:"status"`
	Stage                 string                 `json:"stage"`
	SafetyBackupKey       string                 `json:"safety_backup_key"`
	SafetyNativeBackupKey string                 `json:"safety_native_backup_key"`
	SafetyAssetMediaRoot  string                 `json:"safety_asset_media_root"`
	NativeBackupKey       string                 `json:"native_backup_key"`
	Target                restoreStorageTarget   `json:"target"`
	Manifest              portableBackupManifest `json:"manifest"`
	Error                 string                 `json:"error,omitempty"`
	UpdatedAt             string                 `json:"updated_at"`
}
