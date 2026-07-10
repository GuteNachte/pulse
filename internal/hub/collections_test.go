//go:build testing

package hub_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	pbTests "github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	pulseHub "gutenacht.site/pulse/internal/hub"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestCollectionRulesDefault(t *testing.T) {
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	const isUserMatchesUser = `@request.auth.id != "" && user = @request.auth.id`
	const isUserMatchesUserNotReadonly = `@request.auth.id != "" && user = @request.auth.id && @request.auth.role != "readonly"`

	const isUserInUsers = `@request.auth.id != "" && users.id ?= @request.auth.id`
	const isUserInUsersNotReadonly = `@request.auth.id != "" && users.id ?= @request.auth.id && @request.auth.role != "readonly"`

	const isUserInSystemUsers = `@request.auth.id != "" && system.users.id ?= @request.auth.id`
	const isUserInSystemUsersNotReadonly = `@request.auth.id != "" && system.users.id ?= @request.auth.id && @request.auth.role != "readonly"`

	// users collection
	usersCollection, err := hub.FindCollectionByNameOrId("users")
	assert.NoError(t, err, "Failed to find users collection")
	assert.True(t, usersCollection.PasswordAuth.Enabled)
	assert.Equal(t, []string{"username", "email"}, usersCollection.PasswordAuth.IdentityFields)
	assert.Nil(t, usersCollection.CreateRule)
	assert.False(t, usersCollection.MFA.Enabled)

	// superusers collection
	superusersCollection, err := hub.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	assert.NoError(t, err, "Failed to find superusers collection")
	assert.True(t, superusersCollection.PasswordAuth.Enabled)
	assert.Equal(t, superusersCollection.PasswordAuth.IdentityFields, []string{"email"})
	assert.Nil(t, superusersCollection.CreateRule)
	assert.False(t, superusersCollection.MFA.Enabled)

	// alerts collection
	alertsCollection, err := hub.FindCollectionByNameOrId("alerts")
	require.NoError(t, err, "Failed to find alerts collection")
	assert.Equal(t, isUserMatchesUser, *alertsCollection.ListRule)
	assert.Nil(t, alertsCollection.ViewRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertsCollection.CreateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertsCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertsCollection.DeleteRule)
	assert.NotNil(t, alertsCollection.Fields.GetByName("asset"))

	// alerts_history collection
	alertsHistoryCollection, err := hub.FindCollectionByNameOrId("alerts_history")
	require.NoError(t, err, "Failed to find alerts_history collection")
	assert.Equal(t, isUserMatchesUser, *alertsHistoryCollection.ListRule)
	assert.Nil(t, alertsHistoryCollection.ViewRule)
	assert.Nil(t, alertsHistoryCollection.CreateRule)
	assert.Nil(t, alertsHistoryCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertsHistoryCollection.DeleteRule)
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("acknowledged_at"))
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("acknowledged_by"))
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("silenced_until"))
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("silenced_by"))
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("silence_reason"))
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("asset"))

	// alert_policies collection
	alertPoliciesCollection, err := hub.FindCollectionByNameOrId("alert_policies")
	require.NoError(t, err, "Failed to find alert_policies collection")
	assert.Equal(t, isUserMatchesUser, *alertPoliciesCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *alertPoliciesCollection.ViewRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertPoliciesCollection.CreateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertPoliciesCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertPoliciesCollection.DeleteRule)

	agentPairingCodesCollection, err := hub.FindCollectionByNameOrId("agent_pairing_codes")
	require.NoError(t, err, "Failed to find agent_pairing_codes collection")
	assert.Equal(t, isUserMatchesUser, *agentPairingCodesCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *agentPairingCodesCollection.ViewRule)
	assert.Nil(t, agentPairingCodesCollection.CreateRule)
	assert.Nil(t, agentPairingCodesCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *agentPairingCodesCollection.DeleteRule)
	assert.NotNil(t, agentPairingCodesCollection.Fields.GetByName("asset"))

	for _, collectionName := range []string{"network_devices", "network_ports", "network_links", "network_layouts"} {
		collection, err := hub.FindCollectionByNameOrId(collectionName)
		require.NoError(t, err, "Failed to find %s collection", collectionName)
		assert.Equal(t, isUserMatchesUser, *collection.ListRule, "%s list rule", collectionName)
		assert.Equal(t, isUserMatchesUser, *collection.ViewRule, "%s view rule", collectionName)
		assert.Equal(t, isUserMatchesUserNotReadonly, *collection.CreateRule, "%s create rule", collectionName)
		assert.Equal(t, isUserMatchesUserNotReadonly, *collection.UpdateRule, "%s update rule", collectionName)
		assert.Equal(t, isUserMatchesUserNotReadonly, *collection.DeleteRule, "%s delete rule", collectionName)
		assert.NotNil(t, collection.Fields.GetByName("user"), "%s should be user-scoped", collectionName)
	}

	networkDevicesCollection, err := hub.FindCollectionByNameOrId("network_devices")
	require.NoError(t, err)
	assert.NotNil(t, networkDevicesCollection.Fields.GetByName("name"))
	assert.NotNil(t, networkDevicesCollection.Fields.GetByName("type"))
	assert.NotNil(t, networkDevicesCollection.Fields.GetByName("model"))
	assert.NotNil(t, networkDevicesCollection.Fields.GetByName("management_ip"))
	assert.NotNil(t, networkDevicesCollection.Fields.GetByName("role"))
	assert.NotNil(t, networkDevicesCollection.Fields.GetByName("notes"))

	networkPortsCollection, err := hub.FindCollectionByNameOrId("network_ports")
	require.NoError(t, err)
	assert.NotNil(t, networkPortsCollection.Fields.GetByName("device"))
	assert.NotNil(t, networkPortsCollection.Fields.GetByName("system"))
	assert.NotNil(t, networkPortsCollection.Fields.GetByName("asset"))
	assert.NotNil(t, networkPortsCollection.Fields.GetByName("name"))
	assert.NotNil(t, networkPortsCollection.Fields.GetByName("type"))
	assert.NotNil(t, networkPortsCollection.Fields.GetByName("speed_mbps"))
	assert.NotNil(t, networkPortsCollection.Fields.GetByName("notes"))

	networkLinksCollection, err := hub.FindCollectionByNameOrId("network_links")
	require.NoError(t, err)
	assert.NotNil(t, networkLinksCollection.Fields.GetByName("source_port"))
	assert.NotNil(t, networkLinksCollection.Fields.GetByName("target_port"))
	assert.NotNil(t, networkLinksCollection.Fields.GetByName("kind"))
	assert.NotNil(t, networkLinksCollection.Fields.GetByName("name"))
	assert.NotNil(t, networkLinksCollection.Fields.GetByName("notes"))

	networkLayoutsCollection, err := hub.FindCollectionByNameOrId("network_layouts")
	require.NoError(t, err)
	assert.NotNil(t, networkLayoutsCollection.Fields.GetByName("key"))
	assert.NotNil(t, networkLayoutsCollection.Fields.GetByName("layout"))

	for _, collectionName := range []string{"assets", "asset_interfaces", "asset_relations", "asset_maintenance", "asset_attachments", "asset_locations"} {
		collection, err := hub.FindCollectionByNameOrId(collectionName)
		require.NoError(t, err, "Failed to find %s collection", collectionName)
		assert.Equal(t, isUserMatchesUser, *collection.ListRule, "%s list rule", collectionName)
		assert.Equal(t, isUserMatchesUser, *collection.ViewRule, "%s view rule", collectionName)
		assert.Equal(t, isUserMatchesUserNotReadonly, *collection.CreateRule, "%s create rule", collectionName)
		assert.Equal(t, isUserMatchesUserNotReadonly, *collection.UpdateRule, "%s update rule", collectionName)
		assert.Equal(t, isUserMatchesUserNotReadonly, *collection.DeleteRule, "%s delete rule", collectionName)
		assert.NotNil(t, collection.Fields.GetByName("user"), "%s should be user-scoped", collectionName)
	}

	assetChangesCollection, err := hub.FindCollectionByNameOrId("asset_changes")
	require.NoError(t, err, "Failed to find asset_changes collection")
	assert.Equal(t, isUserMatchesUser, *assetChangesCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *assetChangesCollection.ViewRule)
	assert.Nil(t, assetChangesCollection.CreateRule)
	assert.Nil(t, assetChangesCollection.UpdateRule)
	assert.Nil(t, assetChangesCollection.DeleteRule)
	assert.NotNil(t, assetChangesCollection.Fields.GetByName("user"))
	assert.NotNil(t, assetChangesCollection.Fields.GetByName("asset"))
	assert.NotNil(t, assetChangesCollection.Fields.GetByName("source_collection"))
	assert.NotNil(t, assetChangesCollection.Fields.GetByName("source_record"))
	assert.NotNil(t, assetChangesCollection.Fields.GetByName("action"))
	assert.NotNil(t, assetChangesCollection.Fields.GetByName("summary"))
	assert.NotNil(t, assetChangesCollection.Fields.GetByName("diff"))
	sourceCollectionField, ok := assetChangesCollection.Fields.GetByName("source_collection").(*core.SelectField)
	require.True(t, ok)
	assert.Contains(t, sourceCollectionField.Values, "asset_attachments")

	assetsCollection, err := hub.FindCollectionByNameOrId("assets")
	require.NoError(t, err)
	assert.NotNil(t, assetsCollection.Fields.GetByName("name"))
	assetTypeField, ok := assetsCollection.Fields.GetByName("type").(*core.SelectField)
	require.True(t, ok)
	for _, value := range []string{
		"ups",
		"game_console",
		"handheld",
		"ebook",
		"wearable",
		"tv",
		"speaker",
		"smarthome_gateway",
		"sensor",
		"light",
		"plug",
		"lock",
		"vacuum",
	} {
		assert.Contains(t, assetTypeField.Values, value, "assets.type should include %s", value)
	}
	assert.NotNil(t, assetsCollection.Fields.GetByName("status"))
	assert.NotNil(t, assetsCollection.Fields.GetByName("parent_asset"))
	assert.NotNil(t, assetsCollection.Fields.GetByName("management_ip"))
	assert.NotNil(t, assetsCollection.Fields.GetByName("metadata"))

	assetInterfacesCollection, err := hub.FindCollectionByNameOrId("asset_interfaces")
	require.NoError(t, err)
	assert.NotNil(t, assetInterfacesCollection.Fields.GetByName("asset"))
	assert.NotNil(t, assetInterfacesCollection.Fields.GetByName("name"))
	assert.NotNil(t, assetInterfacesCollection.Fields.GetByName("kind"))
	assert.NotNil(t, assetInterfacesCollection.Fields.GetByName("ipv4"))
	assert.NotNil(t, assetInterfacesCollection.Fields.GetByName("ipv6"))
	assert.NotNil(t, assetInterfacesCollection.Fields.GetByName("speed_mbps"))

	assetRelationsCollection, err := hub.FindCollectionByNameOrId("asset_relations")
	require.NoError(t, err)
	assert.NotNil(t, assetRelationsCollection.Fields.GetByName("source_asset"))
	assert.NotNil(t, assetRelationsCollection.Fields.GetByName("target_asset"))
	assert.NotNil(t, assetRelationsCollection.Fields.GetByName("kind"))

	assetMaintenanceCollection, err := hub.FindCollectionByNameOrId("asset_maintenance")
	require.NoError(t, err)
	assert.NotNil(t, assetMaintenanceCollection.Fields.GetByName("asset"))
	assert.NotNil(t, assetMaintenanceCollection.Fields.GetByName("kind"))
	assert.NotNil(t, assetMaintenanceCollection.Fields.GetByName("title"))
	assert.NotNil(t, assetMaintenanceCollection.Fields.GetByName("event_date"))
	assert.NotNil(t, assetMaintenanceCollection.Fields.GetByName("notes"))

	assetAttachmentsCollection, err := hub.FindCollectionByNameOrId("asset_attachments")
	require.NoError(t, err)
	assert.NotNil(t, assetAttachmentsCollection.Fields.GetByName("asset"))
	assert.NotNil(t, assetAttachmentsCollection.Fields.GetByName("kind"))
	assert.NotNil(t, assetAttachmentsCollection.Fields.GetByName("title"))
	attachmentFilesField, ok := assetAttachmentsCollection.Fields.GetByName("files").(*core.FileField)
	require.True(t, ok)
	assert.True(t, attachmentFilesField.Protected)
	assert.Equal(t, 5, attachmentFilesField.MaxSelect)
	assert.Equal(t, int64(20*1024*1024), attachmentFilesField.MaxSize)
	assert.NotNil(t, assetAttachmentsCollection.Fields.GetByName("notes"))

	assetLocationsCollection, err := hub.FindCollectionByNameOrId("asset_locations")
	require.NoError(t, err)
	assert.NotNil(t, assetLocationsCollection.Fields.GetByName("name"))
	assert.NotNil(t, assetLocationsCollection.Fields.GetByName("kind"))
	assert.NotNil(t, assetLocationsCollection.Fields.GetByName("parent_location"))
	assert.NotNil(t, assetLocationsCollection.Fields.GetByName("sort_order"))
	assert.NotNil(t, assetLocationsCollection.Fields.GetByName("notes"))

	// notification_failures collection
	notificationFailuresCollection, err := hub.FindCollectionByNameOrId("notification_failures")
	require.NoError(t, err, "Failed to find notification_failures collection")
	assert.Equal(t, isUserMatchesUser, *notificationFailuresCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *notificationFailuresCollection.ViewRule)
	assert.Nil(t, notificationFailuresCollection.CreateRule)
	assert.Nil(t, notificationFailuresCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *notificationFailuresCollection.DeleteRule)
	assert.NotNil(t, notificationFailuresCollection.Fields.GetByName("asset"))

	notificationChannelHealthCollection, err := hub.FindCollectionByNameOrId("notification_channel_health")
	require.NoError(t, err, "Failed to find notification_channel_health collection")
	assert.Equal(t, isUserMatchesUser, *notificationChannelHealthCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *notificationChannelHealthCollection.ViewRule)
	assert.Nil(t, notificationChannelHealthCollection.CreateRule)
	assert.Nil(t, notificationChannelHealthCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *notificationChannelHealthCollection.DeleteRule)
	assert.NotNil(t, notificationChannelHealthCollection.Fields.GetByName("last_success_at"))
	assert.NotNil(t, notificationChannelHealthCollection.Fields.GetByName("last_failure_at"))
	assert.NotNil(t, notificationChannelHealthCollection.Fields.GetByName("last_test_at"))

	alertNotificationStatesCollection, err := hub.FindCollectionByNameOrId("alert_notification_states")
	require.NoError(t, err, "Failed to find alert_notification_states collection")
	assert.Equal(t, isUserMatchesUser, *alertNotificationStatesCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *alertNotificationStatesCollection.ViewRule)
	assert.Nil(t, alertNotificationStatesCollection.CreateRule)
	assert.Nil(t, alertNotificationStatesCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertNotificationStatesCollection.DeleteRule)
	assert.NotNil(t, alertNotificationStatesCollection.Fields.GetByName("next_allowed_at"))
	assert.NotNil(t, alertNotificationStatesCollection.Fields.GetByName("suppressed_count"))
	assert.NotNil(t, alertNotificationStatesCollection.Fields.GetByName("asset"))

	// containers collection
	containersCollection, err := hub.FindCollectionByNameOrId("containers")
	require.NoError(t, err, "Failed to find containers collection")
	assert.Equal(t, isUserInSystemUsers, *containersCollection.ListRule)
	assert.Nil(t, containersCollection.ViewRule)
	assert.Nil(t, containersCollection.CreateRule)
	assert.Nil(t, containersCollection.UpdateRule)
	assert.Nil(t, containersCollection.DeleteRule)

	// container_stats collection
	containerStatsCollection, err := hub.FindCollectionByNameOrId("container_stats")
	require.NoError(t, err, "Failed to find container_stats collection")
	assert.Equal(t, isUserInSystemUsers, *containerStatsCollection.ListRule)
	assert.Nil(t, containerStatsCollection.ViewRule)
	assert.Nil(t, containerStatsCollection.CreateRule)
	assert.Nil(t, containerStatsCollection.UpdateRule)
	assert.Nil(t, containerStatsCollection.DeleteRule)

	// fingerprints collection
	fingerprintsCollection, err := hub.FindCollectionByNameOrId("fingerprints")
	require.NoError(t, err, "Failed to find fingerprints collection")
	assert.Equal(t, isUserInSystemUsers, *fingerprintsCollection.ListRule)
	assert.Equal(t, isUserInSystemUsers, *fingerprintsCollection.ViewRule)
	assert.Nil(t, fingerprintsCollection.CreateRule)
	assert.Nil(t, fingerprintsCollection.UpdateRule)
	assert.Nil(t, fingerprintsCollection.DeleteRule)
	assert.True(t, fingerprintsCollection.Fields.GetByName("token").GetHidden())

	// smart_devices collection
	smartDevicesCollection, err := hub.FindCollectionByNameOrId("smart_devices")
	require.NoError(t, err, "Failed to find smart_devices collection")
	assert.Equal(t, isUserInSystemUsers, *smartDevicesCollection.ListRule)
	assert.Equal(t, isUserInSystemUsers, *smartDevicesCollection.ViewRule)
	assert.Nil(t, smartDevicesCollection.CreateRule)
	assert.Nil(t, smartDevicesCollection.UpdateRule)
	assert.Equal(t, isUserInSystemUsersNotReadonly, *smartDevicesCollection.DeleteRule)

	// system_details collection
	systemDetailsCollection, err := hub.FindCollectionByNameOrId("system_details")
	require.NoError(t, err, "Failed to find system_details collection")
	assert.Equal(t, isUserInSystemUsers, *systemDetailsCollection.ListRule)
	assert.Equal(t, isUserInSystemUsers, *systemDetailsCollection.ViewRule)
	assert.Nil(t, systemDetailsCollection.CreateRule)
	assert.Nil(t, systemDetailsCollection.UpdateRule)
	assert.Nil(t, systemDetailsCollection.DeleteRule)

	// system_stats collection
	systemStatsCollection, err := hub.FindCollectionByNameOrId("system_stats")
	require.NoError(t, err, "Failed to find system_stats collection")
	assert.Equal(t, isUserInSystemUsers, *systemStatsCollection.ListRule)
	assert.Nil(t, systemStatsCollection.ViewRule)
	assert.Nil(t, systemStatsCollection.CreateRule)
	assert.Nil(t, systemStatsCollection.UpdateRule)
	assert.Nil(t, systemStatsCollection.DeleteRule)

	// systems collection
	systemsCollection, err := hub.FindCollectionByNameOrId("systems")
	require.NoError(t, err, "Failed to find systems collection")
	assert.Equal(t, isUserInUsers, *systemsCollection.ListRule)
	assert.Equal(t, isUserInUsers, *systemsCollection.ViewRule)
	assert.Equal(t, isUserInUsersNotReadonly, *systemsCollection.CreateRule)
	assert.Equal(t, isUserInUsersNotReadonly, *systemsCollection.UpdateRule)
	assert.Equal(t, isUserInUsersNotReadonly, *systemsCollection.DeleteRule)
	assert.NotNil(t, systemsCollection.Fields.GetByName("asset"))

	// universal_tokens collection
	universalTokensCollection, err := hub.FindCollectionByNameOrId("universal_tokens")
	require.NoError(t, err, "Failed to find universal_tokens collection")
	assert.Nil(t, universalTokensCollection.ListRule)
	assert.Nil(t, universalTokensCollection.ViewRule)
	assert.Nil(t, universalTokensCollection.CreateRule)
	assert.Nil(t, universalTokensCollection.UpdateRule)
	assert.Nil(t, universalTokensCollection.DeleteRule)
	assert.True(t, universalTokensCollection.Fields.GetByName("token").GetHidden())

	// user_settings collection
	userSettingsCollection, err := hub.FindCollectionByNameOrId("user_settings")
	require.NoError(t, err, "Failed to find user_settings collection")
	assert.Equal(t, isUserMatchesUser, *userSettingsCollection.ListRule)
	assert.Nil(t, userSettingsCollection.ViewRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *userSettingsCollection.CreateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *userSettingsCollection.UpdateRule)
	assert.Nil(t, userSettingsCollection.DeleteRule)

	moduleSettingsCollection, err := hub.FindCollectionByNameOrId("module_settings")
	require.NoError(t, err, "Failed to find module_settings collection")
	assert.Equal(t, isUserMatchesUser, *moduleSettingsCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *moduleSettingsCollection.ViewRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *moduleSettingsCollection.CreateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *moduleSettingsCollection.UpdateRule)
	assert.Nil(t, moduleSettingsCollection.DeleteRule)
	assert.NotNil(t, moduleSettingsCollection.Fields.GetByName("user"))
	assert.NotNil(t, moduleSettingsCollection.Fields.GetByName("module_id"))
	assert.NotNil(t, moduleSettingsCollection.Fields.GetByName("enabled"))
	assert.NotNil(t, moduleSettingsCollection.Fields.GetByName("settings"))
	assert.NotNil(t, moduleSettingsCollection.Fields.GetByName("health"))

	agentReleasesCollection, err := hub.FindCollectionByNameOrId("agent_releases")
	require.NoError(t, err, "Failed to find agent_releases collection")
	assert.Nil(t, agentReleasesCollection.Fields.GetByName("recommended"))
	assert.NotNil(t, agentReleasesCollection.Fields.GetByName("disabled_reason"))

	websiteMonitorsCollection, err := hub.FindCollectionByNameOrId("website_monitors")
	require.NoError(t, err, "Failed to find website_monitors collection")
	assert.NotNil(t, websiteMonitorsCollection.Fields.GetByName("asset"))
	assert.NotNil(t, websiteMonitorsCollection.Fields.GetByName("expected_content"))
	assert.NotNil(t, websiteMonitorsCollection.Fields.GetByName("last_failure_category"))

	websiteMonitorChecksCollection, err := hub.FindCollectionByNameOrId("website_monitor_checks")
	require.NoError(t, err, "Failed to find website_monitor_checks collection")
	assert.NotNil(t, websiteMonitorChecksCollection.Fields.GetByName("failure_category"))
}

