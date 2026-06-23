//go:build testing

package hub

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
	_ "gutenacht.site/pulse/internal/migrations"
)

func TestResolveAgentReleaseFilePath(t *testing.T) {
	dataDir := t.TempDir()
	releaseDir := filepath.Join(dataDir, "agent-releases", "1.0.0")
	require.NoError(t, os.MkdirAll(releaseDir, 0755))
	expectedPath := filepath.Join(releaseDir, "pulse-agent_windows_amd64.exe")
	require.NoError(t, os.WriteFile(expectedPath, []byte("agent"), 0644))

	resolved, err := resolveAgentReleaseFilePath(dataDir, "1.0.0", "pulse-agent_windows_amd64.exe")
	require.NoError(t, err)
	require.Equal(t, expectedPath, resolved)
}

func TestResolveAgentReleaseFilePathAllowsManifest(t *testing.T) {
	dataDir := t.TempDir()
	releaseDir := filepath.Join(dataDir, "agent-releases", "1.0.0")
	require.NoError(t, os.MkdirAll(releaseDir, 0755))
	expectedPath := filepath.Join(releaseDir, "manifest.json")
	require.NoError(t, os.WriteFile(expectedPath, []byte(`{"version":"1.0.0"}`), 0644))

	resolved, err := resolveAgentReleaseFilePath(dataDir, "1.0.0", "manifest.json")
	require.NoError(t, err)
	require.Equal(t, expectedPath, resolved)
}

func TestResolveAgentReleaseFilePathRejectsUnsafeInput(t *testing.T) {
	dataDir := t.TempDir()

	_, err := resolveAgentReleaseFilePath(dataDir, "../1.0.0", "beszel-agent_linux_amd64")
	require.Error(t, err)

	_, err = resolveAgentReleaseFilePath(dataDir, "1.0.0", "../secret")
	require.Error(t, err)

	_, err = resolveAgentReleaseFilePath(dataDir, "1.0.0", "missing")
	require.Error(t, err)
}

func TestBuildWindowsAgentInstallScriptDoesNotReferenceUndefinedLegacyPath(t *testing.T) {
	script := buildWindowsAgentInstallScript("1.0.5", "tok'en", "", "http://hub.local:8090", "http://hub.local/agent.exe")

	require.NotContains(t, script, "$LegacyAgentDataDir")
	require.Contains(t, script, "$AgentVersion = '1.0.5'")
	require.Contains(t, script, "$Token = 'tok''en'")
	require.Contains(t, script, "$PairingCode = ''")
	require.Contains(t, script, "$HubUrl = 'http://hub.local:8090'")
	require.Contains(t, script, "$DownloadUrl = 'http://hub.local/agent.exe'")
}

func TestBuildWindowsAgentInstallScriptSupportsPairingCode(t *testing.T) {
	script := buildWindowsAgentInstallScript("1.0.5", "", "123-456", "http://hub.local:8090", "http://hub.local/agent.exe")

	require.Contains(t, script, "$PairingCode = '123-456'")
	require.Contains(t, script, "& $AgentPath pair --url $HubUrl --code $PairingCode")
	require.Contains(t, script, `& $Nssm set pulse-agent AppEnvironmentExtra "+DATA_DIR=$AgentDataDir"`)
	require.Contains(t, script, "if ($Token) {")
}

func TestBuildWindowsAgentInstallScriptSupportsOptions(t *testing.T) {
	script := buildWindowsAgentInstallScript("1.0.5", "token", "", "http://hub.local:8090", "http://hub.local/agent.exe", windowsAgentInstallScriptOptions{
		InstallDir:      `C:\Pulse\Agent`,
		DataDir:         `D:\PulseData`,
		LogDir:          `D:\PulseLogs`,
		CleanData:       false,
		InstallNSSM:     false,
		StartService:    false,
		AddFirewallRule: true,
	})

	require.Contains(t, script, `$AgentDir = 'C:\Pulse\Agent'`)
	require.Contains(t, script, `$AgentDataDir = 'D:\PulseData'`)
	require.Contains(t, script, `$LogDir = 'D:\PulseLogs'`)
	require.NotContains(t, script, "winget install -e --id NSSM.NSSM")
	require.NotContains(t, script, "Remove-Item -Recurse -Force -LiteralPath $AgentDataDir")
	require.Contains(t, script, `New-NetFirewallRule -DisplayName "Allow pulse-agent"`)
	require.Contains(t, script, "pulse-agent service has been installed but not started")
}

