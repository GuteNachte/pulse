import { mergeOfficialColorOptions } from "./asset-visual-color.ts"

function assertEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

assertEqual(mergeOfficialColorOptions(["墨羽黑"], "银迹"), ["银迹", "墨羽黑"])
assertEqual(mergeOfficialColorOptions(["墨羽黑"], "墨羽黑"), ["墨羽黑"])
assertEqual(mergeOfficialColorOptions(["墨羽黑"], " 墨羽黑 "), ["墨羽黑"])
