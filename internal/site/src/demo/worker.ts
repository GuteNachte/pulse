import { setupWorker } from "msw/browser"
import { demoHandlers } from "./handlers.ts"

export const demoWorker = setupWorker(...demoHandlers)
