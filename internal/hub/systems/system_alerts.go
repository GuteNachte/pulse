package systems

import (
	"fmt"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/alerts"

	"gutenacht.site/pulse/internal/entities/container"
	"gutenacht.site/pulse/internal/entities/service"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type containerAlertTarget struct {
	id       string
	name     string
	value    int
	detail   string
	recovery string
}

type importantMonitoringAlertTarget struct {
	id       string
	kind     string
	name     string
	value    int
	detail   string
	recovery string
}

func (sys *System) syncImportantMonitoringAlertHistory(systemRecord *core.Record, kind string, data []*service.Service) error {
	if sys.manager == nil || sys.manager.hub == nil || systemRecord == nil {
		return nil
	}
	userIDs := systemRecord.GetStringSlice("users")
	if len(userIDs) == 0 {
		return nil
	}

	currentTargets, err := sys.buildImportantMonitoringAlertTargets(kind, data)
	if err != nil {
		return err
	}
	currentIDs := make(map[string]struct{}, len(currentTargets))
	for id := range currentTargets {
		currentIDs[id] = struct{}{}
	}
	if err := sys.resolveMissingImportantMonitoringAlerts(systemRecord, kind, currentIDs); err != nil {
		return err
	}

	for _, target := range currentTargets {
		for _, userID := range userIDs {
			if strings.TrimSpace(userID) == "" {
				continue
			}
			created, err := sys.createImportantMonitoringAlertHistory(systemRecord, userID, target)
			if err != nil {
				return err
			}
			if created {
				sys.sendImportantMonitoringAlertNotification(systemRecord, userID, target, false)
			}
		}
	}
	return nil
}

func (sys *System) buildImportantMonitoringAlertTargets(kind string, data []*service.Service) (map[string]importantMonitoringAlertTarget, error) {
	rulesCollection, prefix, label := importantMonitoringAlertMeta(kind)
	if rulesCollection == "" {
		return nil, nil
	}
	rules, err := sys.manager.hub.FindRecordsByFilter(
		rulesCollection,
		"system = {:system} && enabled = true",
		"",
		0,
		0,
		dbx.Params{"system": sys.Id},
	)
	if err != nil {
		return nil, err
	}
	targets := make(map[string]importantMonitoringAlertTarget, len(rules))
	if len(rules) == 0 {
		return targets, nil
	}

	dataByKey := make(map[string]*service.Service, len(data))
	for _, item := range data {
		if item == nil {
			continue
		}
		switch kind {
		case "service":
			dataByKey[serviceKey(item.Platform, item.Name)] = item
		case "software":
			dataByKey[monitoredSoftwareKey(item.Name)] = item
		}
	}

	for _, rule := range rules {
		name := strings.TrimSpace(rule.GetString("name"))
		if name == "" {
			continue
		}
		platform := strings.TrimSpace(rule.GetString("platform"))
		key := monitoredSoftwareKey(name)
		idParts := []string{sys.Id, strings.ToLower(name)}
		if kind == "service" {
			key = serviceKey(platform, name)
			idParts = []string{sys.Id, strings.ToLower(platform), strings.ToLower(name)}
		}
		id := prefix + makeStableHashId(idParts...)
		if len(data) == 0 {
			targets[id] = importantMonitoringAlertTarget{id: id, kind: kind}
			continue
		}
		item := dataByKey[key]
		displayName := importantMonitoringDisplayName(kind, name, rule, item)
		if item != nil && item.State == service.StateRunning {
			targets[id] = importantMonitoringAlertTarget{id: id, kind: kind}
			continue
		}
		targets[id] = importantMonitoringAlertTarget{
			id:       id,
			kind:     kind,
			name:     label + "：" + displayName,
			value:    1,
			detail:   importantMonitoringAlertDetail(kind, item),
			recovery: fmt.Sprintf("%s %s 已恢复运行。", label, displayName),
		}
	}
	return targets, nil
}

func importantMonitoringAlertMeta(kind string) (collection string, prefix string, label string) {
	switch kind {
	case "service":
		return "service_control_rules", "service:", "服务"
	case "software":
		return "software_monitor_rules", "software:", "软件"
	default:
		return "", "", ""
	}
}

func importantMonitoringDisplayName(kind string, name string, rule *core.Record, item *service.Service) string {
	if item != nil && strings.TrimSpace(item.DisplayName) != "" {
		return strings.TrimSpace(item.DisplayName)
	}
	if rule != nil {
		switch kind {
		case "service":
			if note := strings.TrimSpace(rule.GetString("note")); note != "" {
				return note
			}
		case "software":
			if displayName := strings.TrimSpace(rule.GetString("display_name")); displayName != "" {
				return displayName
			}
		}
	}
	return strings.TrimSpace(name)
}

func importantMonitoringAlertDetail(kind string, item *service.Service) string {
	if item == nil {
		if kind == "service" {
			return "未找到服务"
		}
		return "未匹配到运行进程"
	}
	return "状态：" + serviceStateName(item.State)
}

func serviceStateName(state service.State) string {
	switch state {
	case service.StateRunning:
		return "运行中"
	case service.StateStopped:
		return "未运行"
	case service.StatePaused:
		return "已暂停"
	case service.StateStarting:
		return "启动中"
	case service.StateStopping:
		return "停止中"
	case service.StateOther:
		return "其他"
	default:
		return "未知"
	}
}

func (sys *System) resolveMissingImportantMonitoringAlerts(systemRecord *core.Record, kind string, currentIDs map[string]struct{}) error {
	_, prefix, _ := importantMonitoringAlertMeta(kind)
	if prefix == "" {
		return nil
	}
	records, err := sys.manager.hub.FindRecordsByFilter(
		"alerts_history",
		"system={:system} && resolved=null",
		"",
		0,
		0,
		dbx.Params{"system": systemRecord.Id},
	)
	if err != nil {
		return nil
	}
	for _, record := range records {
		alertID := record.GetString("alert_id")
		if !strings.HasPrefix(alertID, prefix) {
			continue
		}
		if _, ok := currentIDs[alertID]; ok {
			continue
		}
		record.Set("resolved", time.Now().UTC())
		setAlertHistoryAssetFromSystem(record, systemRecord)
		if err := sys.manager.hub.SaveNoValidate(record); err != nil {
			return err
		}
		sys.sendImportantMonitoringAlertNotification(systemRecord, record.GetString("user"), importantMonitoringAlertTarget{
			id:       alertID,
			kind:     kind,
			name:     record.GetString("name"),
			recovery: fmt.Sprintf("%s 已恢复。", strings.TrimPrefix(strings.TrimPrefix(record.GetString("name"), "服务："), "软件：")),
		}, true)
	}
	return nil
}

func (sys *System) createImportantMonitoringAlertHistory(systemRecord *core.Record, userID string, target importantMonitoringAlertTarget) (bool, error) {
	if target.name == "" || target.value <= 0 {
		return sys.resolveImportantMonitoringAlertHistory(systemRecord, userID, target)
	}
	existing, err := sys.manager.hub.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && user={:user} && system={:system} && resolved=null",
		dbx.Params{"alert_id": target.id, "user": userID, "system": systemRecord.Id},
	)
	if err == nil && existing != nil {
		changed := false
		if existing.GetString("name") != target.name {
			existing.Set("name", target.name)
			changed = true
		}
		if existing.GetFloat("value") != float64(target.value) {
			existing.Set("value", target.value)
			changed = true
		}
		if setAlertHistoryAssetFromSystem(existing, systemRecord) {
			changed = true
		}
		if changed {
			if err := sys.manager.hub.SaveNoValidate(existing); err != nil {
				return false, err
			}
		}
		return false, nil
	}

	collection, err := sys.manager.hub.FindCachedCollectionByNameOrId("alerts_history")
	if err != nil {
		return false, err
	}
	record := core.NewRecord(collection)
	record.Set("alert_id", target.id)
	record.Set("user", userID)
	record.Set("system", systemRecord.Id)
	setAlertHistoryAssetFromSystem(record, systemRecord)
	record.Set("name", target.name)
	record.Set("value", target.value)
	if err := sys.manager.hub.SaveNoValidate(record); err != nil {
		return false, err
	}
	return true, nil
}

