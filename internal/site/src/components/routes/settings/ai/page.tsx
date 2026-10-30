import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsPageHeader } from "../components/page-header"
import AISettings from "../ai"
import ImageAgentSettings from "../image-agent-settings"
import ParameterAgentSettings from "../parameter-agent-settings"

const AI_TABS = ["service", "parameter", "image"] as const
type AITab = (typeof AI_TABS)[number]

function isAITab(value: string | null): value is AITab {
	return value === "service" || value === "parameter" || value === "image"
}

function initialTab(): AITab {
	if (typeof window === "undefined") {
		return "service"
	}
	const tab = new URLSearchParams(window.location.search).get("tab")
	return isAITab(tab) ? tab : "service"
}

export default function AIPage() {
	const [tab, setTab] = useState<AITab>(initialTab)

	function changeTab(value: string) {
		const next = isAITab(value) ? value : "service"
		setTab(next)
		if (typeof window === "undefined") {
			return
		}
		const url = new URL(window.location.href)
		url.searchParams.set("tab", next)
		window.history.replaceState(null, "", `${url.pathname}${url.search}`)
	}

	return (
		<div className="grid pulse-card-gap">
			<SettingsPageHeader
				eyebrow="资产与 AI"
				title="AI 能力"
				description="统一维护 AI 服务接入、参数填写 Agent 与图片获取 Agent 的行为配置；接入地址与 API Key 在「服务接入」标签维护，各能力共用。"
			/>
			<Tabs value={tab} onValueChange={changeTab} className="grid gap-4">
				<TabsList className="w-fit" aria-label="AI 能力">
					<TabsTrigger value="service">服务接入</TabsTrigger>
					<TabsTrigger value="parameter">参数 Agent</TabsTrigger>
					<TabsTrigger value="image">图片 Agent</TabsTrigger>
				</TabsList>
				<TabsContent value="service" className="mt-0">
					<AISettings />
				</TabsContent>
				<TabsContent value="parameter" className="mt-0">
					<ParameterAgentSettings />
				</TabsContent>
				<TabsContent value="image" className="mt-0">
					<ImageAgentSettings />
				</TabsContent>
			</Tabs>
		</div>
	)
}