func TestBuildUnraidAgentTemplateUsesShortRootCommand(t *testing.T) {
	cmd := buildUnraidAgentTemplate("tok123", "http://hub.local:8090")

	require.Contains(t, cmd, `mkdir -p "/boot/config/plugins/dockerMan/templates-user" && curl -fsSL`)
	require.Contains(t, cmd, "/api/pulse/agent-install/unraid.xml")
	require.NotContains(t, cmd, "sudo")
	require.NotContains(t, cmd, "sh -lc")
}

func TestBuildUnraidAgentTemplateXmlUsesPairingEnvVars(t *testing.T) {
	xml := buildUnraidAgentTemplateXml(
		"",
		"123-456",
		"http://hub.local:8090",
		"registry.example.com/infra/pulse-agent:1.0.5",
		"1.0.5",
		"/mnt/user/appdata/pulse-agent",
		linuxAgentInstallOptions{DockerSocketMode: "rw", IncludeHostRoot: true, IncludeDMI: true, IncludeGPU: true},
	)

	require.Contains(t, xml, `/var/lib/pulse-agent/paired.code`)
	require.Contains(t, xml, `rm -f /var/lib/pulse-agent/token /var/lib/pulse-agent/paired.env /var/lib/pulse-agent/pairing.json`)
	require.Contains(t, xml, `grep -Fxq &quot;$PAIR_CODE&quot; &quot;$PAIR_MARKER&quot;`)
	require.Contains(t, xml, `printf &quot;%s\n&quot; &quot;$PAIR_CODE&quot; &gt; &quot;$PAIR_MARKER&quot;`)
	require.NotContains(t, xml, "&amp;apos;")
	require.NotContains(t, xml, " --url http://hub.local:8090 --code 123-456")
	require.Contains(t, xml, "--device /dev/mem:/dev/mem")
	require.NotContains(t, xml, "/dev/mem:/dev/mem:ro")
	require.True(t, strings.Contains(xml, "<PostArgs>"))
}

func TestBuildUnraidAgentTemplateXmlKeepsRootLevelDownloadCommandFriendly(t *testing.T) {
	cmd := buildUnraidAgentTemplate("tok123", "http://hub.local:8090")

	require.NotContains(t, cmd, "sudo mkdir -p")
	require.NotContains(t, cmd, "sudo curl")
	require.Contains(t, cmd, `mkdir -p "/boot/config/plugins/dockerMan/templates-user"`)
}

func TestDiscoverLocalAgentReleasesFromManifest(t *testing.T) {
	dataDir := t.TempDir()
	releaseDir := filepath.Join(dataDir, "agent-releases", "1.0.0")
	require.NoError(t, os.MkdirAll(releaseDir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(releaseDir, "manifest.json"), []byte(`{
		"version": "1.0.0",
		"files": {
			"pulse-agent_windows_amd64.exe": {"sha256": "abc123", "size": 10}
		},
		"images": [
			{"platform": "linux", "arch": "amd64", "image": "registry.example.com/infra/pulse-agent:1.0.0", "notes": "Linux NAS Docker agent 1.0.0"}
		]
	}`), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(releaseDir, "pulse-agent_windows_amd64.exe"), []byte("real-agent"), 0644))
	expectedWindowsChecksum := "sha256:" + sha256Hex([]byte("real-agent"))

	releases, err := discoverLocalAgentReleases(dataDir, "http://hub.local")
	require.NoError(t, err)
	require.Len(t, releases, 2)

	require.Equal(t, "linux", releases[0].Platform)
	require.Equal(t, "amd64", releases[0].Arch)
	require.Empty(t, releases[0].Checksum)
	require.Equal(t, "registry.example.com/infra/pulse-agent:1.0.0", releases[0].DownloadURL)

	require.Equal(t, "1.0.0", releases[1].Version)
	require.Equal(t, "stable", releases[1].Channel)
	require.Equal(t, "windows", releases[1].Platform)
	require.Equal(t, "amd64", releases[1].Arch)
	require.Equal(t, expectedWindowsChecksum, releases[1].Checksum)
	require.Equal(t, "http://hub.local/api/pulse/agent-releases/1.0.0/pulse-agent_windows_amd64.exe", releases[1].DownloadURL)
}

