import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { createLatestRequestGuard } from "@/lib/latest-request-guard"
import { AssetMediaStoreSettingsPanel } from "@/modules/asset-center/components/asset-media-store-settings-panel"
import type { AITaskRecord } from "@/types"
import { NumberSetting, StatusChip, ToggleRow, getConfigErrorMessage } from "./ai-settings-shared"
import { SettingsSection, SettingsSectionStack } from "./components/section"

// 2026-10-11 设置页拆分：图片 Agent 设置——图片获取 Agent 的全部行为配置、媒体存储、执行日志与消耗统计。

type AssetEnrichmentConfig = {
	image_agent?: { enabled?: boolean; assess_count?: number }
}

type ImageAgentForm = {
	enabled: boolean
	assessCount: number
}

const defaultForm: ImageAgentForm = {
	enabled: true,
	assessCount: 6,
}

const imageTaskLogFields = "id,status,provider,model,input_summary,output_summary,error,created"

export default function ImageAgentSettings() {
	const [form, setForm] = useState<ImageAgentForm>(defaultForm)
	const [taskLog, setTaskLog] = useState<AITaskRecord[]>([])
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
				enabled: config.image_agent?.enabled ?? defaultForm.enabled,
				assessCount: config.image_agent?.assess_count || defaultForm.assessCount,
			})
			const logPage = await pb.send<{ items: AITaskRecord[] }>("/api/collections/ai_tasks/records", {
				method: "GET",
				query: {
					filter: 'kind="image_agent"',
					sort: "-created",
					fields: imageTaskLogFields,
					perPage: 10,
				},
				requestKey: null,
			})
			if (!latestLoad.current.isCurrent(request)) return
			setTaskLog(logPage.items ?? [])
		} catch {
			if (!latestLoad.current.isCurrent(request)) return
			toast({ title: "读取图片 Agent 配置失败", description: "请确认当前账号拥有管理员权限。", variant: "destructive" })
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
					image_agent: {
						enabled: form.enabled,
						assess_count: form.assessCount,
					},
				},
			})
			if (!latestLoad.current.isCurrent(request)) return
			toast({ title: "图片 Agent 设置已保存", description: "后续收集图片会按这里的配置执行。" })
			await loadAll()
		} catch (error) {
			if (!latestLoad.current.isCurrent(request)) return
			toast({ title: "保存图片 Agent 设置失败", description: getConfigErrorMessage(error), variant: "destructive" })
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
					label="图片 Agent"
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
					title="图片获取 Agent"
					description="收集图片时 Agent 自动规划图片搜索策略（渲染图/宣传图/规格图/评测图），并用视觉模型评估候选图片内容类型（渲染图优先、实拍拆解降级）。视觉模型与 API Key 跟随「服务接入」公共配置。"
				>
					<div className="mt-3 grid gap-4">
						<ToggleRow
							label="启用图片获取 Agent"
							description="关闭后收集图片退回规则搜索（无 AI 规划与视觉评估）；已入库图片不受影响。"
							checked={form.enabled}
							onCheckedChange={(value) => setForm((current) => ({ ...current, enabled: value }))}
						/>
						<NumberSetting
							label="视觉评估图片数"
							value={form.assessCount}
							min={0}
							max={12}
							onChange={(value) => setForm((current) => ({ ...current, assessCount: value }))}
						/>
						<div className="rounded-md border border-border/70 bg-surface-soft p-3 text-xs leading-relaxed text-muted-foreground">
							执行口径：Agent 先按设备规划图片搜索策略，候选下载后交视觉模型逐张判断内容类型（产品渲染图提升、
							实拍拆解降级），再按修正后的分级排序输出。评估数量越大结果越准，但收集耗时相应增加；设为 0 关闭视觉评估。
						</div>
					</div>
				</SettingsSection>

				<SettingsSection title="消耗统计（最近 10 次执行）" description="按 ai_tasks 执行记录统计。">
					<div className="mt-3 grid grid-cols-3 gap-2 text-center">
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
				</SettingsSection>

				<SettingsSection title="执行日志（最近 10 次）" description="图片获取 Agent 的历次执行记录。">
					{taskLog.length === 0 ? (
						<div className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
							还没有执行记录。在资产编辑页使用图片获取后，这里会显示历次执行的状态与产出。
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

				<SettingsSection title="媒体存储" description="设备图片与图片 Agent 产出的存储位置设置。">
					<div className="mt-3">
						<AssetMediaStoreSettingsPanel />
					</div>
				</SettingsSection>
			</SettingsSectionStack>
		</div>
	)
}
