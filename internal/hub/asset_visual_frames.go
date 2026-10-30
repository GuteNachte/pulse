package hub

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/disintegration/imaging"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	_ "golang.org/x/image/webp"
)

const assetVisualMaxDownloadBytes int64 = 8 << 20
const assetVisualMaxDimension = 1600
const assetVisualMinLogoDimension = 16
const assetVisualMinLogoCanvas = 128
const assetVisualVerificationBatchSize = 4

func (h *Hub) buildCollectedAssetVisualFrames(asset *core.Record, references []map[string]any, limit int, color string) []map[string]any {
	if limit <= 0 {
		limit = defaultAssetVisualCandidateCount
	}
	if limit > defaultAssetVisualCandidateCount {
		limit = defaultAssetVisualCandidateCount
	}
	candidates := make([]map[string]any, 0, limit)
	referenceURLs := assetVisualModelReferenceURLs(references)
	preferredURLs := h.preferredAssetVisualReferenceURLs(referenceURLs, color)
	if len(referenceURLs) > 0 && strings.TrimSpace(color) != "" && len(preferredURLs) == 0 {
		return nil
	}
	preferredURLSet := map[string]bool{}
	for _, rawURL := range preferredURLs {
		preferredURLSet[strings.ToLower(strings.TrimSpace(rawURL))] = true
	}
	for _, source := range references {
		imageURL, _ := source["image_url"].(string)
		if imageURL == "" {
			imageURL, _ = source["url"].(string)
		}
		if !assetVisualReferenceSourceAccepted(asset, source) {
			continue
		}
		title, _ := source["title"].(string)
		sourceURL, _ := source["url"].(string)
		candidates = append(candidates, map[string]any{
			"url":              imageURL,
			"source_title":     title,
			"source_url":       sourceURL,
			"source_image_url": imageURL,
			"provider":         stringFromAny(source["provider"]),
			"color":            firstNonEmpty(stringFromAny(source["color"]), inferAssetVisualSourceColor(asset, color, strings.Join(nonEmptyStrings(title, sourceURL, imageURL), " "))),
			"presentation":     assetVisualPresentation(asset),
			"theme_score":      scoreAssetVisualNightCandidate(source),
			"visual_score":     scoreAssetVisualDisplayCandidate(source),
		})
	}
	if len(preferredURLSet) > 0 {
		filtered := make([]map[string]any, 0, len(candidates))
		for _, rawURL := range preferredURLs {
			key := strings.ToLower(strings.TrimSpace(rawURL))
			for _, candidate := range candidates {
				if strings.ToLower(strings.TrimSpace(stringFromAny(candidate["url"]))) == key {
					filtered = append(filtered, candidate)
					break
				}
			}
		}
		if len(filtered) > 0 {
			candidates = filtered
		}
	}
	if len(candidates) == 0 {
		return nil
	}
	frameLimit := limit
	if assetUsesProviderLogoVisual(asset) {
		// 服务商 Logo 保留少量候选供人工确认，避免把近似或低质量品牌图自动设为主图。
		frameLimit = len(candidates)
	} else if frameLimit > len(candidates) {
		frameLimit = len(candidates)
	}
	frames := make([]map[string]any, 0, frameLimit)
	orderedCandidates := orderAssetVisualThemeCandidates(candidates, frameLimit)
	for index := 0; index < frameLimit; index++ {
		source := orderedCandidates[index%len(orderedCandidates)]
		frames = append(frames, map[string]any{
			"index":            index,
			"view":             "candidate",
			"theme":            "candidate",
			"presentation":     stringFromAny(source["presentation"]),
			"label":            fmt.Sprintf("候选 %d", index+1),
			"color":            stringFromAny(source["color"]),
			"url":              source["url"],
			"source_title":     source["source_title"],
			"source_url":       source["source_url"],
			"source_image_url": source["source_image_url"],
			"provider":         source["provider"],
		})
	}
	return frames
}

