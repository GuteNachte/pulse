package hub

import "github.com/pocketbase/pocketbase/core"

func setAssetMediaPlacementsVisible(placements []*core.Record, visible bool, sortOrder int) int {
	updated := 0
	for _, placement := range placements {
		if placement == nil {
			continue
		}
		placement.Set("visible", visible)
		placement.Set("sort_order", sortOrder)
		updated++
	}
	return updated
}
