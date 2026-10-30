import { strict as assert } from "node:assert"
import { getAssetMediaRequestKey, notifyAssetMediaChanged, subscribeAssetMediaChanged } from "./asset-media-events.ts"

assert.notEqual(getAssetMediaRequestKey("detail", "asset-1"), getAssetMediaRequestKey("workspace", "asset-1"))

const target = new EventTarget()
let firstAssetRefreshes = 0
let secondAssetRefreshes = 0

const unsubscribeFirst = subscribeAssetMediaChanged(
	"asset-1",
	() => {
		firstAssetRefreshes += 1
	},
	target
)
const unsubscribeSecond = subscribeAssetMediaChanged(
	"asset-2",
	() => {
		secondAssetRefreshes += 1
	},
	target
)

notifyAssetMediaChanged("asset-1", target)
assert.equal(firstAssetRefreshes, 1)
assert.equal(secondAssetRefreshes, 0)

notifyAssetMediaChanged("asset-2", target)
assert.equal(firstAssetRefreshes, 1)
assert.equal(secondAssetRefreshes, 1)

unsubscribeFirst()
notifyAssetMediaChanged("asset-1", target)
assert.equal(firstAssetRefreshes, 1)

unsubscribeSecond()

let finishRefresh: (() => void) | undefined
const unsubscribeAsync = subscribeAssetMediaChanged(
	"asset-3",
	() =>
		new Promise<void>((resolve) => {
			finishRefresh = resolve
		}),
	target
)
let notificationFinished = false
const notification = notifyAssetMediaChanged("asset-3", target).then(() => {
	notificationFinished = true
})

await Promise.resolve()
assert.equal(notificationFinished, false)
finishRefresh?.()
await notification
assert.equal(notificationFinished, true)
unsubscribeAsync()
