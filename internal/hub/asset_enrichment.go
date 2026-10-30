package hub

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type assetEnrichmentActionRequest struct {
	Reason string `json:"reason"`
}

type assetEnrichmentBatchAcceptRequest struct {
	SuggestionIDs []string `json:"suggestion_ids"`
}

type assetEnrichmentReportRequest struct {
	Focus string `json:"focus"`
}

func (h *Hub) generateAssetEnrichmentReport(e *core.RequestEvent) error {
	assetID := strings.TrimSpace(e.Request.PathValue("id"))
	if assetID == "" {
		return e.BadRequestError("Missing asset id.", nil)
	}
	asset, err := h.findUserAssetRecord(assetID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	var req assetEnrichmentReportRequest
	_ = json.NewDecoder(e.Request.Body).Decode(&req)
	focus := normalizeAssetEnrichmentReportFocus(req.Focus)

	systems, err := h.FindRecordsByFilter(
		"systems",
		"asset = {:asset}",
		"name",
		-1,
		0,
		dbx.Params{"asset": asset.Id},
	)
	if err != nil {
		return e.InternalServerError("Failed to load bound systems.", err)
	}
	systems = filterSystemRecordsForUser(systems, e.Auth.Id)

	interfaces, err := h.FindRecordsByFilter(
		"asset_interfaces",
		"asset = {:asset} && user = {:user}",
		"-primary,kind,name",
		-1,
		0,
		dbx.Params{"asset": asset.Id, "user": e.Auth.Id},
	)
	if err != nil {
		return e.InternalServerError("Failed to load asset interfaces.", err)
	}

	details, err := h.loadSystemDetailRecords(systems)
	if err != nil {
		return e.InternalServerError("Failed to load Agent detail records.", err)
	}

	localSuggestions := h.buildAssetEnrichmentSuggestions(asset, systems, details, interfaces)
	onlineResult := h.collectAssetOnlineEnrichment(e.Request.Context(), asset, focus)
	suggestions := append(localSuggestions, onlineResult.Suggestions...)
	suggestions = filterAssetEnrichmentSuggestionsByFocus(suggestions, focus)
	suggestions = dedupeEnrichmentSuggestions(suggestions)
	reportRecord, err := h.createAssetEnrichmentReportRecord(e.Auth.Id, asset, systems, details, suggestions, onlineResult, focus)
	if err != nil {
		return e.InternalServerError("Failed to create enrichment report.", err)
	}
	for _, suggestion := range suggestions {
		if err := h.createAssetEnrichmentSuggestionRecord(e.Auth.Id, asset.Id, reportRecord.Id, suggestion); err != nil {
			return e.InternalServerError("Failed to create enrichment suggestion.", err)
		}
	}
	if err := h.createAssetEnrichmentAITask(e.Auth.Id, asset, reportRecord.Id, onlineResult, suggestions, focus); err != nil {
		return e.InternalServerError("Failed to create enrichment AI task.", err)
	}

	auditMessage := "资产补全报告已生成"
	if focus == "official_colors" {
		auditMessage = "资产官方配色补全报告已生成"
	}
	h.createOperationAudit(e, "", "asset_enrichment_report", asset.Id, "", "success", auditMessage)
	return e.JSON(http.StatusOK, map[string]any{
		"report":      reportRecord,
		"suggestions": len(suggestions),
		"focus":       focus,
	})
}

func (h *Hub) createAssetEnrichmentAITask(userID string, asset *core.Record, reportID string, onlineResult assetOnlineEnrichmentResult, suggestions []assetEnrichmentSuggestionInput, focus string) error {
	config := h.assetOnlineAIConfig()
	if !config.Enabled {
		return nil
	}
	collection, err := h.FindCachedCollectionByNameOrId("ai_tasks")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	status := "ready"
	errorMessage := ""
	if onlineResult.AI.Status == "failed" {
		status = "failed"
		errorMessage = onlineResult.AI.Error
	}
	if strings.TrimSpace(config.Endpoint) == "" || strings.TrimSpace(config.APIKey) == "" || strings.TrimSpace(config.Model) == "" {
		status = "failed"
		errorMessage = "AI 识别未配置完整 endpoint/api key/model"
	}
	record.Set("user", userID)
	record.Set("asset", asset.Id)
	record.Set("kind", "asset_enrichment")
	record.Set("status", status)
	record.Set("provider", config.Provider)
	record.Set("model", config.Model)
	record.Set("input_summary", map[string]any{
		"report":         reportID,
		"query":          onlineResult.Query,
		"source_count":   len(onlineResult.Sources),
		"endpoint_host":  safeAssetOnlineEndpointHost(config.Endpoint),
		"manual_trigger": true,
		"focus":          focus,
	})
	record.Set("output_summary", map[string]any{
		"ai_status":                     firstNonEmpty(onlineResult.AI.Status, status),
		"ai_attempts":                   onlineResult.AI.Attempts,
		"ai_suggestions":                onlineResult.AI.Suggestions,
		"ai_content_head":               onlineResult.AI.ContentHead,
		"source_discovery_status":       onlineResult.Discovery.Status,
		"source_discovery_attempts":     onlineResult.Discovery.Attempts,
		"source_discovery_source_count": onlineResult.Discovery.Suggestions,
		"source_discovery_error":        onlineResult.Discovery.Error,
		"total_suggestions":             len(suggestions),
		"providers":                     onlineResult.Providers,
		"focus":                         focus,
	})
	record.Set("error", errorMessage)
	record.Set("metadata", map[string]any{
		"report":         reportID,
		"source":         "asset_center_enrichment",
		"manual_trigger": true,
		"focus":          focus,
	})
	return h.Save(record)
}

func (h *Hub) acceptAssetEnrichmentSuggestion(e *core.RequestEvent) error {
	suggestionID := strings.TrimSpace(e.Request.PathValue("id"))
	if suggestionID == "" {
		return e.BadRequestError("Missing suggestion id.", nil)
	}
	suggestion, err := h.findUserEnrichmentSuggestion(suggestionID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Suggestion not found.", err)
	}
	if suggestion.GetString("status") != "pending" {
		return e.BadRequestError("Suggestion is not pending.", nil)
	}
	applications, records, err := h.prepareAssetEnrichmentBatchApplications(e.Auth.Id, []*core.Record{suggestion})
	if err != nil {
		if errors.Is(err, errAssetEnrichmentStale) {
			suggestion.Set("status", "stale")
			_ = h.Save(suggestion)
			_ = h.updateAssetEnrichmentReportStatus(suggestion.GetString("report"))
			return e.BadRequestError("资产主档当前值已变化，请重新生成补全报告。", err)
		}
		return e.BadRequestError(err.Error(), err)
	}
	if err := h.saveAssetEnrichmentBatchApplications(e.Auth.Id, applications, records); err != nil {
		return e.InternalServerError("Failed to accept enrichment suggestion.", err)
	}
	h.createOperationAudit(e, "", "asset_enrichment_accept", suggestion.GetString("asset"), "", "success", "资产补全建议已写入")
	return e.JSON(http.StatusOK, map[string]string{"status": "accepted"})
}

func (h *Hub) acceptAssetEnrichmentSuggestionsBatch(e *core.RequestEvent) error {
	var req assetEnrichmentBatchAcceptRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid request body.", err)
	}
	suggestionIDs := uniqueNonEmptyStrings(req.SuggestionIDs)
	if len(suggestionIDs) == 0 {
		return e.BadRequestError("Missing suggestion ids.", nil)
	}
	if len(suggestionIDs) > 50 {
		return e.BadRequestError("一次最多确认 50 条补全建议。", nil)
	}
	suggestions := make([]*core.Record, 0, len(suggestionIDs))
	for _, suggestionID := range suggestionIDs {
		suggestion, err := h.findUserEnrichmentSuggestion(suggestionID, e.Auth.Id)
		if err != nil {
			return e.NotFoundError("Suggestion not found.", err)
		}
		if suggestion.GetString("status") != "pending" {
			return e.BadRequestError("Suggestion is not pending.", nil)
		}
		suggestions = append(suggestions, suggestion)
	}
	applications, records, err := h.prepareAssetEnrichmentBatchApplications(e.Auth.Id, suggestions)
	if err != nil {
		if errors.Is(err, errAssetEnrichmentStale) {
			return e.BadRequestError("资产主档当前值已变化，请重新生成补全报告。", err)
		}
		return e.BadRequestError(err.Error(), err)
	}
	if err := h.saveAssetEnrichmentBatchApplications(e.Auth.Id, applications, records); err != nil {
		return e.InternalServerError("Failed to accept enrichment suggestions.", err)
	}
	h.createOperationAudit(e, "", "asset_enrichment_accept_batch", firstNonEmpty(suggestions[0].GetString("asset"), ""), "", "success", fmt.Sprintf("资产补全建议已批量写入 %d 条", len(applications)))
	return e.JSON(http.StatusOK, map[string]any{"status": "accepted", "accepted": len(applications)})
}