func (sys *System) resolveImportantMonitoringAlertHistory(systemRecord *core.Record, userID string, target importantMonitoringAlertTarget) (bool, error) {
	record, err := sys.manager.hub.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && user={:user} && system={:system} && resolved=null",
		dbx.Params{"alert_id": target.id, "user": userID, "system": systemRecord.Id},
	)
	if err != nil || record == nil {
		return false, nil
	}
	record.Set("resolved", time.Now().UTC())
	setAlertHistoryAssetFromSystem(record, systemRecord)
	if err := sys.manager.hub.SaveNoValidate(record); err != nil {
		return false, err
	}
	target.name = record.GetString("name")
	sys.sendImportantMonitoringAlertNotification(systemRecord, userID, target, true)
	return true, nil
}

func setAlertHistoryAssetFromSystem(alertRecord *core.Record, systemRecord *core.Record) bool {
	if alertRecord == nil || systemRecord == nil {
		return false
	}
	assetID := strings.TrimSpace(systemRecord.GetString("asset"))
	if assetID == "" || alertRecord.GetString("asset") == assetID {
		return false
	}
	alertRecord.Set("asset", assetID)
	return true
}

func (sys *System) sendImportantMonitoringAlertNotification(systemRecord *core.Record, userID string, target importantMonitoringAlertTarget, resolved bool) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}
	systemName := strings.TrimSpace(systemRecord.GetString("name"))
	if systemName == "" {
		systemName = systemRecord.Id
	}
	_, _, label := importantMonitoringAlertMeta(target.kind)
	if label == "" {
		label = "监控项"
	}
	displayName := strings.TrimPrefix(strings.TrimPrefix(target.name, "服务："), "软件：")
	title := fmt.Sprintf("%s %s 异常", label, displayName)
	message := fmt.Sprintf("%s 上的%s状态异常。", systemName, label)
	if resolved {
		title = fmt.Sprintf("%s %s 已恢复", label, displayName)
		message = fmt.Sprintf("%s 上的%s已恢复。", systemName, label)
		if target.recovery != "" {
			message = fmt.Sprintf("%s\n%s", message, target.recovery)
		}
	} else if target.detail != "" {
		message = fmt.Sprintf("%s\n%s", message, target.detail)
	}
	if err := sys.manager.hub.SendAlert(alerts.AlertMessageData{
		UserID:    userID,
		SystemID:  systemRecord.Id,
		AssetID:   strings.TrimSpace(systemRecord.GetString("asset")),
		AlertID:   target.id,
		Title:     title,
		Message:   message,
		Link:      sys.manager.hub.MakeLink("system", systemRecord.Id),
		LinkText:  "查看机器",
		Resolved:  resolved,
		Important: true,
	}); err != nil {
		sys.manager.hub.Logger().Warn("Failed to send important monitoring alert", "system", systemRecord.Id, "alert", target.id, "err", err)
	}
}

