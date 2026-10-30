package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("systems")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("primary_use") == nil {
			collection.Fields.Add(&core.TextField{Name: "primary_use"})
		}
		if collection.Fields.GetByName("role") == nil {
			collection.Fields.Add(&core.TextField{Name: "role"})
		}
		if err := app.Save(collection); err != nil {
			return err
		}

		if _, err := app.DB().NewQuery(`
			UPDATE systems
			SET primary_use = CASE
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%主力%' THEN 'primary'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%开发%' THEN 'development'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%测试%' THEN 'testing'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%容器%' THEN 'container_host'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%网站%' THEN 'website'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%数据库%' THEN 'database'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%存储%' THEN 'storage'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%虚拟%' THEN 'virtualization_host'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%下载%' THEN 'download'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%媒体%' THEN 'media'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%备份%' THEN 'backup'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%监控%' THEN 'monitoring'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%网络%' THEN 'network'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%游戏%' THEN 'gaming'
				WHEN lower(coalesce(custom_role, '') || ' ' || coalesce(name, '')) LIKE '%实验%' THEN 'lab'
				ELSE 'production'
			END
			WHERE trim(coalesce(primary_use, '')) = ''
		`).Execute(); err != nil {
			return err
		}
		if _, err := app.DB().NewQuery(`
			UPDATE systems
			SET role = 'workstation'
			WHERE role = 'custom'
		`).Execute(); err != nil {
			return err
		}
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("systems")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("primary_use"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		return app.Save(collection)
	})
}