func (h *Hub) rejectAssetEnrichmentSuggestion(e *core.RequestEvent) error {
	suggestionID := strings.TrimSpace(e.Request.PathValue("id"))
	if suggestionID == "" {
		return e.BadRequestError("Missing suggestion id.", nil)
	}
	suggestion, err := h.findUserEnrichmentSuggestion(suggestionID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Suggestion not found.", err)
	}
	if suggestion.GetString("status") != "pending" {
		return e.BadRequestError("Suggestion is not pending.", nil)
	}
	var req assetEnrichmentActionRequest
	_ = json.NewDecoder(e.Request.Body).Decode(&req)
	metadata := recordJSONMap(suggestion, "metadata")
	if strings.TrimSpace(req.Reason) != "" {
		metadata["reject_reason"] = strings.TrimSpace(req.Reason)
	}
	suggestion.Set("metadata", metadata)
	suggestion.Set("status", "rejected")
	if err := h.Save(suggestion); err != nil {
		return e.InternalServerError("Failed to reject suggestion.", err)
	}
	if err := h.updateAssetEnrichmentReportStatus(suggestion.GetString("report")); err != nil {
		return e.InternalServerError("Failed to update report status.", err)
	}
	h.createOperationAudit(e, "", "asset_enrichment_reject", suggestion.GetString("asset"), "", "success", "资产补全建议已忽略")
	return e.JSON(http.StatusOK, map[string]string{"status": "rejected"})
}

func (h *Hub) updateAssetEnrichmentReportStatus(reportID string) error {
	return updateAssetEnrichmentReportStatusWithApp(h.App, reportID)
}
