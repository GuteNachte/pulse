package systems

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/entities/container"
	"gutenacht.site/pulse/internal/entities/service"
	"gutenacht.site/pulse/internal/entities/system"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func createMonitoredServiceRecords(app core.App, data []*service.Service, systemId string) ([]uint16, error) {
	if len(data) == 0 {
		return nil, nil
	}

	rules, err := app.FindRecordsByFilter(
		"service_control_rules",
		"system = {:system} && enabled = true",
		"",
		0,
		0,
		map[string]any{"system": systemId},
	)
	if err != nil {
		return nil, err
	}
	if len(rules) == 0 {
		return []uint16{0, 0}, nil
	}

	allowedServices := make(map[string]*core.Record, len(rules))
	for _, rule := range rules {
		allowedServices[serviceKey(rule.GetString("platform"), rule.GetString("name"))] = rule
	}

	dataByKey := make(map[string]*service.Service, len(data))
	for _, svc := range data {
		key := serviceKey(svc.Platform, svc.Name)
		if _, ok := allowedServices[key]; ok {
			dataByKey[key] = svc
		}
	}
	filteredData := make([]*service.Service, 0, len(rules))
	for key, rule := range allowedServices {
		if svc, ok := dataByKey[key]; ok {
			filteredData = append(filteredData, svc)
			continue
		}
		filteredData = append(filteredData, &service.Service{
			Name:     rule.GetString("name"),
			Platform: rule.GetString("platform"),
			State:    service.StateStopped,
		})
	}
	if len(filteredData) == 0 {
		return []uint16{0, 0}, nil
	}

	params := dbx.Params{
		"system":  systemId,
		"updated": time.Now().UTC().UnixMilli(),
	}

	valueStrings := make([]string, 0, len(filteredData))
	for i, svc := range filteredData {
		suffix := fmt.Sprintf("%d", i)
		valueStrings = append(valueStrings, fmt.Sprintf("({:id%[1]s}, {:system}, {:platform%[1]s}, {:name%[1]s}, {:displayName%[1]s}, {:state%[1]s}, {:startType%[1]s}, {:updated})", suffix))
		params["id"+suffix] = makeStableHashId(systemId, svc.Platform, svc.Name)
		params["platform"+suffix] = svc.Platform
		params["name"+suffix] = svc.Name
		params["displayName"+suffix] = svc.DisplayName
		params["state"+suffix] = svc.State
		params["startType"+suffix] = svc.StartType
	}
	queryString := fmt.Sprintf(
		"INSERT INTO monitored_services (id, system, platform, name, display_name, state, start_type, updated) VALUES %s ON CONFLICT(id) DO UPDATE SET system = excluded.system, platform = excluded.platform, name = excluded.name, display_name = excluded.display_name, state = excluded.state, start_type = excluded.start_type, updated = excluded.updated",
		strings.Join(valueStrings, ","),
	)
	_, err = app.DB().NewQuery(queryString).Bind(params).Execute()
	if err != nil {
		return nil, err
	}
	return monitoredServiceSummary(filteredData), nil
}

func createMonitoredSoftwareRecords(app core.App, data []*service.Service, systemId string) error {
	if len(data) == 0 {
		return nil
	}
	rules, err := app.FindRecordsByFilter(
		"software_monitor_rules",
		"system = {:system} && enabled = true",
		"",
		0,
		0,
		map[string]any{"system": systemId},
	)
	if err != nil {
		return err
	}
	if len(rules) == 0 {
		return nil
	}
	allowedSoftware := make(map[string]*core.Record, len(rules))
	for _, rule := range rules {
		allowedSoftware[monitoredSoftwareKey(rule.GetString("name"))] = rule
	}
	dataByKey := make(map[string]*service.Service, len(data))
	for _, item := range data {
		key := monitoredSoftwareKey(item.Name)
		if _, ok := allowedSoftware[key]; ok {
			dataByKey[key] = item
		}
	}
	filteredData := make([]*service.Service, 0, len(rules))
	for key, rule := range allowedSoftware {
		if item, ok := dataByKey[key]; ok {
			filteredData = append(filteredData, item)
			continue
		}
		filteredData = append(filteredData, &service.Service{
			Name:        rule.GetString("name"),
			DisplayName: rule.GetString("display_name"),
			Platform:    rule.GetString("platform"),
			State:       service.StateStopped,
		})
	}
	params := dbx.Params{
		"system":  systemId,
		"updated": time.Now().UTC().UnixMilli(),
	}

	valueStrings := make([]string, 0, len(filteredData))
	for i, item := range filteredData {
		suffix := fmt.Sprintf("%d", i)
		valueStrings = append(valueStrings, fmt.Sprintf("({:id%[1]s}, {:system}, {:platform%[1]s}, {:name%[1]s}, {:displayName%[1]s}, {:state%[1]s}, {:updated})", suffix))
		params["id"+suffix] = makeStableHashId(systemId, item.Platform, item.Name)
		params["platform"+suffix] = item.Platform
		params["name"+suffix] = item.Name
		params["displayName"+suffix] = item.DisplayName
		params["state"+suffix] = item.State
	}
	queryString := fmt.Sprintf(
		"INSERT INTO monitored_software (id, system, platform, name, display_name, state, updated) VALUES %s ON CONFLICT(id) DO UPDATE SET system = excluded.system, platform = excluded.platform, name = excluded.name, display_name = excluded.display_name, state = excluded.state, updated = excluded.updated",
		strings.Join(valueStrings, ","),
	)
	_, err = app.DB().NewQuery(queryString).Bind(params).Execute()
	if err != nil {
		return err
	}
	_, _ = app.DB().NewQuery(
		"DELETE FROM monitored_software WHERE system = {:system} AND name NOT IN (" + placeholdersForRuleNames(rules, params) + ")",
	).Bind(params).Execute()
	return err
}

