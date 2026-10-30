package hub

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

type assetMediaStoredRecipe struct {
	Crop  assetMediaCrop `json:"crop"`
	Ratio string         `json:"ratio"`
}

func isLegacyAssetMediaRenderObjectKey(key string) bool {
	return strings.HasSuffix(strings.ReplaceAll(strings.TrimSpace(key), "\\", "/"), "/.jpg")
}

func assetMediaRenderObjectKey(assetID, mediaID, versionID string) string {
	return path.Join("renders", assetID, mediaID, versionID+".jpg")
}

func decodeAssetMediaStoredRecipe(version *core.Record) (assetMediaStoredRecipe, error) {
	var recipe assetMediaStoredRecipe
	raw, err := json.Marshal(version.Get("recipe"))
	if err == nil {
		if err := json.Unmarshal(raw, &recipe); err == nil && recipe.Ratio != "" {
			return recipe, nil
		}
	}
	if err := version.UnmarshalJSONField("recipe", &recipe); err != nil {
		return assetMediaStoredRecipe{}, err
	}
	if recipe.Ratio == "" {
		return assetMediaStoredRecipe{}, errors.New("media recipe ratio is missing")
	}
	return recipe, nil
}

func repairLegacyAssetMediaRenderVersion(store *assetMediaStore, version *core.Record, parent *core.Record) (bool, error) {
	if !isLegacyAssetMediaRenderObjectKey(version.GetString("object_key")) {
		return false, nil
	}
	recipe, err := decodeAssetMediaStoredRecipe(version)
	if err != nil {
		return false, err
	}
	if recipe.Ratio != "16:9" {
		return false, fmt.Errorf("unsupported legacy media ratio %q", recipe.Ratio)
	}
	sourcePath, err := store.pathFor(parent.GetString("object_key"))
	if err != nil {
		return false, err
	}
	source, err := os.ReadFile(sourcePath)
	if err != nil {
		return false, err
	}
	rendered, err := renderAssetMediaVersion(source, assetMediaRecipe{
		Crop:         recipe.Crop,
		OutputWidth:  assetMediaOutputWidth(recipe.Ratio),
		OutputHeight: assetMediaOutputHeight(recipe.Ratio),
	})
	if err != nil {
		return false, err
	}
	key := assetMediaRenderObjectKey(version.GetString("asset"), version.GetString("media"), version.Id)
	if _, err := store.write(key, rendered); err != nil {
		return false, err
	}
	version.Set("object_key", key)
	version.Set("mime_type", "image/jpeg")
	version.Set("bytes", len(rendered))
	version.Set("width", assetMediaOutputWidth(recipe.Ratio))
	version.Set("height", assetMediaOutputHeight(recipe.Ratio))
	return true, nil
}

func (h *Hub) repairLegacyAssetMediaVersions(versions []*core.Record) error {
	byID := make(map[string]*core.Record, len(versions))
	for _, version := range versions {
		byID[version.Id] = version
	}
	store := newAssetMediaStore(h.assetMediaStoreRoot())
	var repairErrors []error
	for _, version := range versions {
		if version.GetString("kind") != "render" || !isLegacyAssetMediaRenderObjectKey(version.GetString("object_key")) {
			continue
		}
		parent := byID[version.GetString("parent_version")]
		if parent == nil {
			repairErrors = append(repairErrors, fmt.Errorf("media version %s parent is missing", version.Id))
			continue
		}
		changed, err := repairLegacyAssetMediaRenderVersion(store, version, parent)
		if err != nil {
			repairErrors = append(repairErrors, fmt.Errorf("repair media version %s: %w", version.Id, err))
			continue
		}
		if changed {
			if err := h.Save(version); err != nil {
				repairErrors = append(repairErrors, fmt.Errorf("save repaired media version %s: %w", version.Id, err))
			}
		}
	}
	return errors.Join(repairErrors...)
}