func TestSyncLocalAgentReleasesUpsertsExistingRecords(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	dataDir := testApp.DataDir()
	releaseDir := filepath.Join(dataDir, "agent-releases", "1.0.0")
	require.NoError(t, os.MkdirAll(releaseDir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(releaseDir, "manifest.json"), []byte(`{
		"version": "1.0.0",
		"files": {
			"pulse-agent_windows_amd64.exe": {"sha256": "abc123", "size": 10}
		}
	}`), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(releaseDir, "pulse-agent_windows_amd64.exe"), []byte("agent-old"), 0644))

	count, err := hub.syncLocalAgentReleases()
	require.NoError(t, err)
	require.Equal(t, 1, count)

	record, err := testApp.FindFirstRecordByFilter(
		"agent_releases",
		"version = '1.0.0' && channel = 'stable' && platform = 'windows' && arch = 'amd64'",
	)
	require.NoError(t, err)
	require.True(t, record.GetBool("enabled"))
	require.Equal(t, "sha256:"+sha256Hex([]byte("agent-old")), record.GetString("checksum"))

	require.NoError(t, os.WriteFile(filepath.Join(releaseDir, "manifest.json"), []byte(`{
		"version": "1.0.0",
		"files": {
			"pulse-agent_windows_amd64.exe": {"sha256": "changed", "size": 11}
		}
	}`), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(releaseDir, "pulse-agent_windows_amd64.exe"), []byte("agent-new"), 0644))

	count, err = hub.syncLocalAgentReleases()
	require.NoError(t, err)
	require.Equal(t, 1, count)
	total, err := testApp.CountRecords("agent_releases")
	require.NoError(t, err)
	require.EqualValues(t, 1, total)

	record, err = testApp.FindRecordById("agent_releases", record.Id)
	require.NoError(t, err)
	require.Equal(t, "sha256:"+sha256Hex([]byte("agent-new")), record.GetString("checksum"))
}

func TestSyncLocalAgentReleasesTracksMultipleVersionsWithoutRecommendation(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	dataDir := testApp.DataDir()
	writeManifest := func(version string, checksum string) {
		releaseDir := filepath.Join(dataDir, "agent-releases", version)
		require.NoError(t, os.MkdirAll(releaseDir, 0755))
		require.NoError(t, os.WriteFile(filepath.Join(releaseDir, "manifest.json"), []byte(`{
			"version": "`+version+`",
			"files": {
				"pulse-agent_windows_amd64.exe": {"sha256": "`+checksum+`", "size": 10}
			}
		}`), 0644))
	}
	writeManifest("1.0.0", "old")
	writeManifest("1.0.1", "new")

	count, err := hub.syncLocalAgentReleases()
	require.NoError(t, err)
	require.Equal(t, 2, count)

	records, err := testApp.FindRecordsByFilter(
		"agent_releases",
		"channel = 'stable' && platform = 'windows' && arch = 'amd64'",
		"",
		-1,
		0,
	)
	require.NoError(t, err)
	require.Len(t, records, 2)
	for _, record := range records {
		require.True(t, record.GetBool("enabled"))
	}
}

func TestSyncLocalAgentReleasesDisablesMissingManifestRecords(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	collection, err := testApp.FindCachedCollectionByNameOrId("agent_releases")
	require.NoError(t, err)
	linuxRecord := core.NewRecord(collection)
	linuxRecord.Set("version", "1.0.0")
	linuxRecord.Set("channel", "stable")
	linuxRecord.Set("platform", "linux")
	linuxRecord.Set("arch", "amd64")
	linuxRecord.Set("download_url", "registry.example.com/infra/pulse-agent:1.0.0")
	linuxRecord.Set("enabled", true)
	require.NoError(t, testApp.Save(linuxRecord))

	dataDir := testApp.DataDir()
	releaseDir := filepath.Join(dataDir, "agent-releases", "1.0.0")
	require.NoError(t, os.MkdirAll(releaseDir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(releaseDir, "manifest.json"), []byte(`{
		"version": "1.0.0",
		"files": {
			"pulse-agent_windows_amd64.exe": {"sha256": "abc123", "size": 10}
		}
	}`), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(releaseDir, "pulse-agent_windows_amd64.exe"), []byte("agent"), 0644))

	count, err := hub.syncLocalAgentReleases()
	require.NoError(t, err)
	require.Equal(t, 1, count)

	linuxRecord, err = testApp.FindRecordById("agent_releases", linuxRecord.Id)
	require.NoError(t, err)
	require.False(t, linuxRecord.GetBool("enabled"))
	require.Contains(t, linuxRecord.GetString("disabled_reason"), "manifest")
}

