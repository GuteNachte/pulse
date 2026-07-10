import { createAssetDetailLoadGuard } from "./asset-detail-load-guard.ts"

const guard = createAssetDetailLoadGuard()

const first = guard.begin("asset-a")
if (!guard.isCurrent(first)) {
	throw new Error("The latest load token should be current.")
}

const second = guard.begin("asset-a")
if (guard.isCurrent(first)) {
	throw new Error("A prior refresh for the same asset must become stale.")
}
if (!guard.isCurrent(second)) {
	throw new Error("The newest refresh for the same asset should remain current.")
}

const third = guard.begin("asset-b")
if (guard.isCurrent(second)) {
	throw new Error("A request from the previous asset must not update the next asset page.")
}
if (!guard.isCurrent(third)) {
	throw new Error("The active asset load token should be current.")
}
