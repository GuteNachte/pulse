package hub

func assetMediaLibraryFilter() string {
	return "asset = {:asset} && user = {:user} && state != 'deleted'"
}
