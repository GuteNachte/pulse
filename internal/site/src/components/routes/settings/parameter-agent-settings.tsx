import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { createLatestRequestGuard } from "@/lib/latest-request-guard"
import { isChatCapableAIModel } from "@/modules/asset-center/asset-ai-model-catalog"
import type { AITaskRecord } from "@/types"
import {
	AgentModelField,
	AgentTaskStatusCard,
	StatusChip,
	ToggleRow,
	getConfigErrorMessage,
	loadRecentAITasks,
} from "./ai-settings-shared"
import { SettingsSection, SettingsSectionStack } from "./components/section"

// 2026-10-11 设置页拆分：参数 Agent 设置——参数填写 Agent 的行为配置、执行日志与消耗统计。
// 接入地址与 API Key 在「AI 服务接入」页维护。
// 2026-10-14 参数获取下线：联网搜索链路（SearXNG / 来源发现 / 来源上限）移除，
// Agent 改为粘贴文本分类填写——用户粘贴参数文本，AI 按字段目录归类到各个分组。

type AssetEnrichmentConfig = {
	ai: {
		enabled: boolean
		model: string
	}
	available_models?: { id: string }[]
}

type ParameterAgentForm = {
	enabled: boolean
	model: string
}

const defaultForm: ParameterAgentForm = {
	enabled: false,
	model: "",
}

const parameterTaskLogFields = "id,status,provider,model,input_summary,output_summary,error,created"

