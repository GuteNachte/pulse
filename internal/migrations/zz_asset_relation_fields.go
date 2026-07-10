package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		assets, err := app.FindCollectionByNameOrId("assets")
		if err != nil {
			return err
		}
		if err := addAssetRelationField(app, "systems", assets.Id, true); err != nil {
			return err
		}
		if err := addAssetRelationField(app, "website_monitors", assets.Id, false); err != nil {
			return err
		}
		if err := addAssetRelationField(app, "network_ports", assets.Id, false); err != nil {
			return err
		}
		return nil
	}, func(app core.App) error {
		for _, collectionName := range []string{"systems", "website_monitors", "network_ports"} {
			collection, err := app.FindCollectionByNameOrId(collectionName)
			if err != nil {
				return err
			}
			if field := collection.Fields.GetByName("asset"); field != nil {
				collection.Fields.RemoveById(field.GetId())
				if err := app.Save(collection); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func addAssetRelationField(app core.App, collectionName string, assetsCollectionID string, cascadeDelete bool) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}
	if collection.Fields.GetByName("asset") != nil {
		return nil
	}
	collection.Fields.Add(&core.RelationField{
		Name:          "asset",
		CollectionId:  assetsCollectionID,
		MaxSelect:     1,
		CascadeDelete: cascadeDelete,
	})
	collection.Indexes = append(collection.Indexes, "CREATE INDEX `idx_"+collectionName+"_asset` ON `"+collectionName+"` (`asset`)")
	return app.Save(collection)
}