func TestOperationActionCollectionSupportsAllAllowedActions(t *testing.T) {
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	collection, err := hub.FindCollectionByNameOrId("operation_actions")
	require.NoError(t, err)
	field := collection.Fields.GetByName("action")
	selectField, ok := field.(*core.SelectField)
	require.True(t, ok, "operation_actions.action should be a select field")
	timeoutField, ok := collection.Fields.GetByName("timeout_seconds").(*core.NumberField)
	require.True(t, ok, "operation_actions.timeout_seconds should be a number field")
	require.NotNil(t, timeoutField.Max)
	assert.Equal(t, float64(600), *timeoutField.Max)
	stageField, ok := collection.Fields.GetByName("stage").(*core.SelectField)
	require.True(t, ok, "operation_actions.stage should be a select field")
	assert.ElementsMatch(t, []string{"queued", "validating", "executing", "completed"}, stageField.Values)
	failureCodeField, ok := collection.Fields.GetByName("failure_code").(*core.SelectField)
	require.True(t, ok, "operation_actions.failure_code should be a select field")
	assert.ElementsMatch(t, pulseHub.OperationFailureCodes(), failureCodeField.Values)
	assert.NotNil(t, collection.Fields.GetByName("started_at"))
	assert.NotNil(t, collection.Fields.GetByName("completed_at"))
	durationField, ok := collection.Fields.GetByName("duration_ms").(*core.NumberField)
	require.True(t, ok, "operation_actions.duration_ms should be a number field")
	require.NotNil(t, durationField.Min)
	assert.Equal(t, float64(0), *durationField.Min)
	auditCollection, err := hub.FindCollectionByNameOrId("operation_audit")
	require.NoError(t, err)
	auditOperationField, ok := auditCollection.Fields.GetByName("operation").(*core.RelationField)
	require.True(t, ok, "operation_audit.operation should be a relation field")
	assert.Equal(t, collection.Id, auditOperationField.CollectionId)
	auditFailureCodeField, ok := auditCollection.Fields.GetByName("failure_code").(*core.SelectField)
	require.True(t, ok, "operation_audit.failure_code should be a select field")
	assert.ElementsMatch(t, pulseHub.OperationFailureCodes(), auditFailureCodeField.Values)

	assert.ElementsMatch(t, pulseHub.AllowedOperationActions(), selectField.Values)
}

