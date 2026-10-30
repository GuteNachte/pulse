import { useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { AssetMetaTag } from "@/modules/asset-center/components/asset-form-fields"
import type { AssetImportPreviewRow } from "@/modules/asset-center/asset-import"
import { getAssetTypeLabel, getStatusLabel } from "@/modules/asset-center/asset-schema"
import { isAssetMigrationPackage, type AssetMigrationResult } from "@/modules/asset-center/asset-migration"
import { AssetMigrationPanel } from "@/modules/asset-center/components/asset-migration-panel"

export function AssetImportDialog({
	open,
	onOpenChange,
	value,
	previewRows,
	saving,
	onValueChange,
	onLoadFile,
	onDownloadCsvTemplate,
	onDownloadJsonExample,
	onPreview,
	onImport,
	onMigrationApplied,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	value: string
	previewRows: AssetImportPreviewRow[]
	saving: boolean
	onValueChange: (value: string) => void
	onLoadFile: (file: File | null) => void
	onDownloadCsvTemplate: () => void
	onDownloadJsonExample: () => void
	onPreview: () => void
	onImport: () => void
	onMigrationApplied: (result: AssetMigrationResult) => void | Promise<void>
}) {
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const [migrationFile, setMigrationFile] = useState<File | null>(null)
	const validRows = previewRows.filter((row) => row.errors.length === 0)
	const invalidRows = previewRows.filter((row) => row.errors.length > 0)

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) setMigrationFile(null)
				onOpenChange(next)
			}}
		>
			<DialogContent className="flex max-h-[88vh] max-w-5xl flex-col overflow-hidden">
				<DialogHeader>
					<DialogTitle>导入资产</DialogTitle>
					<DialogDescription>支持完整迁移包、JSON 数组或带表头 CSV，导入前先校验。</DialogDescription>
				</DialogHeader>
				{migrationFile ? (
					<AssetMigrationPanel
						file={migrationFile}
						onCancel={() => setMigrationFile(null)}
						onApplied={onMigrationApplied}
					/>
				) : (
					<div className="grid min-h-0 pulse-card-gap overflow-y-auto pr-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
						<div className="grid min-h-0 gap-3">
							<Textarea
								value={value}
								onChange={(event) => onValueChange(event.target.value)}
								className="min-h-72 font-mono text-xs"
								placeholder={`name,type,status,location,vendor,model,management_ip,metadata.fixed_ipv4,metadata.mac\n客厅路由器,router,active,弱电箱,联通,V271-20,192.168.1.1,192.168.1.1,AA:BB:CC:DD:EE:FF`}
							/>
							<div className="flex flex-wrap items-center gap-2">
								<input
									ref={fileInputRef}
									type="file"
									accept=".pulse-assets.zip,.zip,.csv,.json,application/zip,application/json,text/csv,text/plain"
									className="hidden"
									onChange={(event) => {
										const file = event.target.files?.[0] ?? null
										if (file && isAssetMigrationPackage(file.name)) setMigrationFile(file)
										else onLoadFile(file)
										event.currentTarget.value = ""
									}}
								/>
								<Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={saving}>
									选择文件
								</Button>
								<Button variant="outline" onClick={onDownloadCsvTemplate} disabled={saving}>
									下载 CSV 模板
								</Button>
								<Button variant="outline" onClick={onDownloadJsonExample} disabled={saving}>
									下载 JSON 示例
								</Button>
								<Button variant="outline" onClick={onPreview} disabled={saving || !value.trim()}>
									生成预览
								</Button>
								<Button onClick={onImport} disabled={saving || invalidRows.length === previewRows.length}>
									{saving ? "导入中" : `导入 ${validRows.length} 条`}
								</Button>
							</div>
							<div className="grid gap-2">
								{previewRows.length === 0 ? (
									<div className="rounded-lg border border-dashed border-border/70 bg-surface-soft p-4 text-sm text-muted-foreground">
										暂无预览
									</div>
								) : (
									previewRows.slice(0, 20).map((row) => <AssetImportPreviewRowCard key={row.index} row={row} />)
								)}
								{previewRows.length > 20 && (
									<div className="text-xs text-muted-foreground">
										其余 {previewRows.length - 20} 条导入时同样会校验。
									</div>
								)}
							</div>
						</div>
						<div className="grid content-start gap-3 rounded-lg border border-border/70 bg-surface-soft p-3">
							<ImportSummaryPill label="解析条数" value={previewRows.length} />
							<ImportSummaryPill label="可导入" value={validRows.length} />
							<ImportSummaryPill label="需处理" value={invalidRows.length} />
							<div className="rounded-md border border-border/70 bg-card p-3 text-xs leading-5 text-muted-foreground">
								可用字段：name、type、status、location、vendor、model、serial_number、management_ip、role、notes、parent_asset、metadata.*。模板已包含宽带、路由器、交换机、NAS、互联网服务监控和智能家居示例。
							</div>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

function AssetImportPreviewRowCard({ row }: { row: AssetImportPreviewRow }) {
	const hasErrors = row.errors.length > 0
	const hasWarnings = row.warnings.length > 0
	return (
		<div
			className={cn(
				"grid gap-2 rounded-lg border p-3",
				hasErrors
					? "border-red-200 bg-red-50 text-red-900"
					: hasWarnings
						? "border-amber-200 bg-amber-50 text-amber-900"
						: "border-border/70 bg-card"
			)}
		>
			<div className="flex min-w-0 items-center justify-between gap-3">
				<div className="min-w-0 truncate font-medium">
					第 {row.index + 1} 条 · {row.form.name || "未命名"}
				</div>
				<AssetMetaTag tone={hasErrors ? "danger" : hasWarnings ? "warning" : "ok"}>
					{hasErrors ? "不可导入" : hasWarnings ? "需确认" : "可导入"}
				</AssetMetaTag>
			</div>
			<div className="flex flex-wrap gap-1.5">
				<AssetMetaTag>{getAssetTypeLabel(row.form.type)}</AssetMetaTag>
				<AssetMetaTag>{getStatusLabel(row.form.status)}</AssetMetaTag>
				{row.form.location && <AssetMetaTag>{row.form.location}</AssetMetaTag>}
				{row.form.management_ip && <AssetMetaTag>{row.form.management_ip}</AssetMetaTag>}
			</div>
			{hasErrors && <div className="text-xs leading-5 text-red-700">{row.errors.join("；")}</div>}
			{hasWarnings && <div className="text-xs leading-5 text-amber-800">{row.warnings.join("；")}</div>}
		</div>
	)
}

function ImportSummaryPill({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card px-3 py-2 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-semibold text-foreground">{value}</span>
		</div>
	)
}