func sha256Hex(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func TestSeedBundledAgentReleasesCopiesMissingFiles(t *testing.T) {
	sourceRoot := t.TempDir()
	dataDir := t.TempDir()
	sourceReleaseDir := filepath.Join(sourceRoot, "1.0.0")
	require.NoError(t, os.MkdirAll(sourceReleaseDir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(sourceReleaseDir, "manifest.json"), []byte(`{"version":"1.0.0"}`), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(sourceReleaseDir, "pulse-agent_windows_amd64.exe"), []byte("agent"), 0644))

	require.NoError(t, seedBundledAgentReleases(dataDir, sourceRoot))
	require.FileExists(t, filepath.Join(dataDir, "agent-releases", "1.0.0", "manifest.json"))
	require.FileExists(t, filepath.Join(dataDir, "agent-releases", "1.0.0", "pulse-agent_windows_amd64.exe"))

	require.NoError(t, os.WriteFile(filepath.Join(dataDir, "agent-releases", "1.0.0", "manifest.json"), []byte("custom"), 0644))
	require.NoError(t, seedBundledAgentReleases(dataDir, sourceRoot))
	contents, err := os.ReadFile(filepath.Join(dataDir, "agent-releases", "1.0.0", "manifest.json"))
	require.NoError(t, err)
	require.Equal(t, "custom", string(contents))
}

func TestAgentReleaseHookKeepsOnlyLatestTwoPerTarget(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	collection, err := testApp.FindCachedCollectionByNameOrId("agent_releases")
	require.NoError(t, err)
	for _, version := range []string{"1.0.0", "1.0.1", "1.0.2", "1.0.3"} {
		record := core.NewRecord(collection)
		record.Set("version", version)
		record.Set("channel", "stable")
		record.Set("platform", "windows")
		record.Set("arch", "amd64")
		record.Set("enabled", true)
		require.NoError(t, testApp.Save(record))
	}

	total, err := testApp.CountRecords("agent_releases")
	require.NoError(t, err)
	require.EqualValues(t, 2, total)

	_, err = testApp.FindFirstRecordByFilter(
		"agent_releases",
		"version = '1.0.0' && channel = 'stable' && platform = 'windows' && arch = 'amd64'",
	)
	require.Error(t, err)
	_, err = testApp.FindFirstRecordByFilter(
		"agent_releases",
		"version = '1.0.1' && channel = 'stable' && platform = 'windows' && arch = 'amd64'",
	)
	require.Error(t, err)
	for _, version := range []string{"1.0.2", "1.0.3"} {
		_, err = testApp.FindFirstRecordByFilter(
			"agent_releases",
			"version = {:version} && channel = 'stable' && platform = 'windows' && arch = 'amd64'",
			map[string]any{"version": version},
		)
		require.NoError(t, err)
	}
}

func TestAgentReleaseHookKeepsDisabledRecordsFromEvictingEnabledTargets(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	collection, err := testApp.FindCachedCollectionByNameOrId("agent_releases")
	require.NoError(t, err)
	for _, item := range []struct {
		version string
		enabled bool
	}{
		{version: "1.0.2", enabled: true},
		{version: "1.0.3", enabled: true},
		{version: "1.0.4", enabled: false},
	} {
		record := core.NewRecord(collection)
		record.Set("version", item.version)
		record.Set("channel", "stable")
		record.Set("platform", "linux")
		record.Set("arch", "amd64")
		record.Set("enabled", item.enabled)
		require.NoError(t, testApp.Save(record))
	}

	records, err := testApp.FindRecordsByFilter(
		"agent_releases",
		"channel = 'stable' && platform = 'linux' && arch = 'amd64'",
		"",
		-1,
		0,
	)
	require.NoError(t, err)
	require.Len(t, records, 3)

	for _, version := range []string{"1.0.2", "1.0.3"} {
		record, err := testApp.FindFirstRecordByFilter(
			"agent_releases",
			"version = {:version} && channel = 'stable' && platform = 'linux' && arch = 'amd64'",
			map[string]any{"version": version},
		)
		require.NoError(t, err)
		require.True(t, record.GetBool("enabled"))
	}
}

func TestPruneLocalAgentReleaseFilesKeepsOnlyLatestTwoVersions(t *testing.T) {
	dataDir := t.TempDir()
	for _, version := range []string{"1.0.0", "1.0.1", "1.0.2"} {
		releaseDir := filepath.Join(dataDir, "agent-releases", version)
		require.NoError(t, os.MkdirAll(releaseDir, 0755))
		require.NoError(t, os.WriteFile(filepath.Join(releaseDir, "manifest.json"), []byte(`{"version":"`+version+`"}`), 0644))
	}

	require.NoError(t, pruneLocalAgentReleaseFiles(dataDir, 2))
	require.NoDirExists(t, filepath.Join(dataDir, "agent-releases", "1.0.0"))
	require.DirExists(t, filepath.Join(dataDir, "agent-releases", "1.0.1"))
	require.DirExists(t, filepath.Join(dataDir, "agent-releases", "1.0.2"))
}