func TestAssetCollectionSelectValuesMatchAssetCenterModel(t *testing.T) {
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	assetsCollection, err := hub.FindCollectionByNameOrId("assets")
	require.NoError(t, err)
	assetTypeField, ok := assetsCollection.Fields.GetByName("type").(*core.SelectField)
	require.True(t, ok, "assets.type should be a select field")
	assert.ElementsMatch(t, []string{
		"internet",
		"physical_host",
		"nas",
		"server",
		"mini_pc",
		"router",
		"switch",
		"ap",
		"gateway",
		"ont",
		"firewall",
		"phone",
		"tablet",
		"camera",
		"printer",
		"ups",
		"game_console",
		"handheld",
		"ebook",
		"wearable",
		"tv",
		"speaker",
		"smarthome_gateway",
		"sensor",
		"light",
		"plug",
		"lock",
		"vacuum",
		"iot",
		"web_endpoint",
		"custom",
	}, assetTypeField.Values)

	relationsCollection, err := hub.FindCollectionByNameOrId("asset_relations")
	require.NoError(t, err)
	relationKindField, ok := relationsCollection.Fields.GetByName("kind").(*core.SelectField)
	require.True(t, ok, "asset_relations.kind should be a select field")
	assert.ElementsMatch(t, []string{
		"hosted_on",
		"connected_to",
		"monitors",
		"depends_on",
		"owns",
		"located_in",
		"powered_by",
		"custom",
	}, relationKindField.Values)
}

