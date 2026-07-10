export type AssetDetailLoadToken = {
	assetId: string
	generation: number
}

export function createAssetDetailLoadGuard() {
	let current: AssetDetailLoadToken | undefined
	let generation = 0

	return {
		begin(assetId: string): AssetDetailLoadToken {
			generation += 1
			current = { assetId, generation }
			return current
		},
		current(): AssetDetailLoadToken | undefined {
			return current
		},
		isCurrent(token: AssetDetailLoadToken): boolean {
			return current?.assetId === token.assetId && current.generation === token.generation
		},
	}
}