func (sys *System) syncContainerAlertHistory(systemRecord *core.Record, data []*container.Stats) error {
	if sys.manager == nil || sys.manager.hub == nil || systemRecord == nil {
		return nil
	}
	userIDs := systemRecord.GetStringSlice("users")
	if len(userIDs) == 0 {
		return nil
	}

	currentTargets := buildContainerAlertTargets(sys.Id, data)
	currentIDs := make(map[string]struct{}, len(currentTargets))
	for id := range currentTargets {
		currentIDs[id] = struct{}{}
	}

	if err := sys.resolveMissingContainerAlerts(systemRecord, currentIDs); err != nil {
		return err
	}

	for _, target := range currentTargets {
		for _, userID := range userIDs {
			if strings.TrimSpace(userID) == "" {
				continue
			}
			created, err := sys.createContainerAlertHistory(systemRecord, userID, target)
			if err != nil {
				return err
			}
			if created {
				sys.sendContainerAlertNotification(systemRecord, userID, target, false)
			}
		}
	}
	return nil
}

func buildContainerAlertTargets(systemID string, data []*container.Stats) map[string]containerAlertTarget {
	targets := make(map[string]containerAlertTarget)
	stackAbnormalCounts := map[string]int{}
	stackDetails := map[string][]string{}
	stackNames := map[string]string{}
	normalIDs := make(map[string]struct{})

	for _, item := range data {
		if item == nil {
			continue
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = strings.TrimSpace(item.Id)
		}
		if name == "" {
			continue
		}
		project := strings.TrimSpace(item.Stack.Project)
		if project != "" {
			id := containerStackAlertID(systemID, project)
			normalIDs[id] = struct{}{}
			stackNames[id] = project
			if isContainerAlertAbnormal(item) {
				stackAbnormalCounts[id]++
				stackDetails[id] = append(stackDetails[id], fmt.Sprintf("%s：%s", name, containerAlertReason(item)))
			}
			continue
		}

		id := containerAlertID(systemID, name)
		normalIDs[id] = struct{}{}
		if isContainerAlertAbnormal(item) {
			targets[id] = containerAlertTarget{
				id:       id,
				name:     "容器：" + name,
				value:    1,
				detail:   containerAlertReason(item),
				recovery: fmt.Sprintf("容器 %s 已恢复运行。", name),
			}
		}
	}

	for id, count := range stackAbnormalCounts {
		if count <= 0 {
			continue
		}
		project := stackNames[id]
		targets[id] = containerAlertTarget{
			id:       id,
			name:     "编排：" + project,
			value:    count,
			detail:   strings.Join(stackDetails[id], "\n"),
			recovery: fmt.Sprintf("编排 %s 已恢复运行。", project),
		}
	}

	for id := range normalIDs {
		if _, ok := targets[id]; !ok {
			targets[id] = containerAlertTarget{id: id}
		}
	}
	return targets
}