type normalizedAssetVisualImage struct {
	Bytes       []byte
	ContentType string
	Extension   string
	Width       int
	Height      int
	Trimmed     bool
}

func (h *Hub) archiveCollectedAssetVisualFrames(asset *core.Record, references []map[string]any, limit int, color string, config assetVisualAIConfig) ([]map[string]any, []*filesystem.File, map[string]any) {
	candidates := h.buildCollectedAssetVisualFrames(asset, references, limit, color)
	frames := make([]map[string]any, 0, len(candidates))
	files := make([]*filesystem.File, 0, len(candidates))
	verificationInputs := make([]assetVisualVerificationInput, 0, len(candidates))
	skipped := make([]map[string]string, 0)
	for _, candidate := range candidates {
		if len(frames) >= limit {
			break
		}
		sourceImageURL := stringFromAny(candidate["source_image_url"])
		body, err := h.fetchAssetVisualImage(sourceImageURL, assetVisualMaxDownloadBytes)
		if err != nil {
			skipped = append(skipped, map[string]string{"source_image_url": sourceImageURL, "reason": "download_failed"})
			continue
		}
		var processed normalizedAssetVisualImage
		if assetUsesProviderLogoVisual(asset) {
			processed, err = normalizeAssetServiceLogoImage(body, sourceImageURL)
		} else {
			processed, err = normalizeAssetVisualImage(body, sourceImageURL)
		}
		if err != nil {
			skipped = append(skipped, map[string]string{"source_image_url": sourceImageURL, "reason": "image_processing_failed"})
			continue
		}
		if assetUsesProviderLogoVisual(asset) {
			decoded, _, decodeErr := image.Decode(bytes.NewReader(processed.Bytes))
			if decodeErr != nil || !isLikelyAssetServiceLogoRaster(decoded) {
				skipped = append(skipped, map[string]string{"source_image_url": sourceImageURL, "reason": "service_logo_photo_like"})
				continue
			}
		}
		file, err := filesystem.NewFileFromBytes(processed.Bytes, fmt.Sprintf("asset-visual-%02d.%s", len(frames)+1, processed.Extension))
		if err != nil {
			skipped = append(skipped, map[string]string{"source_image_url": sourceImageURL, "reason": "file_archive_failed"})
			continue
		}
		frame := cloneStringAnyMap(candidate)
		frame["processing"] = map[string]any{
			"stored_locally": true,
			"trimmed":        processed.Trimmed,
			"format":         processed.Extension,
			"width":          processed.Width,
			"height":         processed.Height,
		}
		frames = append(frames, frame)
		files = append(files, file)
		if dataURI, err := assetVisualVerificationDataURI(processed); err == nil {
			verificationInputs = append(verificationInputs, assetVisualVerificationInput{Index: len(frames) - 1, DataURI: dataURI})
		}
	}
	verificationSummary := map[string]any{"status": "official_rules_only"}
	if config.Ready() && len(verificationInputs) > 0 {
		verdicts, summary := h.verifyArchivedAssetVisualCandidates(asset, color, config, verificationInputs)
		verificationSummary = summary
		if len(verdicts) > 0 {
			acceptedFrames := make([]map[string]any, 0, len(frames))
			acceptedFiles := make([]*filesystem.File, 0, len(files))
			for index, frame := range frames {
				verdict, found := verdicts[index]
				if !found || !verdict.Accepted || verdict.Confidence < 85 {
					skipped = append(skipped, map[string]string{"source_image_url": stringFromAny(frame["source_image_url"]), "reason": "ai_accuracy_rejected"})
					continue
				}
				if verdict.Color != "" {
					frame["color"] = verdict.Color
				}
				frame["verification"] = map[string]any{"accepted": true, "confidence": verdict.Confidence, "reason": verdict.Reason, "color": verdict.Color}
				acceptedFrames = append(acceptedFrames, frame)
				acceptedFiles = append(acceptedFiles, files[index])
			}
			frames = acceptedFrames
			files = acceptedFiles
		}
	}
	for index := range frames {
		frames[index]["index"] = index
		frames[index]["label"] = fmt.Sprintf("候选 %d", index+1)
	}
	return frames, files, map[string]any{
		"stored_locally": len(files),
		"skipped":        skipped,
		"verification":   verificationSummary,
	}
}

