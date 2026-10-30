package hub

import (
	"net/url"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func (h *Hub) bindCollectionAuditHooks() {
	for _, collectionName := range []string{
		"alerts",
		"alert_policies",
		"systems",
		"website_monitors",
		"user_settings",
		"fingerprints",
		"smart_devices",
		"alerts_history",
		"agent_pairing_codes",
		"service_control_rules",
		"software_monitor_rules",
		"container_monitor_rules",
		"notification_failures",
		"notification_channel_health",
		"alert_notification_states",
		"script_templates",
	} {
		h.App.OnRecordCreateRequest(collectionName).BindFunc(h.auditRecordCreateRequest)
		h.App.OnRecordUpdateRequest(collectionName).BindFunc(h.auditRecordUpdateRequest)
		h.App.OnRecordDeleteRequest(collectionName).BindFunc(h.auditRecordDeleteRequest)
	}
}

func (h *Hub) auditRecordCreateRequest(e *core.RecordRequestEvent) error {
	if err := e.Next(); err != nil {
		return err
	}
	h.auditRecordMutationRequest(e, "create")
	return nil
}

func (h *Hub) auditRecordUpdateRequest(e *core.RecordRequestEvent) error {
	if err := e.Next(); err != nil {
		return err
	}
	h.auditRecordMutationRequest(e, "update")
	return nil
}

func (h *Hub) auditRecordDeleteRequest(e *core.RecordRequestEvent) error {
	if err := e.Next(); err != nil {
		return err
	}
	h.auditRecordMutationRequest(e, "delete")
	return nil
}

func (h *Hub) auditRecordMutationRequest(e *core.RecordRequestEvent, verb string) {
	if e == nil || e.Record == nil || e.Auth == nil || e.Auth.Id == "" {
		return
	}
	collectionName := e.Record.Collection().Name
	action := recordAuditAction(verb, collectionName)
	systemID := recordAuditSystemID(collectionName, e.Record)
	target := recordAuditTarget(collectionName, e.Record)
	detail := "Collection API " + verb
	h.createOperationAuditForUser(e.RequestEvent, e.Auth.Id, systemID, action, target, "", "success", detail)
}

func recordAuditAction(verb string, collectionName string) string {
	switch collectionName {
	case "alerts":
		return verb + "_alert_rule"
	case "alert_policies":
		return verb + "_alert_policy"
	case "systems":
		return verb + "_system"
	case "website_monitors":
		return verb + "_website_monitor"
	case "user_settings":
		return verb + "_user_settings"
	case "fingerprints":
		return verb + "_agent_token"
	case "smart_devices":
		return verb + "_smart_device"
	case "alerts_history":
		return verb + "_alert_history"
	case "agent_pairing_codes":
		return verb + "_pairing_code"
	case "service_control_rules":
		return verb + "_service_control_rule"
	case "software_monitor_rules":
		return verb + "_software_monitor_rule"
	case "container_monitor_rules":
		return verb + "_container_monitor_rule"
	case "notification_failures":
		return verb + "_notification_failure"
	case "notification_channel_health":
		return verb + "_notification_channel_health"
	case "alert_notification_states":
		return verb + "_alert_notification_state"
	case "script_templates":
		return verb + "_script_template"
	default:
		return verb + "_" + collectionName
	}
}

func recordAuditSystemID(collectionName string, record *core.Record) string {
	if record == nil {
		return ""
	}
	if collectionName == "systems" {
		return record.Id
	}
	return strings.TrimSpace(record.GetString("system"))
}

func recordAuditTarget(collectionName string, record *core.Record) string {
	if record == nil {
		return collectionName
	}
	switch collectionName {
	case "alerts":
		return firstNonEmpty(record.GetString("name"), record.GetString("system"), record.Id)
	case "alert_policies":
		return firstNonEmpty(record.GetString("name"), record.Id)
	case "systems":
		return firstNonEmpty(record.GetString("display_name"), record.GetString("name"), record.Id)
	case "website_monitors":
		return firstNonEmpty(record.GetString("name"), record.Id)
	case "user_settings":
		return "user_settings"
	case "fingerprints":
		return firstNonEmpty(record.GetString("system"), record.Id)
	case "smart_devices":
		return firstNonEmpty(record.GetString("model"), record.GetString("name"), record.GetString("device"), record.Id)
	case "alerts_history":
		return firstNonEmpty(record.GetString("alert_id"), record.GetString("name"), record.Id)
	case "agent_pairing_codes":
		return firstNonEmpty(record.GetString("target_ip"), record.GetString("expected_ip"), record.GetString("hostname"), record.GetString("system"), record.Id)
	case "service_control_rules", "software_monitor_rules":
		return firstNonEmpty(record.GetString("name"), record.Id)
	case "container_monitor_rules":
		return firstNonEmpty(record.GetString("name"), record.GetString("container_id"), record.Id)
	case "notification_failures":
		return firstNonEmpty(notificationEndpointAuditTarget(record.GetString("target")), notificationEndpointAuditTarget(record.GetString("webhook")), record.Id)
	case "notification_channel_health":
		return firstNonEmpty(notificationEndpointAuditTarget(record.GetString("target")), record.GetString("fingerprint"), record.Id)
	case "alert_notification_states":
		return firstNonEmpty(record.GetString("title"), record.GetString("alert_id"), record.Id)
	case "script_templates":
		return firstNonEmpty(record.GetString("name"), record.Id)
	default:
		return record.Id
	}
}

func notificationEndpointAuditTarget(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return "notification target"
	}
	scheme := strings.TrimSpace(parsed.Scheme)
	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		host = strings.TrimSpace(parsed.Host)
	}
	if scheme != "" && host != "" {
		return scheme + "://" + host
	}
	if scheme != "" {
		return scheme
	}
	return "notification target"
}