func (sys *System) resolveMissingContainerAlerts(systemRecord *core.Record, currentIDs map[string]struct{}) error {
	records, err := sys.manager.hub.FindRecordsByFilter(
		"alerts_history",
		"system={:system} && resolved=null",
		"",
		0,
		0,
		dbx.Params{"system": systemRecord.Id},
	)
	if err != nil {
		return nil
	}
	for _, record := range records {
		alertID := record.GetString("alert_id")
		if !strings.HasPrefix(alertID, "container:") && !strings.HasPrefix(alertID, "container-stack:") {
			continue
		}
		if _, ok := currentIDs[alertID]; ok {
			continue
		}
		record.Set("resolved", time.Now().UTC())
		setAlertHistoryAssetFromSystem(record, systemRecord)
		if err := sys.manager.hub.SaveNoValidate(record); err != nil {
			return err
		}
		sys.sendContainerAlertNotification(systemRecord, record.GetString("user"), containerAlertTarget{
			id:       alertID,
			name:     record.GetString("name"),
			recovery: fmt.Sprintf("%s 已恢复。", strings.TrimPrefix(strings.TrimPrefix(record.GetString("name"), "容器："), "编排：")),
		}, true)
	}
	return nil
}

func (sys *System) createContainerAlertHistory(systemRecord *core.Record, userID string, target containerAlertTarget) (bool, error) {
	if target.name == "" || target.value <= 0 {
		return sys.resolveContainerAlertHistory(systemRecord, userID, target)
	}
	existing, err := sys.manager.hub.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && user={:user} && system={:system} && resolved=null",
		dbx.Params{"alert_id": target.id, "user": userID, "system": systemRecord.Id},
	)
	if err == nil && existing != nil {
		changed := false
		if existing.GetString("name") != target.name {
			existing.Set("name", target.name)
			changed = true
		}
		if existing.GetFloat("value") != float64(target.value) {
			existing.Set("value", target.value)
			changed = true
		}
		if setAlertHistoryAssetFromSystem(existing, systemRecord) {
			changed = true
		}
		if changed {
			if err := sys.manager.hub.SaveNoValidate(existing); err != nil {
				return false, err
			}
		}
		return false, nil
	}

	collection, err := sys.manager.hub.FindCachedCollectionByNameOrId("alerts_history")
	if err != nil {
		return false, err
	}
	record := core.NewRecord(collection)
	record.Set("alert_id", target.id)
	record.Set("user", userID)
	record.Set("system", systemRecord.Id)
	setAlertHistoryAssetFromSystem(record, systemRecord)
	record.Set("name", target.name)
	record.Set("value", target.value)
	if err := sys.manager.hub.SaveNoValidate(record); err != nil {
		return false, err
	}
	return true, nil
}