func placeholdersForRuleNames(rules []*core.Record, params dbx.Params) string {
	placeholders := make([]string, 0, len(rules))
	for i, rule := range rules {
		key := fmt.Sprintf("ruleName%d", i)
		placeholders = append(placeholders, "{:"+key+"}")
		params[key] = rule.GetString("name")
	}
	if len(placeholders) == 0 {
		return "''"
	}
	return strings.Join(placeholders, ",")
}

func monitoredServiceSummary(services []*service.Service) []uint16 {
	nonRunning := uint16(0)
	for _, svc := range services {
		if svc.State != service.StateRunning {
			nonRunning++
		}
	}
	return []uint16{uint16(len(services)), nonRunning}
}

func serviceKey(platform string, name string) string {
	return strings.ToLower(strings.TrimSpace(platform)) + ":" + strings.ToLower(strings.TrimSpace(name))
}

func monitoredSoftwareKey(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func (sys *System) getMonitoredServiceNames() []string {
	if sys.manager == nil || sys.manager.hub == nil {
		return nil
	}
	if sys.ctx != nil && sys.ctx.Err() != nil {
		return nil
	}
	if !sys.supportsWindowsServiceMonitoring() {
		return nil
	}
	rules, err := sys.manager.hub.FindRecordsByFilter(
		"service_control_rules",
		"system = {:system} && enabled = true",
		"name",
		0,
		0,
		map[string]any{"system": sys.Id},
	)
	if err != nil {
		sys.manager.hub.Logger().Warn("Failed to load monitored services", "system", sys.Id, "err", err)
		return nil
	}
	names := make([]string, 0, len(rules))
	for _, rule := range rules {
		name := strings.TrimSpace(rule.GetString("name"))
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

func (sys *System) getMonitoredSoftwareNames() []string {
	if sys.manager == nil || sys.manager.hub == nil {
		return nil
	}
	if sys.ctx != nil && sys.ctx.Err() != nil {
		return nil
	}
	if !sys.supportsSoftwareMonitoring() {
		return nil
	}
	rules, err := sys.manager.hub.FindRecordsByFilter(
		"software_monitor_rules",
		"system = {:system} && enabled = true",
		"name",
		0,
		0,
		map[string]any{"system": sys.Id},
	)
	if err != nil {
		sys.manager.hub.Logger().Warn("Failed to load monitored software", "system", sys.Id, "err", err)
		return nil
	}
	names := make([]string, 0, len(rules))
	for _, rule := range rules {
		name := strings.TrimSpace(rule.GetString("name"))
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

func createSystemDetailsRecord(app core.App, data *system.Details, systemId string) error {
	collectionName := "system_details"
	networkInterfaces, err := json.Marshal(data.NetworkInterfaces)
	if err != nil {
		return err
	}
	memoryModules, err := json.Marshal(data.MemoryModules)
	if err != nil {
		return err
	}
	virtualization, err := json.Marshal(data.Virtualization)
	if err != nil {
		return err
	}
	params := dbx.Params{
		"id":                        systemId,
		"system":                    systemId,
		"hostname":                  data.Hostname,
		"kernel":                    data.Kernel,
		"cores":                     data.Cores,
		"threads":                   data.Threads,
		"cpu":                       data.CpuModel,
		"cpu_vendor":                data.CpuVendor,
		"cpu_frequency_mhz":         data.CpuFrequencyMhz,
		"os":                        data.Os,
		"os_name":                   data.OsName,
		"arch":                      data.Arch,
		"memory":                    data.MemoryTotal,
		"podman":                    data.Podman,
		"container_runtime_name":    data.ContainerRuntimeName,
		"container_runtime_version": data.ContainerRuntimeVersion,
		"network_interfaces":        string(networkInterfaces),
		"memory_modules":            string(memoryModules),
		"virtualization":            string(virtualization),
		"updated":                   time.Now().UTC(),
	}
	result, err := app.DB().Update(collectionName, params, dbx.HashExp{"id": systemId}).Execute()
	rowsAffected, _ := result.RowsAffected()
	if err != nil || rowsAffected == 0 {
		_, err = app.DB().Insert(collectionName, params).Execute()
	}
	return err
}

// createContainerRecords creates container records
func createContainerRecords(app core.App, data []*container.Stats, systemId string) error {
	if len(data) == 0 {
		return nil
	}
	// shared params for all records
	params := dbx.Params{
		"system":  systemId,
		"updated": time.Now().UTC().UnixMilli(),
	}
	valueStrings := make([]string, 0, len(data))
	currentIds := make([]string, 0, len(data))
	for i, container := range data {
		suffix := fmt.Sprintf("%d", i)
		valueStrings = append(valueStrings, fmt.Sprintf("({:id%[1]s}, {:system}, {:name%[1]s}, {:image%[1]s}, {:ports%[1]s}, {:status%[1]s}, {:health%[1]s}, {:cpu%[1]s}, {:memory%[1]s}, {:net%[1]s}, {:stackProject%[1]s}, {:stackService%[1]s}, {:stackNumber%[1]s}, {:stackConfig%[1]s}, {:stackWorkingDir%[1]s}, {:updated})", suffix))
		params["id"+suffix] = container.Id
		currentIds = append(currentIds, container.Id)
		params["name"+suffix] = container.Name
		params["image"+suffix] = container.Image
		params["ports"+suffix] = container.Ports
		params["status"+suffix] = container.Status
		params["health"+suffix] = container.Health
		params["cpu"+suffix] = container.Cpu
		params["memory"+suffix] = container.Mem
		stack := sanitizeContainerStackInfo(container)
		params["stackProject"+suffix] = strings.TrimSpace(stack.Project)
		params["stackService"+suffix] = strings.TrimSpace(stack.Service)
		params["stackNumber"+suffix] = strings.TrimSpace(stack.Number)
		params["stackConfig"+suffix] = strings.TrimSpace(stack.Config)
		params["stackWorkingDir"+suffix] = strings.TrimSpace(stack.WorkingDir)
		netBytes := container.Bandwidth[0] + container.Bandwidth[1]
		if netBytes == 0 {
			netBytes = uint64((container.NetworkSent + container.NetworkRecv) * 1024 * 1024)
		}
		params["net"+suffix] = netBytes
	}
	queryString := fmt.Sprintf(
		"INSERT INTO containers (id, system, name, image, ports, status, health, cpu, memory, net, stack_project, stack_service, stack_number, stack_config, stack_working_dir, updated) VALUES %s ON CONFLICT(id) DO UPDATE SET system = excluded.system, name = excluded.name, image = excluded.image, ports = excluded.ports, status = excluded.status, health = excluded.health, cpu = excluded.cpu, memory = excluded.memory, net = excluded.net, stack_project = excluded.stack_project, stack_service = excluded.stack_service, stack_number = excluded.stack_number, stack_config = excluded.stack_config, stack_working_dir = excluded.stack_working_dir, updated = excluded.updated",
		strings.Join(valueStrings, ","),
	)
	if _, err := app.DB().NewQuery(queryString).Bind(params).Execute(); err != nil {
		return err
	}
	return deleteStaleContainerRecords(app, systemId, currentIds)
}

func sanitizeContainerStackInfo(stats *container.Stats) container.StackInfo {
	if stats == nil || isPulseProtectedContainer(stats.Name, stats.Image) {
		return container.StackInfo{}
	}
	stack := stats.Stack
	stack.Project = strings.TrimSpace(stack.Project)
	stack.Service = strings.TrimSpace(stack.Service)
	stack.Number = strings.TrimSpace(stack.Number)
	stack.Config = strings.TrimSpace(stack.Config)
	stack.WorkingDir = strings.TrimSpace(stack.WorkingDir)
	if !isTrustedContainerStackInfo(stack) {
		return container.StackInfo{}
	}
	return stack
}

func isTrustedContainerStackInfo(stack container.StackInfo) bool {
	if stack.Project == "" || stack.Service == "" {
		return false
	}
	if stack.Trusted {
		return true
	}
	// Older 1.0.x agents did not send the Trusted bit. Keep accepting their
	// complete Compose label sets, but never group containers from only a
	// project label or other partial metadata.
	return stack.Config != "" || stack.WorkingDir != "" || stack.Number != ""
}

func isPulseProtectedContainer(name string, image string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	image = strings.ToLower(strings.TrimSpace(image))
	return strings.Contains(name, "pulse-hub") ||
		strings.Contains(image, "pulse-hub") ||
		strings.Contains(name, "pulse-agent") ||
		strings.Contains(image, "pulse-agent")
}

func deleteStaleContainerRecords(app core.App, systemId string, currentIds []string) error {
	if len(currentIds) == 0 {
		return nil
	}
	params := dbx.Params{"system": systemId}
	placeholders := make([]string, 0, len(currentIds))
	for i, id := range currentIds {
		key := fmt.Sprintf("id%d", i)
		params[key] = id
		placeholders = append(placeholders, "{:"+key+"}")
	}
	query := fmt.Sprintf(
		"DELETE FROM containers WHERE system = {:system} AND id NOT IN (%s)",
		strings.Join(placeholders, ","),
	)
	_, err := app.DB().NewQuery(query).Bind(params).Execute()
	return err
}
