import type { AssetLocationPreset } from "./asset-location.ts"

export const customLocationOptionValue = "__custom__"
export const noSecondLocationOptionValue = "__none__"

export type AssetLocationPresetSelection = {
	rootName: string
	rootPreset: AssetLocationPreset | undefined
	secondName: string
	secondPreset: AssetLocationPreset | undefined
}

export function buildAssetLocationPresetSelection({
	rootSelection,
	secondSelection,
	customRoot,
	customSecond,
	rootPresets,
	secondPresets,
}: {
	rootSelection: string
	secondSelection: string
	customRoot: string
	customSecond: string
	rootPresets: AssetLocationPreset[]
	secondPresets: AssetLocationPreset[]
}): AssetLocationPresetSelection {
	const rootName = (rootSelection === customLocationOptionValue ? customRoot : rootSelection).trim()
	const secondName = (
		secondSelection === noSecondLocationOptionValue || !secondSelection
			? ""
			: secondSelection === customLocationOptionValue
				? customSecond
				: secondSelection
	).trim()
	return {
		rootName,
		rootPreset: rootPresets.find((preset) => preset.name === rootName),
		secondName,
		secondPreset: secondPresets.find((preset) => preset.name === secondName),
	}
}
