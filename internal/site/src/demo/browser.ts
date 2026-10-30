import { demoWorkerOptions } from "./browser-options.ts"
import { demoWorker } from "./worker.ts"

export async function startDemoBrowser() {
	await demoWorker.start(demoWorkerOptions)
}
