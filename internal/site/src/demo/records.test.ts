import assert from "node:assert/strict"
import { getRecord, listRecords, projectRecord } from "./records.ts"

const records = [
	{ id: "a", asset: "one", primary: true, name: "LAN 1" },
	{ id: "b", asset: "two", primary: false, name: "WAN" },
	{ id: "c", asset: "one", primary: false, name: "LAN 2" },
]

const url = new URL(
	"https://demo.invalid/api/collections/interfaces/records?filter=asset%20%3D%20%22one%22&sort=-name&page=1&perPage=1"
)
const result = listRecords(records, url)
assert.deepEqual(
	result.items.map((item) => item.id),
	["c"]
)
assert.equal(result.totalItems, 2)
assert.equal(result.totalPages, 2)
assert.deepEqual(projectRecord(records[0], "id,name"), { id: "a", name: "LAN 1" })
assert.deepEqual(getRecord(records, "b", "id,primary"), { id: "b", primary: false })

const booleanUrl = new URL(
	"https://demo.invalid/api/collections/interfaces/records?filter=asset%20%3D%20%22one%22%20%26%26%20primary%20%3D%20false"
)
assert.deepEqual(
	listRecords(records, booleanUrl).items.map((item) => item.id),
	["c"]
)

assert.throws(
	() => listRecords(records, new URL("https://demo.invalid/api/collections/interfaces/records?filter=name%20~%20LAN")),
	/Unsupported demo filter/
)

console.log("demo record query contract passed")
