import type PocketBase from "pocketbase"
import { DEMO_TIMESTAMP, DEMO_USER_ID } from "./fixture-core.ts"

export const demoAuthToken =
	"eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJleHAiOjQxMDI0NDQ4MDAsImlkIjoiZGVtb191c2VyXzAwMDAxIiwidHlwZSI6ImF1dGgifQ.demo"

export const demoAuthRecord = {
	id: DEMO_USER_ID,
	collectionId: "demo_users",
	collectionName: "users",
	email: "visitor@demo.example.com",
	emailVisibility: false,
	verified: true,
	role: "readonly",
	name: "公开演示访客",
	avatar: "",
	created: DEMO_TIMESTAMP,
	updated: DEMO_TIMESTAMP,
	expand: {},
}

export function seedDemoAuth(client: PocketBase) {
	client.authStore.save(demoAuthToken, demoAuthRecord)
}

export function shouldUseRealtime(demoMode: boolean) {
	return !demoMode
}