func TestCollectionRulesShareAllSystems(t *testing.T) {
	t.Setenv("SHARE_ALL_SYSTEMS", "true")
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	const isUser = `@request.auth.id != ""`
	const isUserNotReadonly = `@request.auth.id != "" && @request.auth.role != "readonly"`

	const isUserMatchesUser = `@request.auth.id != "" && user = @request.auth.id`
	const isUserMatchesUserNotReadonly = `@request.auth.id != "" && user = @request.auth.id && @request.auth.role != "readonly"`

	// alerts collection
	alertsCollection, err := hub.FindCollectionByNameOrId("alerts")
	require.NoError(t, err, "Failed to find alerts collection")
	assert.Equal(t, isUserMatchesUser, *alertsCollection.ListRule)
	assert.Nil(t, alertsCollection.ViewRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertsCollection.CreateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertsCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertsCollection.DeleteRule)

	// alerts_history collection
	alertsHistoryCollection, err := hub.FindCollectionByNameOrId("alerts_history")
	require.NoError(t, err, "Failed to find alerts_history collection")
	assert.Equal(t, isUserMatchesUser, *alertsHistoryCollection.ListRule)
	assert.Nil(t, alertsHistoryCollection.ViewRule)
	assert.Nil(t, alertsHistoryCollection.CreateRule)
	assert.Nil(t, alertsHistoryCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertsHistoryCollection.DeleteRule)
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("acknowledged_at"))
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("acknowledged_by"))
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("silenced_until"))
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("silenced_by"))
	assert.NotNil(t, alertsHistoryCollection.Fields.GetByName("silence_reason"))

	// alert_policies collection
	alertPoliciesCollection, err := hub.FindCollectionByNameOrId("alert_policies")
	require.NoError(t, err, "Failed to find alert_policies collection")
	assert.Equal(t, isUserMatchesUser, *alertPoliciesCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *alertPoliciesCollection.ViewRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertPoliciesCollection.CreateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertPoliciesCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertPoliciesCollection.DeleteRule)

	agentPairingCodesCollection, err := hub.FindCollectionByNameOrId("agent_pairing_codes")
	require.NoError(t, err, "Failed to find agent_pairing_codes collection")
	assert.Equal(t, isUserMatchesUser, *agentPairingCodesCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *agentPairingCodesCollection.ViewRule)
	assert.Nil(t, agentPairingCodesCollection.CreateRule)
	assert.Nil(t, agentPairingCodesCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *agentPairingCodesCollection.DeleteRule)
	assert.NotNil(t, agentPairingCodesCollection.Fields.GetByName("asset"))

	// notification_failures collection
	notificationFailuresCollection, err := hub.FindCollectionByNameOrId("notification_failures")
	require.NoError(t, err, "Failed to find notification_failures collection")
	assert.Equal(t, isUserMatchesUser, *notificationFailuresCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *notificationFailuresCollection.ViewRule)
	assert.Nil(t, notificationFailuresCollection.CreateRule)
	assert.Nil(t, notificationFailuresCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *notificationFailuresCollection.DeleteRule)
	assert.NotNil(t, notificationFailuresCollection.Fields.GetByName("asset"))

	notificationChannelHealthCollection, err := hub.FindCollectionByNameOrId("notification_channel_health")
	require.NoError(t, err, "Failed to find notification_channel_health collection")
	assert.Equal(t, isUserMatchesUser, *notificationChannelHealthCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *notificationChannelHealthCollection.ViewRule)
	assert.Nil(t, notificationChannelHealthCollection.CreateRule)
	assert.Nil(t, notificationChannelHealthCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *notificationChannelHealthCollection.DeleteRule)

	alertNotificationStatesCollection, err := hub.FindCollectionByNameOrId("alert_notification_states")
	require.NoError(t, err, "Failed to find alert_notification_states collection")
	assert.Equal(t, isUserMatchesUser, *alertNotificationStatesCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *alertNotificationStatesCollection.ViewRule)
	assert.Nil(t, alertNotificationStatesCollection.CreateRule)
	assert.Nil(t, alertNotificationStatesCollection.UpdateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *alertNotificationStatesCollection.DeleteRule)
	assert.NotNil(t, alertNotificationStatesCollection.Fields.GetByName("asset"))

	// containers collection
	containersCollection, err := hub.FindCollectionByNameOrId("containers")
	require.NoError(t, err, "Failed to find containers collection")
	assert.Equal(t, isUser, *containersCollection.ListRule)
	assert.Nil(t, containersCollection.ViewRule)
	assert.Nil(t, containersCollection.CreateRule)
	assert.Nil(t, containersCollection.UpdateRule)
	assert.Nil(t, containersCollection.DeleteRule)

	// container_stats collection
	containerStatsCollection, err := hub.FindCollectionByNameOrId("container_stats")
	require.NoError(t, err, "Failed to find container_stats collection")
	assert.Equal(t, isUser, *containerStatsCollection.ListRule)
	assert.Nil(t, containerStatsCollection.ViewRule)
	assert.Nil(t, containerStatsCollection.CreateRule)
	assert.Nil(t, containerStatsCollection.UpdateRule)
	assert.Nil(t, containerStatsCollection.DeleteRule)

	// fingerprints collection
	fingerprintsCollection, err := hub.FindCollectionByNameOrId("fingerprints")
	require.NoError(t, err, "Failed to find fingerprints collection")
	assert.Equal(t, isUser, *fingerprintsCollection.ListRule)
	assert.Equal(t, isUser, *fingerprintsCollection.ViewRule)
	assert.Nil(t, fingerprintsCollection.CreateRule)
	assert.Nil(t, fingerprintsCollection.UpdateRule)
	assert.Nil(t, fingerprintsCollection.DeleteRule)
	assert.True(t, fingerprintsCollection.Fields.GetByName("token").GetHidden())

	// smart_devices collection
	smartDevicesCollection, err := hub.FindCollectionByNameOrId("smart_devices")
	require.NoError(t, err, "Failed to find smart_devices collection")
	assert.Equal(t, isUser, *smartDevicesCollection.ListRule)
	assert.Equal(t, isUser, *smartDevicesCollection.ViewRule)
	assert.Nil(t, smartDevicesCollection.CreateRule)
	assert.Nil(t, smartDevicesCollection.UpdateRule)
	assert.Equal(t, isUserNotReadonly, *smartDevicesCollection.DeleteRule)

	// system_details collection
	systemDetailsCollection, err := hub.FindCollectionByNameOrId("system_details")
	require.NoError(t, err, "Failed to find system_details collection")
	assert.Equal(t, isUser, *systemDetailsCollection.ListRule)
	assert.Equal(t, isUser, *systemDetailsCollection.ViewRule)
	assert.Nil(t, systemDetailsCollection.CreateRule)
	assert.Nil(t, systemDetailsCollection.UpdateRule)
	assert.Nil(t, systemDetailsCollection.DeleteRule)

	// system_stats collection
	systemStatsCollection, err := hub.FindCollectionByNameOrId("system_stats")
	require.NoError(t, err, "Failed to find system_stats collection")
	assert.Equal(t, isUser, *systemStatsCollection.ListRule)
	assert.Nil(t, systemStatsCollection.ViewRule)
	assert.Nil(t, systemStatsCollection.CreateRule)
	assert.Nil(t, systemStatsCollection.UpdateRule)
	assert.Nil(t, systemStatsCollection.DeleteRule)

	// systems collection
	systemsCollection, err := hub.FindCollectionByNameOrId("systems")
	require.NoError(t, err, "Failed to find systems collection")
	assert.Equal(t, isUser, *systemsCollection.ListRule)
	assert.Equal(t, isUser, *systemsCollection.ViewRule)
	assert.Equal(t, isUserNotReadonly, *systemsCollection.CreateRule)
	assert.Equal(t, isUserNotReadonly, *systemsCollection.UpdateRule)
	assert.Equal(t, isUserNotReadonly, *systemsCollection.DeleteRule)

	// universal_tokens collection
	universalTokensCollection, err := hub.FindCollectionByNameOrId("universal_tokens")
	require.NoError(t, err, "Failed to find universal_tokens collection")
	assert.Nil(t, universalTokensCollection.ListRule)
	assert.Nil(t, universalTokensCollection.ViewRule)
	assert.Nil(t, universalTokensCollection.CreateRule)
	assert.Nil(t, universalTokensCollection.UpdateRule)
	assert.Nil(t, universalTokensCollection.DeleteRule)
	assert.True(t, universalTokensCollection.Fields.GetByName("token").GetHidden())

	// user_settings collection
	userSettingsCollection, err := hub.FindCollectionByNameOrId("user_settings")
	require.NoError(t, err, "Failed to find user_settings collection")
	assert.Equal(t, isUserMatchesUser, *userSettingsCollection.ListRule)
	assert.Nil(t, userSettingsCollection.ViewRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *userSettingsCollection.CreateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *userSettingsCollection.UpdateRule)
	assert.Nil(t, userSettingsCollection.DeleteRule)

	moduleSettingsCollection, err := hub.FindCollectionByNameOrId("module_settings")
	require.NoError(t, err, "Failed to find module_settings collection")
	assert.Equal(t, isUserMatchesUser, *moduleSettingsCollection.ListRule)
	assert.Equal(t, isUserMatchesUser, *moduleSettingsCollection.ViewRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *moduleSettingsCollection.CreateRule)
	assert.Equal(t, isUserMatchesUserNotReadonly, *moduleSettingsCollection.UpdateRule)
	assert.Nil(t, moduleSettingsCollection.DeleteRule)
}