type assetVisualVerificationInput struct {
	Index   int
	DataURI string
}

type assetVisualVerificationResult struct {
	Accepted   bool
	Confidence int
	Reason     string
	Color      string
}

func assetVisualVerificationDataURI(processed normalizedAssetVisualImage) (string, error) {
	decoded, _, err := image.Decode(bytes.NewReader(processed.Bytes))
	if err != nil {
		return "", err
	}
	thumbnail := imaging.Fit(decoded, 512, 512, imaging.Lanczos)
	var output bytes.Buffer
	if err := jpeg.Encode(&output, thumbnail, &jpeg.Options{Quality: 82}); err != nil {
		return "", err
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(output.Bytes()), nil
}

func buildAssetVisualVerificationPayload(asset *core.Record, color string, inputs []assetVisualVerificationInput, model string) (map[string]any, error) {
	if len(inputs) == 0 {
		return nil, errors.New("no visual verification inputs")
	}
	content := make([]any, 0, len(inputs)+1)
	content = append(content, map[string]any{
		"type": "text",
		"text": mustJSON(map[string]any{
			"task": "只判断已归档的官方候选图片是否准确匹配当前资产，不搜索、不生成、不返回 URL。",
			"asset": map[string]any{
				"name":           asset.GetString("name"),
				"type":           asset.GetString("type"),
				"vendor":         asset.GetString("vendor"),
				"model":          asset.GetString("model"),
				"internal_model": recordMetadataString(asset, "internal_model"),
				"selected_color": color,
			},
			"rules":  []string{"拒绝错误型号、不同变体、带水印、横幅、海报、色卡、Logo（实体设备）和非设备主体图", "只接受完整、清晰、与型号和颜色一致的设备图或服务商官方 Logo"},
			"output": `{"candidates":[{"index":0,"accepted":true,"confidence":0,"reason":"","color":""}]}`,
		}),
	})
	for _, input := range inputs {
		content = append(content, map[string]any{
			"type":      "image_url",
			"image_url": map[string]any{"url": input.DataURI, "detail": "low"},
		})
	}
	return map[string]any{
		"model":       model,
		"temperature": 0,
		"messages": []map[string]any{
			{"role": "system", "content": "你是资产图片准确性审核器。只能返回 JSON，不得查找、生成或猜测图片 URL。"},
			{"role": "user", "content": content},
		},
		"response_format": map[string]string{"type": "json_object"},
	}, nil
}

func (h *Hub) verifyArchivedAssetVisualCandidates(asset *core.Record, color string, config assetVisualAIConfig, inputs []assetVisualVerificationInput) (map[int]assetVisualVerificationResult, map[string]any) {
	allVerdicts := map[int]assetVisualVerificationResult{}
	attempts := 0
	for _, batch := range splitAssetVisualVerificationInputs(inputs) {
		payload, err := buildAssetVisualVerificationPayload(asset, color, batch, config.Model)
		if err != nil {
			return allVerdicts, map[string]any{"status": "request_build_failed", "attempts": attempts}
		}
		body, err := json.Marshal(payload)
		if err != nil {
			return allVerdicts, map[string]any{"status": "request_encode_failed", "attempts": attempts}
		}
		rawBody, batchAttempts, message := callAssetOnlineAIModel(assetOnlineAIConfig{Enabled: config.Enabled, Provider: config.Provider, Endpoint: config.Endpoint, APIKey: config.APIKey, Model: config.Model}, body)
		attempts += batchAttempts
		if message != "" {
			return allVerdicts, map[string]any{"status": "unavailable", "attempts": attempts, "error": truncateAssetVisualVerificationError(message)}
		}
		verdicts := parseAssetVisualVerificationResults(extractAssetOnlineAIContent(rawBody))
		if len(verdicts) == 0 {
			return allVerdicts, map[string]any{"status": "invalid_response", "attempts": attempts}
		}
		for index, verdict := range verdicts {
			allVerdicts[index] = verdict
		}
	}
	return allVerdicts, map[string]any{"status": "verified", "attempts": attempts, "accepted": countAcceptedAssetVisualVerificationResults(allVerdicts), "batches": len(splitAssetVisualVerificationInputs(inputs))}
}

func splitAssetVisualVerificationInputs(inputs []assetVisualVerificationInput) [][]assetVisualVerificationInput {
	if len(inputs) == 0 {
		return nil
	}
	result := make([][]assetVisualVerificationInput, 0, (len(inputs)+assetVisualVerificationBatchSize-1)/assetVisualVerificationBatchSize)
	for start := 0; start < len(inputs); start += assetVisualVerificationBatchSize {
		end := start + assetVisualVerificationBatchSize
		if end > len(inputs) {
			end = len(inputs)
		}
		result = append(result, inputs[start:end])
	}
	return result
}

func truncateAssetVisualVerificationError(message string) string {
	message = cleanOnlineText(message)
	if len([]rune(message)) <= 240 {
		return message
	}
	return string([]rune(message)[:240]) + "..."
}

func parseAssetVisualVerificationResults(content string) map[int]assetVisualVerificationResult {
	content = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(content, "```json"), "```"), "```"))
	var parsed struct {
		Candidates []struct {
			Index      int    `json:"index"`
			Accepted   bool   `json:"accepted"`
			Confidence int    `json:"confidence"`
			Reason     string `json:"reason"`
			Color      string `json:"color"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return nil
	}
	result := make(map[int]assetVisualVerificationResult, len(parsed.Candidates))
	for _, candidate := range parsed.Candidates {
		if candidate.Index < 0 || candidate.Confidence < 0 || candidate.Confidence > 100 {
			continue
		}
		result[candidate.Index] = assetVisualVerificationResult{Accepted: candidate.Accepted, Confidence: candidate.Confidence, Reason: cleanOnlineText(candidate.Reason), Color: cleanOnlineText(candidate.Color)}
	}
	return result
}

func countAcceptedAssetVisualVerificationResults(results map[int]assetVisualVerificationResult) int {
	count := 0
	for _, result := range results {
		if result.Accepted && result.Confidence >= 85 {
			count++
		}
	}
	return count
}

func (h *Hub) fetchAssetVisualImage(rawURL string, maxBytes int64) ([]byte, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, errors.New("invalid image URL")
	}
	req, err := http.NewRequest(http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
	req.Header.Set("User-Agent", "PulseAssetVisual/1.0")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, http.ErrNotSupported
	}
	if maxBytes > 0 && resp.ContentLength > maxBytes {
		return nil, errAssetOnlineResponseTooLarge
	}
	if contentType := strings.TrimSpace(resp.Header.Get("Content-Type")); contentType != "" {
		mediaType, _, parseErr := mime.ParseMediaType(contentType)
		if parseErr == nil && !strings.HasPrefix(strings.ToLower(mediaType), "image/") {
			return nil, errors.New("unsupported image content type")
		}
	}
	reader := io.Reader(resp.Body)
	if maxBytes > 0 {
		reader = io.LimitReader(resp.Body, maxBytes+1)
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	if len(body) == 0 || (maxBytes > 0 && int64(len(body)) > maxBytes) {
		return nil, errAssetOnlineResponseTooLarge
	}
	return body, nil
}

func normalizeAssetVisualImage(source []byte, sourceName string) (normalizedAssetVisualImage, error) {
	return normalizeAssetVisualImageWithMinimumDimension(source, sourceName, 24, false)
}

func normalizeAssetServiceLogoImage(source []byte, sourceName string) (normalizedAssetVisualImage, error) {
	return normalizeAssetVisualImageWithMinimumDimension(source, sourceName, assetVisualMinLogoDimension, true)
}

func isLikelyAssetServiceLogoRaster(source image.Image) bool {
	if source == nil {
		return false
	}
	bounds := source.Bounds()
	if bounds.Dx() < assetVisualMinLogoDimension || bounds.Dy() < assetVisualMinLogoDimension {
		return false
	}
	stepX := max(1, bounds.Dx()/48)
	stepY := max(1, bounds.Dy()/48)
	colors := make(map[uint16]struct{}, 72)
	for y := bounds.Min.Y; y < bounds.Max.Y; y += stepY {
		for x := bounds.Min.X; x < bounds.Max.X; x += stepX {
			r, g, b, _ := source.At(x, y).RGBA()
			bucket := uint16(r>>13)<<6 | uint16(g>>13)<<3 | uint16(b>>13)
			colors[bucket] = struct{}{}
			if len(colors) > 72 {
				return false
			}
		}
	}
	return true
}

func normalizeAssetVisualImageWithMinimumDimension(source []byte, sourceName string, minimumDimension int, expandSmallSquare bool) (normalizedAssetVisualImage, error) {
	_ = sourceName
	decoded, _, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		return normalizedAssetVisualImage{}, err
	}
	if decoded.Bounds().Dx() < minimumDimension || decoded.Bounds().Dy() < minimumDimension {
		return normalizedAssetVisualImage{}, errors.New("image is too small")
	}
	trimmedImage, trimmed := trimUniformAssetVisualPadding(decoded)
	resized := imaging.Fit(trimmedImage, assetVisualMaxDimension, assetVisualMaxDimension, imaging.Lanczos)
	if expandSmallSquare && resized.Bounds().Dx() < assetVisualMinLogoCanvas && resized.Bounds().Dy() < assetVisualMinLogoCanvas {
		resized = imaging.Resize(resized, assetVisualMinLogoCanvas, assetVisualMinLogoCanvas, imaging.NearestNeighbor)
	}
	result := normalizedAssetVisualImage{
		Width:   resized.Bounds().Dx(),
		Height:  resized.Bounds().Dy(),
		Trimmed: trimmed,
	}
	var output bytes.Buffer
	if assetVisualImageHasTransparency(resized) {
		result.ContentType = "image/png"
		result.Extension = "png"
		err = png.Encode(&output, resized)
	} else {
		result.ContentType = "image/jpeg"
		result.Extension = "jpg"
		err = jpeg.Encode(&output, resized, &jpeg.Options{Quality: 88})
	}
	if err != nil {
		return normalizedAssetVisualImage{}, err
	}
	result.Bytes = output.Bytes()
	return result, nil
}

func trimUniformAssetVisualPadding(source image.Image) (image.Image, bool) {
	bounds := source.Bounds()
	background, ok := uniformAssetVisualBorderColor(source, bounds)
	if !ok {
		return source, false
	}
	content := image.Rectangle{Min: image.Point{X: bounds.Max.X, Y: bounds.Max.Y}, Max: bounds.Min}
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			if assetVisualPixelDiffersFromBackground(source.At(x, y), background) {
				if x < content.Min.X {
					content.Min.X = x
				}
				if y < content.Min.Y {
					content.Min.Y = y
				}
				if x+1 > content.Max.X {
					content.Max.X = x + 1
				}
				if y+1 > content.Max.Y {
					content.Max.Y = y + 1
				}
			}
		}
	}
	if content.Empty() || content.Dx()*content.Dy()*8 < bounds.Dx()*bounds.Dy() {
		return source, false
	}
	padding := max(8, max(bounds.Dx(), bounds.Dy())/40)
	content = content.Inset(-padding)
	if content.Min.X < bounds.Min.X {
		content.Min.X = bounds.Min.X
	}
	if content.Min.Y < bounds.Min.Y {
		content.Min.Y = bounds.Min.Y
	}
	if content.Max.X > bounds.Max.X {
		content.Max.X = bounds.Max.X
	}
	if content.Max.Y > bounds.Max.Y {
		content.Max.Y = bounds.Max.Y
	}
	if content.Dx()*100 >= bounds.Dx()*96 && content.Dy()*100 >= bounds.Dy()*96 {
		return source, false
	}
	return imaging.Crop(source, content), true
}

func uniformAssetVisualBorderColor(source image.Image, bounds image.Rectangle) (color.NRGBA, bool) {
	points := []image.Point{
		{X: bounds.Min.X, Y: bounds.Min.Y},
		{X: bounds.Max.X - 1, Y: bounds.Min.Y},
		{X: bounds.Min.X, Y: bounds.Max.Y - 1},
		{X: bounds.Max.X - 1, Y: bounds.Max.Y - 1},
	}
	var totalR, totalG, totalB, totalA uint32
	colors := make([]color.NRGBA, 0, len(points))
	for _, point := range points {
		r, g, b, a := source.At(point.X, point.Y).RGBA()
		pixel := color.NRGBA{R: uint8(r >> 8), G: uint8(g >> 8), B: uint8(b >> 8), A: uint8(a >> 8)}
		colors = append(colors, pixel)
		totalR += uint32(pixel.R)
		totalG += uint32(pixel.G)
		totalB += uint32(pixel.B)
		totalA += uint32(pixel.A)
	}
	background := color.NRGBA{
		R: uint8(totalR / uint32(len(colors))),
		G: uint8(totalG / uint32(len(colors))),
		B: uint8(totalB / uint32(len(colors))),
		A: uint8(totalA / uint32(len(colors))),
	}
	if !(background.A < 16 || (background.R > 245 && background.G > 245 && background.B > 245) || (background.R < 12 && background.G < 12 && background.B < 12)) {
		return color.NRGBA{}, false
	}
	for _, pixel := range colors {
		if assetVisualColorDistance(pixel, background) > 14 {
			return color.NRGBA{}, false
		}
	}
	return background, true
}

func assetVisualPixelDiffersFromBackground(value color.Color, background color.NRGBA) bool {
	r, g, b, a := value.RGBA()
	pixel := color.NRGBA{R: uint8(r >> 8), G: uint8(g >> 8), B: uint8(b >> 8), A: uint8(a >> 8)}
	return assetVisualColorDistance(pixel, background) > 26
}

func assetVisualColorDistance(left color.NRGBA, right color.NRGBA) int {
	return assetVisualAbs(int(left.R)-int(right.R)) + assetVisualAbs(int(left.G)-int(right.G)) + assetVisualAbs(int(left.B)-int(right.B)) + assetVisualAbs(int(left.A)-int(right.A))
}

func assetVisualAbs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func assetVisualImageHasTransparency(source image.Image) bool {
	bounds := source.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			_, _, _, alpha := source.At(x, y).RGBA()
			if alpha < 0xffff {
				return true
			}
		}
	}
	return false
}

func isSelectableAssetVisualFrame(frame map[string]any) bool {
	if stringFromAny(frame["file"]) != "" {
		return true
	}
	if stringFromAny(frame["presentation"]) == "provider_logo" {
		return isLikelyAssetServiceLogoURL(stringFromAny(frame["url"]))
	}
	return isLikelyAssetVisualImageURL(stringFromAny(frame["url"]))
}

func (h *Hub) preferredAssetVisualReferenceURLs(referenceURLs []string, color string) []string {
	if len(referenceURLs) == 0 || strings.TrimSpace(color) == "" {
		return nil
	}
	return dedupeStrings(referenceURLs)
}

func orderAssetVisualThemeCandidates(candidates []map[string]any, limit int) []map[string]any {
	if len(candidates) <= 1 || limit <= 1 {
		return candidates
	}
	dayIndex := 0
	nightIndex := -1
	bestDayVisualScore := -1 << 30
	bestDayNightScore := int(^uint(0) >> 1)
	bestNightScore := -1
	bestNightVisualScore := -1 << 30
	for index, candidate := range candidates {
		nightScore := intFromAny(candidate["theme_score"])
		visualScore := intFromAny(candidate["visual_score"])
		if visualScore > bestDayVisualScore || (visualScore == bestDayVisualScore && nightScore < bestDayNightScore) {
			dayIndex = index
			bestDayVisualScore = visualScore
			bestDayNightScore = nightScore
		}
		if nightScore > bestNightScore || (nightScore == bestNightScore && visualScore > bestNightVisualScore) {
			nightIndex = index
			bestNightScore = nightScore
			bestNightVisualScore = visualScore
		}
	}
	if bestNightScore <= 0 {
		nightIndex = -1
		bestNightVisualScore = -1 << 30
		for index, candidate := range candidates {
			if index == dayIndex {
				continue
			}
			visualScore := intFromAny(candidate["visual_score"])
			if visualScore > bestNightVisualScore {
				nightIndex = index
				bestNightVisualScore = visualScore
			}
		}
	}
	if nightIndex < 0 {
		nightIndex = dayIndex
	}
	if dayIndex == nightIndex && len(candidates) > 1 {
		if dayIndex == 0 {
			nightIndex = 1
		} else {
			dayIndex = 0
		}
	}
	ordered := make([]map[string]any, 0, len(candidates))
	ordered = append(ordered, candidates[dayIndex])
	if nightIndex != dayIndex {
		ordered = append(ordered, candidates[nightIndex])
	}
	for index, candidate := range candidates {
		if index == dayIndex || index == nightIndex {
			continue
		}
		ordered = append(ordered, candidate)
	}
	return ordered
}

func scoreAssetVisualDisplayCandidate(source map[string]any) int {
	text := strings.ToLower(strings.Join(nonEmptyStrings(
		stringFromAny(source["image_url"]),
		stringFromAny(source["url"]),
		stringFromAny(source["title"]),
		stringFromAny(source["source_title"]),
		stringFromAny(source["type"]),
		stringFromAny(source["provider"]),
	), " "))
	score := 0
	if strings.Contains(text, "official_image") || strings.Contains(text, "asset_master") {
		score += 120
	}
	if strings.Contains(text, "official_product_bundle_image") {
		score += 12
	}
	for _, marker := range []string{"sw2-", "front", "back", "side", "appearance", "gallery", "main", "phone", "product"} {
		if strings.Contains(text, marker) {
			score += 20
		}
	}
	for _, marker := range []string{"spec-color", "color-overview", "colors-overview", "specs", "overview", "参数", "规格"} {
		if strings.Contains(text, marker) {
			score -= 18
		}
	}
	for _, marker := range []string{"logo", "screen", "cpu", "chip", "soc", "battery", "charge", "camera", "sample", "样张", "banner", "hero", "marketing", "poster", "promo"} {
		if strings.Contains(text, marker) {
			score -= 30
		}
	}
	return score
}

func scoreAssetVisualNightCandidate(source map[string]any) int {
	text := strings.ToLower(strings.Join(nonEmptyStrings(
		stringFromAny(source["image_url"]),
		stringFromAny(source["url"]),
		stringFromAny(source["title"]),
		stringFromAny(source["source_title"]),
		stringFromAny(source["type"]),
	), " "))
	score := 0
	for _, marker := range []string{
		"night",
		"dark",
		"black",
		"midnight",
		"obsidian",
		"shadow",
		"graphite",
		"墨",
		"黑",
		"夜",
		"暗",
		"玄",
		"幽芒",
		"墨羽",
	} {
		if strings.Contains(text, marker) {
			score += 10
		}
	}
	for _, marker := range []string{"white", "silver", "snow", "晴雪", "银", "白"} {
		if strings.Contains(text, marker) {
			score -= 6
		}
	}
	return score
}

func stringFromAny(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func intFromAny(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case float32:
		return int(typed)
	default:
		return 0
	}
}