export default function ParameterAgentSettings() {
	const [form, setForm] = useState<ParameterAgentForm>(defaultForm)
	const [modelOptions, setModelOptions] = useState<string[]>([])
	const [taskLog, setTaskLog] = useState<AITaskRecord[]>([])
	const [latestTask, setLatestTask] = useState<AITaskRecord>()
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const latestLoad = useRef(createLatestRequestGuard())

	const loadAll = useCallback(async () => {
		const request = latestLoad.current.begin()
		setLoading(true)
		try {
			const config = await pb.send<AssetEnrichmentConfig>("/api/pulse/asset-enrichment/config", { requestKey: null })
			if (!latestLoad.current.isCurrent(request)) return
			setForm({
				enabled: config.ai?.enabled ?? defaultForm.enabled,
				model: config.ai?.model ?? "",
			})
			setModelOptions(
				(config.available_models ?? []).map((item) => item.id).filter((id) => Boolean(id) && isChatCapableAIModel(id))
			)
			const tasks = await loadRecentAITasks()
			if (!latestLoad.current.isCurrent(request)) return
			setLatestTask(tasks.find((task) => task.kind === "asset_enrichment"))
			const logPage = await pb.send<{ items: AITaskRecord[] }>("/api/collections/ai_tasks/records", {
				method: "GET",
				query: {
					filter: 'kind="asset_enrichment"',
					sort: "-created",
					fields: parameterTaskLogFields,
					perPage: 10,
				},
				requestKey: null,
			})
			if (!latestLoad.current.isCurrent(request)) return
			setTaskLog(logPage.items ?? [])
		} catch {
			if (!latestLoad.current.isCurrent(request)) return
			toast({ title: "读取参数 Agent 配置失败", description: "请确认当前账号拥有管理员权限。", variant: "destructive" })
		} finally {
			if (latestLoad.current.isCurrent(request)) setLoading(false)
		}
	}, [])

	useEffect(() => {
		loadAll()
	}, [loadAll])

	async function saveConfig() {
		const request = latestLoad.current.begin()
		setSaving(true)
		try {
			await pb.send("/api/pulse/asset-enrichment/config", {
				method: "POST",
				body: {
					ai: {
						enabled: form.enabled,
						model: form.model,
					},
				},
			})
			if (!latestLoad.current.isCurrent(request)) return
			toast({ title: "参数 Agent 设置已保存", description: "后续参数填写会按这里的配置执行。" })
			await loadAll()
		} catch (error) {
			if (!latestLoad.current.isCurrent(request)) return
			toast({ title: "保存参数 Agent 设置失败", description: getConfigErrorMessage(error), variant: "destructive" })
		} finally {
			if (latestLoad.current.isCurrent(request)) setSaving(false)
		}
	}

	const successCount = taskLog.filter((task) => task.status === "ready").length
	const failedCount = taskLog.filter((task) => task.status === "failed").length

	return (
		<div className="grid pulse-card-gap">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<StatusChip
					label="参数 Agent"
					value={loading ? "读取中" : form.enabled ? "已启用" : "未启用"}
					active={form.enabled}
				/>
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" onClick={loadAll} disabled={loading || saving}>
						刷新
					</Button>
					<Button size="sm" onClick={saveConfig} disabled={loading || saving}>
						{saving ? "保存中" : "保存设置"}
					</Button>
				</div>
			</div>

			<SettingsSectionStack>
				<SettingsSection
					title="参数填写 Agent"
					description="在资产编辑页粘贴参数文本（官网、电商参数页或说明书复制的内容），Agent 自动分类到各个参数分组，勾选确认后写入。推荐执行模型：DeepSeek-V4-Flash（分类需要较强的指令遵循与 JSON 稳定性）。"
				>
					<div className="mt-3 grid gap-4">
						<ToggleRow
							label="启用参数填写"
							description="关闭后资产编辑页的参数填写入口不再可用；已确认的档案不受影响。"
							checked={form.enabled}
							onCheckedChange={(value) => setForm((current) => ({ ...current, enabled: value }))}
						/>
						<AgentModelField
							label="执行模型"
							value={form.model}
							onChange={(value) => setForm((current) => ({ ...current, model: value }))}
							placeholder="推荐 DeepSeek-V4-Flash"
							options={modelOptions.length > 0 ? modelOptions : undefined}
							requirements={[
								"上下文 32K 以上：用户粘贴的参数文本可能较长",
								"中文阅读理解：粘贴文本以中文官网与电商参数页为主",
								"JSON 输出稳定：按字段输出分类结果，格式乱会被视为未识别",
								"不需要联网能力：分类只读粘贴的文本，不访问网络",
							]}
						/>
						{modelOptions.length === 0 ? (
							<div className="rounded-md border border-dashed border-border/70 bg-surface-soft p-3 text-xs leading-relaxed text-muted-foreground">
								还没有官方模型列表：先到「服务接入」标签点「获取模型列表」，就能在这里下拉选择执行模型。
							</div>
						) : null}
						<div className="rounded-md border border-border/70 bg-surface-soft p-3 text-xs leading-relaxed text-muted-foreground">
							执行口径：Agent 只读用户粘贴的参数文本做分类，不联网搜索、不访问外部来源；
							识别结果按分组列出并默认勾选，取消勾选或关闭弹窗都不会写入；对不上预设字段的参数会列在「未识别」里，不写入档案。
						</div>
					</div>
				</SettingsSection>

				<SettingsSection title="最近执行" description="参数填写 Agent 最近一次执行结果与最近 10 次消耗统计。">
					<div className="mt-3 grid gap-3">
						<AgentTaskStatusCard title="最近一次执行" task={latestTask} />
						<div className="grid grid-cols-3 gap-2 text-center">
							<div className="rounded-md border border-border/70 bg-surface-soft px-2 py-3">
								<div className="text-lg font-semibold text-foreground">{taskLog.length}</div>
								<div className="text-[11px] text-muted-foreground">总执行</div>
							</div>
							<div className="rounded-md border border-border/70 bg-surface-soft px-2 py-3">
								<div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{successCount}</div>
								<div className="text-[11px] text-muted-foreground">成功</div>
							</div>
							<div className="rounded-md border border-border/70 bg-surface-soft px-2 py-3">
								<div className="text-lg font-semibold text-destructive">{failedCount}</div>
								<div className="text-[11px] text-muted-foreground">失败</div>
							</div>
						</div>
					</div>
				</SettingsSection>

				<SettingsSection title="执行日志（最近 10 次）" description="参数填写 Agent 的历次执行记录。">
					{taskLog.length === 0 ? (
						<div className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
							还没有执行记录。在资产编辑页粘贴参数文本使用 Agent 填写后，这里会显示历次执行的状态与产出。
						</div>
					) : (
						<div className="mt-3 grid content-start gap-1.5">
							{taskLog.map((task) => (
								<div
									key={task.id}
									className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-2 py-1.5 text-xs"
								>
									<span
										className={
											task.status === "failed"
												? "shrink-0 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive"
												: "shrink-0 rounded bg-emerald-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
										}
									>
										{task.status === "failed" ? "失败" : "成功"}
									</span>
									<span className="min-w-0 flex-1 truncate text-muted-foreground">
										{task.model || "未知模型"} · {new Date(task.created).toLocaleString("zh-CN")}
									</span>
								</div>
							))}
						</div>
					)}
				</SettingsSection>
			</SettingsSectionStack>

			<div className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface-soft p-2.5 text-xs leading-relaxed text-muted-foreground shadow-none">
				<span>Agent 只对粘贴的文本做分类，写入前逐条勾选确认；接入地址与 API Key 在「服务接入」标签维护。</span>
			</div>
		</div>
	)
}
