package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_visuals")
		if err != nil {
			return nil
		}
		if collection.Fields.GetByName("files") != nil {
			return nil
		}
		collection.Fields.Add(&core.FileField{
			Name:      "files",
			MaxSelect: 15,
			MaxSize:   4 << 20,
			MimeTypes: []string{"image/jpeg", "image/png", "image/webp"},
			Thumbs:    []string{"1280x1280f", "480x480f"},
		})
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_visuals")
		if err != nil {
			return nil
		}
		collection.Fields.RemoveByName("files")
		return app.Save(collection)
	})
}
