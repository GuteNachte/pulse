package assetcatalog

import (
	"embed"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

//go:embed asset-parameter-registry.json
var registryFS embed.FS

type CategoryDefinition struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Order int    `json:"order"`
}
type FieldDefinition struct {
	Key        string   `json:"key"`
	Label      string   `json:"label"`
	Scope      string   `json:"scope"`
	Category   string   `json:"category,omitempty"`
	Section    string   `json:"section,omitempty"`
	Order      int      `json:"order"`
	Source     string   `json:"source"`
	Capture    string   `json:"capture"`
	Type       string   `json:"type"`
	AssetTypes []string `json:"assetTypes"`
}
type ParameterRegistry struct {
	Version    int                  `json:"version"`
	Categories []CategoryDefinition `json:"categories"`
	Fields     []FieldDefinition    `json:"fields"`
	fieldIndex map[string]*FieldDefinition
}

func LoadParameterRegistry() (*ParameterRegistry, error) {
	data, err := registryFS.ReadFile("asset-parameter-registry.json")
	if err != nil {
		return nil, fmt.Errorf("read asset parameter registry: %w", err)
	}
	var registry ParameterRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		return nil, fmt.Errorf("decode asset parameter registry: %w", err)
	}
	registry.fieldIndex = make(map[string]*FieldDefinition, len(registry.Fields))
	for index := range registry.Fields {
		field := &registry.Fields[index]
		if strings.TrimSpace(field.Key) == "" {
			return nil, fmt.Errorf("asset parameter registry contains an empty field key")
		}
		if _, exists := registry.fieldIndex[field.Key]; exists {
			return nil, fmt.Errorf("asset parameter registry contains duplicate field %q", field.Key)
		}
		registry.fieldIndex[field.Key] = field
	}
	return &registry, nil
}

func MustParameterRegistry() *ParameterRegistry {
	registry, err := LoadParameterRegistry()
	if err != nil {
		panic(err)
	}
	return registry
}
func (r *ParameterRegistry) Field(key string) *FieldDefinition {
	if r == nil {
		return nil
	}
	return r.fieldIndex[key]
}
func (r *ParameterRegistry) AllowedMetadataKeys(assetType string) map[string]bool {
	allowed := map[string]bool{}
	for index := range r.Fields {
		field := &r.Fields[index]
		if field.Source == "metadata" && contains(field.AssetTypes, assetType) {
			allowed[field.Key] = true
		}
	}
	return allowed
}
func (r *ParameterRegistry) CategoryTitles() []string {
	categories := append([]CategoryDefinition(nil), r.Categories...)
	sort.SliceStable(categories, func(i, j int) bool { return categories[i].Order < categories[j].Order })
	titles := make([]string, 0, len(categories))
	for _, category := range categories {
		titles = append(titles, category.Title)
	}
	return titles
}
func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