func (sys *System) resolveContainerAlertHistory(systemRecord *core.Record, userID string, target containerAlertTarget) (bool, error) {
	record, err := sys.manager.hub.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && user={:user} && system={:system} && resolved=null",
		dbx.Params{"alert_id": target.id, "user": userID, "system": systemRecord.Id},
	)
	if err != nil || record == nil {
		return false, nil
	}
	record.Set("resolved", time.Now().UTC())
	setAlertHistoryAssetFromSystem(record, systemRecord)
	if err := sys.manager.hub.SaveNoValidate(record); err != nil {
		return false, err
	}
	target.name = record.GetString("name")
	sys.sendContainerAlertNotification(systemRecord, userID, target, true)
	return true, nil
}

func (sys *System) sendContainerAlertNotification(systemRecord *core.Record, userID string, target containerAlertTarget, resolved bool) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}
	systemName := strings.TrimSpace(systemRecord.GetString("name"))
	if systemName == "" {
		systemName = systemRecord.Id
	}
	name := strings.TrimSpace(target.name)
	displayName := strings.TrimPrefix(strings.TrimPrefix(name, "容器："), "编排：")
	kind := "容器"
	if strings.HasPrefix(name, "编排：") {
		kind = "编排"
	}
	title := fmt.Sprintf("%s %s 异常", kind, displayName)
	message := fmt.Sprintf("%s 上的%s状态异常。", systemName, kind)
	if resolved {
		title = fmt.Sprintf("%s %s 已恢复", kind, displayName)
		message = fmt.Sprintf("%s 上的%s已恢复。", systemName, kind)
		if target.recovery != "" {
			message = fmt.Sprintf("%s\n%s", message, target.recovery)
		}
	} else if target.detail != "" {
		message = fmt.Sprintf("%s\n%s", message, target.detail)
	}
	if err := sys.manager.hub.SendAlert(alerts.AlertMessageData{
		UserID:    userID,
		SystemID:  systemRecord.Id,
		AssetID:   strings.TrimSpace(systemRecord.GetString("asset")),
		AlertID:   target.id,
		Title:     title,
		Message:   message,
		Link:      sys.manager.hub.MakeLink("system", systemRecord.Id),
		LinkText:  "查看机器",
		Resolved:  resolved,
		Important: true,
	}); err != nil {
		sys.manager.hub.Logger().Warn("Failed to send container alert", "system", systemRecord.Id, "alert", target.id, "err", err)
	}
}

func isContainerAlertAbnormal(item *container.Stats) bool {
	if item == nil {
		return false
	}
	if item.Health == container.DockerHealthUnhealthy {
		return true
	}
	status := strings.ToLower(strings.TrimSpace(item.Status))
	if status == "" {
		return false
	}
	if strings.HasPrefix(status, "up") || strings.Contains(status, "running") {
		return false
	}
	return strings.Contains(status, "exited") ||
		strings.Contains(status, "dead") ||
		strings.Contains(status, "stopped") ||
		strings.Contains(status, "created") ||
		strings.Contains(status, "paused")
}

func containerAlertReason(item *container.Stats) string {
	if item == nil {
		return "状态异常"
	}
	reasons := make([]string, 0, 2)
	status := strings.TrimSpace(item.Status)
	if status != "" && !containerStatusLooksRunning(status) {
		reasons = append(reasons, "状态："+status)
	}
	if item.Health == container.DockerHealthUnhealthy {
		reasons = append(reasons, "健康检查：unhealthy")
	}
	if len(reasons) == 0 {
		return "状态异常"
	}
	return strings.Join(reasons, "；")
}

func containerStatusLooksRunning(status string) bool {
	normalized := strings.ToLower(strings.TrimSpace(status))
	return strings.HasPrefix(normalized, "up") || strings.Contains(normalized, "running")
}

func containerAlertID(systemID string, name string) string {
	return "container:" + makeStableHashId(systemID, strings.ToLower(strings.TrimSpace(name)))
}

func containerStackAlertID(systemID string, project string) string {
	return "container-stack:" + makeStableHashId(systemID, strings.ToLower(strings.TrimSpace(project)))
}
