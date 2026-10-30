import { LoaderCircleIcon, PackageCheckIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
	applyAssetMigrationPackage,
	preflightAssetMigrationPackage,
	uploadAssetMigrationPackage,
} from "@/modules/asset-center/asset-migration-client"
import {
	buildAssetMigrationSummary,
	type AssetMigrationMode,
	type AssetMigrationPreflight,
	type AssetMigrationResult,
} from "@/modules/asset-center/asset-migration"

export function AssetMigrationPanel({
	file,
	onCancel,
	onApplied,
}: {
	file: File
	onCancel: () => void
	onApplied: (result: AssetMigrationResult) => void | Promise<void>
}) {
	const [preflight, setPreflight] = useState<AssetMigrationPreflight | null>(null)
	const [mode, setMode] = useState<AssetMigrationMode>("add_only")
	const [state, setState] = useState<"uploading" | "ready" | "applying" | "done" | "error">("uploading")
	const [error, setError] = useState("")
	const [result, setResult] = useState<AssetMigrationResult | null>(null)

	useEffect(() => {
		let cancelled = false
		setState("uploading")
		setError("")
		setPreflight(null)
		uploadAssetMigrationPackage(file)
			.then(({ upload_id }) => preflightAssetMigrationPackage(upload_id))
			.then((next) => {
				if (cancelled) return
				setPreflight(next)
				setState("ready")
			})
			.catch((reason: unknown) => {
				if (cancelled) return
				setError(reason instanceof Error ? reason.message : "迁移包上传或预检失败")
				setState("error")
			})
		return () => {
			cancelled = true
		}
	}, [file])

	const summary = useMemo(() => (preflight ? buildAssetMigrationSummary(preflight) : null), [preflight])

	async function applyPackage() {
		if (!preflight || !summary?.canApply) return
		setState("applying")
		setError("")
		try {
			const next = await applyAssetMigrationPackage(preflight.upload_id, mode)
			setResult(next)
			setState("done")
			await onApplied(next)
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "迁移包导入失败")
			setState("error")
		}
	}

	if (state === "uploading") {
		return (
			<Alert>
				<LoaderCircleIcon className="animate-spin" />
				<AlertTitle>正在校验迁移包</AlertTitle>
				<AlertDescription>{file.name}</AlertDescription>
			</Alert>
		)
	}

	if (state === "done" && result) {
		return (
			<Alert>
				<PackageCheckIcon />
				<AlertTitle>资产迁移完成</AlertTitle>
				<AlertDescription>
					新增 {result.created}，合并 {result.merged}，覆盖 {result.replaced}，跳过 {result.skipped}。
				</AlertDescription>
			</Alert>
		)
	}

	return (
		<div className="flex min-h-0 flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="min-w-0 truncate font-medium">{file.name}</span>
				{preflight ? (
					<Badge
						variant={preflight.status === "blocked" ? "danger" : preflight.status === "warning" ? "warning" : "success"}
					>
						{preflight.status === "blocked" ? "不可导入" : preflight.status === "warning" ? "需要确认" : "校验通过"}
					</Badge>
				) : null}
			</div>
			{summary ? (
				<div className="grid grid-cols-3 gap-2 rounded-md border p-3 text-sm">
					<MigrationCount label="资产" value={summary.assetCount} />
					<MigrationCount label="网卡" value={summary.interfaceCount} />
					<MigrationCount label="文件" value={summary.fileCount} />
				</div>
			) : null}
			{preflight?.messages.map((message) => (
				<Alert key={`${message.code}-${message.message}`}>
					<AlertTitle>{message.level === "error" ? "无法继续" : "导入提示"}</AlertTitle>
					<AlertDescription>{message.message}</AlertDescription>
				</Alert>
			))}
			{error ? (
				<Alert>
					<AlertTitle>迁移失败</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}
			{summary ? (
				<Tabs value={mode} onValueChange={(value) => setMode(value as AssetMigrationMode)}>
					<TabsList className="grid min-h-10 w-full grid-cols-3">
						{summary.modeOptions.map((option) => (
							<TabsTrigger key={option.value} value={option.value} className="min-h-8 px-2">
								{option.label}
							</TabsTrigger>
						))}
					</TabsList>
					<div className="mt-2 text-xs text-muted-foreground">
						{summary.modeOptions.find((option) => option.value === mode)?.detail}
					</div>
				</Tabs>
			) : null}
			<div className="flex justify-end gap-2">
				<Button variant="outline" onClick={onCancel} disabled={state === "applying"}>
					返回普通导入
				</Button>
				<Button onClick={applyPackage} disabled={!summary?.canApply || state === "applying"}>
					{state === "applying" ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : null}
					{state === "applying" ? "导入中" : "确认导入"}
				</Button>
			</div>
		</div>
	)
}

function MigrationCount({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-semibold tabular-nums">{value}</span>
		</div>
	)
}
