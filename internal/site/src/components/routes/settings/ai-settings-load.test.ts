import assert from "node:assert/strict"
import { loadAISettingsSnapshot } from "./ai-settings-load.ts"

type Deferred<T> = {
	promise: Promise<T>
	resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((next) => {
		resolve = next
	})
	return { promise, resolve }
}

const config = deferred<{ model: string }>()
const tasks = deferred<string[]>()
const calls: string[] = []

const snapshotPromise = loadAISettingsSnapshot(
	() => {
		calls.push("config")
		return config.promise
	},
	() => {
		calls.push("tasks")
		return tasks.promise
	}
)

assert.deepEqual(calls, ["config", "tasks"], "配置与最近任务应在同一轮刷新中并行开始读取")

config.resolve({ model: "agnes-2.0-flash" })
tasks.resolve(["asset_enrichment"])

assert.deepEqual(await snapshotPromise, {
	config: { model: "agnes-2.0-flash" },
	tasks: ["asset_enrichment"],
})
