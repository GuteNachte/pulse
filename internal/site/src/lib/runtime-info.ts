import type { PulseInfo } from "@/types"
import { pb } from "./api"
import { setAgentHubURL } from "./utils"

export async function fetchPublicPulseInfo() {
	return await pb.send<PulseInfo>("/api/pulse/public-info", {
		headers: {
			Accept: "application/json",
		},
		requestKey: null,
	})
}

export async function fetchPulseInfo() {
	return await pb.send<PulseInfo>("/api/pulse/info", {
		headers: {
			Accept: "application/json",
		},
		requestKey: null,
	})
}

export async function syncAgentHubURLFromRuntime() {
	const info = await fetchPublicPulseInfo()
	if (info.agent_hub_url) {
		setAgentHubURL(info.agent_hub_url)
	}
	return info
}
