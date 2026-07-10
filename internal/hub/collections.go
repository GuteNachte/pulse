package hub

import (
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/hub/utils"
)

type collectionRules struct {
	list   *string
	view   *string
	create *string
	update *string
	delete *string
}

// setCollectionAuthSettings applies Pulse collection auth settings.
func setCollectionAuthSettings(app core.App) error {
	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	superusersCollection, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		return err
	}

	// disable email auth if DISABLE_PASSWORD_AUTH env var is set
	disablePasswordAuth, _ := utils.GetEnv("DISABLE_PASSWORD_AUTH")
	usersCollection.PasswordAuth.Enabled = disablePasswordAuth != "true"
	usersCollection.PasswordAuth.IdentityFields = []string{"username", "email"}
	// allow oauth user creation if USER_CREATION is set
	if userCreation, _ := utils.GetEnv("USER_CREATION"); userCreation == "true" {
		cr := "@request.context = 'oauth2'"
		usersCollection.CreateRule = &cr
	} else {
		usersCollection.CreateRule = nil
	}

	// enable mfaOtp mfa if MFA_OTP env var is set
	mfaOtp, _ := utils.GetEnv("MFA_OTP")
	usersCollection.OTP.Length = 6
	superusersCollection.OTP.Length = 6
	usersCollection.OTP.Enabled = mfaOtp == "true"
	usersCollection.MFA.Enabled = mfaOtp == "true"
	superusersCollection.OTP.Enabled = mfaOtp == "true" || mfaOtp == "superusers"
	superusersCollection.MFA.Enabled = mfaOtp == "true" || mfaOtp == "superusers"
	if err := app.Save(superusersCollection); err != nil {
		return err
	}
	if err := app.Save(usersCollection); err != nil {
		return err
	}

	// When SHARE_ALL_SYSTEMS is enabled, any authenticated user can read
	// system-scoped data. Write rules continue to block readonly users.
	shareAllSystems, _ := utils.GetEnv("SHARE_ALL_SYSTEMS")

	authenticatedRule := "@request.auth.id != \"\""
	authenticatedNotReadonlyRule := authenticatedRule + " && @request.auth.role != \"readonly\""
	userMatchesRule := authenticatedRule + " && user = @request.auth.id"
	userMatchesNotReadonlyRule := userMatchesRule + " && @request.auth.role != \"readonly\""
	systemsMemberRule := authenticatedRule + " && users.id ?= @request.auth.id"
	systemMemberRule := authenticatedRule + " && system.users.id ?= @request.auth.id"

	systemsReadRule := systemsMemberRule
	systemScopedReadRule := systemMemberRule
	if shareAllSystems == "true" {
		systemsReadRule = authenticatedRule
		systemScopedReadRule = authenticatedRule
	}
	systemsWriteRule := systemsReadRule + " && @request.auth.role != \"readonly\""
	systemScopedWriteRule := systemScopedReadRule + " && @request.auth.role != \"readonly\""

	if err := applyCollectionRules(app, []string{"alerts"}, collectionRules{
		list:   &userMatchesRule,
		create: &userMatchesNotReadonlyRule,
		update: &userMatchesNotReadonlyRule,
		delete: &userMatchesNotReadonlyRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"alerts_history"}, collectionRules{
		list:   &userMatchesRule,
		delete: &userMatchesNotReadonlyRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"user_settings"}, collectionRules{
		list:   &userMatchesRule,
		create: &userMatchesNotReadonlyRule,
		update: &userMatchesNotReadonlyRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"module_settings"}, collectionRules{
		list:   &userMatchesRule,
		view:   &userMatchesRule,
		create: &userMatchesNotReadonlyRule,
		update: &userMatchesNotReadonlyRule,
		delete: nil,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"assets", "asset_interfaces", "asset_relations", "asset_maintenance", "asset_locations"}, collectionRules{
		list:   &userMatchesRule,
		view:   &userMatchesRule,
		create: &userMatchesNotReadonlyRule,
		update: &userMatchesNotReadonlyRule,
		delete: &userMatchesNotReadonlyRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"asset_changes"}, collectionRules{
		list:   &userMatchesRule,
		view:   &userMatchesRule,
		create: nil,
		update: nil,
		delete: nil,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"systems"}, collectionRules{
		list:   &systemsReadRule,
		view:   &systemsReadRule,
		create: &systemsWriteRule,
		update: &systemsWriteRule,
		delete: &systemsWriteRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"containers", "container_stats", "system_stats", "monitored_services", "monitored_software"}, collectionRules{
		list: &systemScopedReadRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"smart_devices"}, collectionRules{
		list:   &systemScopedReadRule,
		view:   &systemScopedReadRule,
		delete: &systemScopedWriteRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"fingerprints"}, collectionRules{
		list: &systemScopedReadRule,
		view: &systemScopedReadRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"system_details"}, collectionRules{
		list: &systemScopedReadRule,
		view: &systemScopedReadRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"operation_actions"}, collectionRules{
		list:   &systemScopedReadRule,
		view:   &systemScopedReadRule,
		create: nil,
		update: nil,
		delete: nil,
	}); err != nil {
		return err
	}

	operationAuditReadRule := authenticatedRule + " && (user = @request.auth.id || system.users.id ?= @request.auth.id)"
	if shareAllSystems == "true" {
		operationAuditReadRule = authenticatedRule + " && (user = @request.auth.id || system != \"\")"
	}
	if err := applyCollectionRules(app, []string{"operation_audit"}, collectionRules{
		list: &operationAuditReadRule,
		view: &operationAuditReadRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"script_templates"}, collectionRules{
		list:   &authenticatedRule,
		view:   &authenticatedRule,
		create: &authenticatedNotReadonlyRule,
		update: &authenticatedNotReadonlyRule,
		delete: &authenticatedNotReadonlyRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"service_control_rules"}, collectionRules{
		list:   &systemScopedReadRule,
		view:   &systemScopedReadRule,
		create: &systemScopedWriteRule,
		update: &systemScopedWriteRule,
		delete: &systemScopedWriteRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"software_monitor_rules", "container_monitor_rules"}, collectionRules{
		list:   &systemScopedReadRule,
		view:   &systemScopedReadRule,
		create: &systemScopedWriteRule,
		update: &systemScopedWriteRule,
		delete: &systemScopedWriteRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"notification_failures"}, collectionRules{
		list:   &userMatchesRule,
		view:   &userMatchesRule,
		create: nil,
		update: nil,
		delete: &userMatchesNotReadonlyRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"notification_channel_health", "alert_notification_states"}, collectionRules{
		list:   &userMatchesRule,
		view:   &userMatchesRule,
		create: nil,
		update: nil,
		delete: &userMatchesNotReadonlyRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"alert_policies"}, collectionRules{
		list:   &userMatchesRule,
		view:   &userMatchesRule,
		create: &userMatchesNotReadonlyRule,
		update: &userMatchesNotReadonlyRule,
		delete: &userMatchesNotReadonlyRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"agent_pairing_codes"}, collectionRules{
		list:   &userMatchesRule,
		view:   &userMatchesRule,
		create: nil,
		update: nil,
		delete: &userMatchesNotReadonlyRule,
	}); err != nil {
		return err
	}

	if err := applyCollectionRules(app, []string{"network_devices", "network_ports", "network_links", "network_layouts"}, collectionRules{
		list:   &userMatchesRule,
		view:   &userMatchesRule,
		create: &userMatchesNotReadonlyRule,
		update: &userMatchesNotReadonlyRule,
		delete: &userMatchesNotReadonlyRule,
	}); err != nil {
		return err
	}

	return nil
}

func applyCollectionRules(app core.App, collectionNames []string, rules collectionRules) error {
	for _, collectionName := range collectionNames {
		collection, err := app.FindCollectionByNameOrId(collectionName)
		if err != nil {
			return err
		}
		collection.ListRule = rules.list
		collection.ViewRule = rules.view
		collection.CreateRule = rules.create
		collection.UpdateRule = rules.update
		collection.DeleteRule = rules.delete
		if err := app.Save(collection); err != nil {
			return err
		}
	}
	return nil
}