func TestDisablePasswordAuth(t *testing.T) {
	t.Setenv("DISABLE_PASSWORD_AUTH", "true")
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	usersCollection, err := hub.FindCollectionByNameOrId("users")
	assert.NoError(t, err)
	assert.False(t, usersCollection.PasswordAuth.Enabled)
}

func TestUserCreation(t *testing.T) {
	t.Setenv("USER_CREATION", "true")
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	usersCollection, err := hub.FindCollectionByNameOrId("users")
	assert.NoError(t, err)
	assert.Equal(t, "@request.context = 'oauth2'", *usersCollection.CreateRule)
}

func TestMFAOtp(t *testing.T) {
	t.Setenv("MFA_OTP", "true")
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	usersCollection, err := hub.FindCollectionByNameOrId("users")
	assert.NoError(t, err)
	assert.True(t, usersCollection.OTP.Enabled)
	assert.True(t, usersCollection.MFA.Enabled)

	superusersCollection, err := hub.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	assert.NoError(t, err)
	assert.True(t, superusersCollection.OTP.Enabled)
	assert.True(t, superusersCollection.MFA.Enabled)
}

func TestApiCollectionsAuthRules(t *testing.T) {
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	hub.StartHub()

	user1, _ := pulseTests.CreateUser(hub, "user1@example.com", "password")
	user1Token, _ := user1.NewAuthToken()

	user2, _ := pulseTests.CreateUser(hub, "user2@example.com", "password")
	// user2Token, _ := user2.NewAuthToken()

	userReadonly, _ := pulseTests.CreateUserWithRole(hub, "userreadonly@example.com", "password", "readonly")
	userReadonlyToken, _ := userReadonly.NewAuthToken()

	userOneSystem, _ := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "system1",
		"users": []string{user1.Id},
		"host":  "127.0.0.1",
	})

	sharedSystem, _ := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "system2",
		"users": []string{user1.Id, user2.Id},
		"host":  "127.0.0.2",
	})

	readonlyPairingCode, _ := pulseTests.CreateRecord(hub, "agent_pairing_codes", map[string]any{
		"user":       userReadonly.Id,
		"code":       "RO1111",
		"expires_at": time.Now().Add(time.Hour),
	})

	userTwoSystem, _ := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "system3",
		"users": []string{user2.Id},
		"host":  "127.0.0.2",
	})

	userRecords, _ := hub.CountRecords("users")
	assert.EqualValues(t, 3, userRecords, "all users should be created")

	systemRecords, _ := hub.CountRecords("systems")
	assert.EqualValues(t, 3, systemRecords, "all systems should be created")

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:               "Unauthorized user cannot list systems",
			Method:             http.MethodGet,
			URL:                "/api/collections/systems/records",
			ExpectedStatus:     200, // https://github.com/pocketbase/pocketbase/discussions/1570
			TestAppFactory:     testAppFactory,
			ExpectedContent:    []string{`"items":[]`, `"totalItems":0`},
			NotExpectedContent: []string{userOneSystem.Id, sharedSystem.Id, userTwoSystem.Id},
		},
		{
			Name:               "Unauthorized user cannot delete a system",
			Method:             http.MethodDelete,
			URL:                fmt.Sprintf("/api/collections/systems/records/%s", userOneSystem.Id),
			ExpectedStatus:     404,
			TestAppFactory:     testAppFactory,
			ExpectedContent:    []string{"resource wasn't found"},
			NotExpectedContent: []string{userOneSystem.Id},
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				systemsCount, _ := app.CountRecords("systems")
				assert.EqualValues(t, 3, systemsCount, "should have 3 systems before deletion")
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				systemsCount, _ := app.CountRecords("systems")
				assert.EqualValues(t, 3, systemsCount, "should still have 3 systems after failed deletion")
			},
		},
		{
			Name:   "User 1 can list their own systems",
			Method: http.MethodGet,
			URL:    "/api/collections/systems/records",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:     200,
			ExpectedContent:    []string{userOneSystem.Id, sharedSystem.Id},
			NotExpectedContent: []string{userTwoSystem.Id},
			TestAppFactory:     testAppFactory,
		},
		{
			Name:   "User 1 cannot list user 2's system",
			Method: http.MethodGet,
			URL:    "/api/collections/systems/records",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:     200,
			ExpectedContent:    []string{userOneSystem.Id, sharedSystem.Id},
			NotExpectedContent: []string{userTwoSystem.Id},
			TestAppFactory:     testAppFactory,
		},
		{
			Name:   "User 1 can see user 2's system if SHARE_ALL_SYSTEMS is enabled",
			Method: http.MethodGet,
			URL:    "/api/collections/systems/records",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{userOneSystem.Id, sharedSystem.Id, userTwoSystem.Id},
			TestAppFactory:  testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				t.Setenv("SHARE_ALL_SYSTEMS", "true")
				hub.SetCollectionAuthSettings()
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				t.Setenv("SHARE_ALL_SYSTEMS", "")
				hub.SetCollectionAuthSettings()
			},
		},
		{
			Name:   "User 1 can delete their own system",
			Method: http.MethodDelete,
			URL:    fmt.Sprintf("/api/collections/systems/records/%s", userOneSystem.Id),
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus: 204,
			TestAppFactory: testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				systemsCount, _ := app.CountRecords("systems")
				assert.EqualValues(t, 3, systemsCount, "should have 3 systems before deletion")
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				systemsCount, _ := app.CountRecords("systems")
				assert.EqualValues(t, 2, systemsCount, "should have 2 systems after deletion")
			},
		},
		{
			Name:   "User 1 cannot delete user 2's system",
			Method: http.MethodDelete,
			URL:    fmt.Sprintf("/api/collections/systems/records/%s", userTwoSystem.Id),
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  404,
			TestAppFactory:  testAppFactory,
			ExpectedContent: []string{"resource wasn't found"},
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				systemsCount, _ := app.CountRecords("systems")
				assert.EqualValues(t, 2, systemsCount)
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				systemsCount, _ := app.CountRecords("systems")
				assert.EqualValues(t, 2, systemsCount)
			},
		},
		{
			Name:   "Readonly cannot delete a system even if SHARE_ALL_SYSTEMS is enabled",
			Method: http.MethodDelete,
			URL:    fmt.Sprintf("/api/collections/systems/records/%s", sharedSystem.Id),
			Headers: map[string]string{
				"Authorization": userReadonlyToken,
			},
			ExpectedStatus:  404,
			ExpectedContent: []string{"resource wasn't found"},
			TestAppFactory:  testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				t.Setenv("SHARE_ALL_SYSTEMS", "true")
				hub.SetCollectionAuthSettings()
				systemsCount, _ := app.CountRecords("systems")
				assert.EqualValues(t, 2, systemsCount)
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				t.Setenv("SHARE_ALL_SYSTEMS", "")
				hub.SetCollectionAuthSettings()
				systemsCount, _ := app.CountRecords("systems")
				assert.EqualValues(t, 2, systemsCount)
			},
		},
		{
			Name:   "Readonly cannot create alert collection records",
			Method: http.MethodPost,
			URL:    "/api/collections/alerts/records",
			Headers: map[string]string{
				"Authorization": userReadonlyToken,
			},
			Body:            strings.NewReader(fmt.Sprintf(`{"user":"%s","system":"%s","name":"CPU","value":80,"min":10}`, userReadonly.Id, sharedSystem.Id)),
			ExpectedStatus:  400,
			ExpectedContent: []string{"Failed to create record."},
			TestAppFactory:  testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				count, _ := app.CountRecords("alerts")
				assert.EqualValues(t, 0, count)
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				count, _ := app.CountRecords("alerts")
				assert.EqualValues(t, 0, count)
			},
		},
		{
			Name:   "Readonly cannot create user settings collection records",
			Method: http.MethodPost,
			URL:    "/api/collections/user_settings/records",
			Headers: map[string]string{
				"Authorization": userReadonlyToken,
			},
			Body:            strings.NewReader(fmt.Sprintf(`{"user":"%s","settings":{"theme":"dark"}}`, userReadonly.Id)),
			ExpectedStatus:  400,
			ExpectedContent: []string{"Failed to create record."},
			TestAppFactory:  testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				count, _ := app.CountRecords("user_settings")
				assert.EqualValues(t, 0, count)
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				count, _ := app.CountRecords("user_settings")
				assert.EqualValues(t, 0, count)
			},
		},
		{
			Name:   "Readonly cannot create module settings collection records",
			Method: http.MethodPost,
			URL:    "/api/collections/module_settings/records",
			Headers: map[string]string{
				"Authorization": userReadonlyToken,
			},
			Body:            strings.NewReader(fmt.Sprintf(`{"user":"%s","module_id":"network-topology","enabled":false}`, userReadonly.Id)),
			ExpectedStatus:  400,
			ExpectedContent: []string{"Failed to create record."},
			TestAppFactory:  testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				count, _ := app.CountRecords("module_settings")
				assert.EqualValues(t, 0, count)
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				count, _ := app.CountRecords("module_settings")
				assert.EqualValues(t, 0, count)
			},
		},
		{
			Name:   "Readonly cannot delete agent pairing code collection records",
			Method: http.MethodDelete,
			URL:    fmt.Sprintf("/api/collections/agent_pairing_codes/records/%s", readonlyPairingCode.Id),
			Headers: map[string]string{
				"Authorization": userReadonlyToken,
			},
			ExpectedStatus:  404,
			ExpectedContent: []string{"resource wasn't found"},
			TestAppFactory:  testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				count, _ := app.CountRecords("agent_pairing_codes")
				assert.EqualValues(t, 1, count)
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				count, _ := app.CountRecords("agent_pairing_codes")
				assert.EqualValues(t, 1, count)
			},
		},
		{
			Name:   "User 1 can delete user 2's system if SHARE_ALL_SYSTEMS is enabled",
			Method: http.MethodDelete,
			URL:    fmt.Sprintf("/api/collections/systems/records/%s", userTwoSystem.Id),
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus: 204,
			TestAppFactory: testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				t.Setenv("SHARE_ALL_SYSTEMS", "true")
				hub.SetCollectionAuthSettings()
				systemsCount, _ := app.CountRecords("systems")
				assert.EqualValues(t, 2, systemsCount)
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				t.Setenv("SHARE_ALL_SYSTEMS", "")
				hub.SetCollectionAuthSettings()
				systemsCount, _ := app.CountRecords("systems")
				assert.EqualValues(t, 1, systemsCount)
			},
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}
