import { HomeIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { IconPreviewState, URLProtocol } from "./types"

export function URLInput({
	protocol,
	address,
	placeholder,
	onProtocolChange,
	onAddressChange,
}: {
	protocol: URLProtocol
	address: string
	placeholder: string
	onProtocolChange: (protocol: URLProtocol) => void
	onAddressChange: (address: string) => void
}) {
	return (
		<div className="grid grid-cols-[108px_minmax(0,1fr)] overflow-hidden rounded-md border border-border/70 bg-card transition-[border-color,box-shadow] duration-150 ease-out focus-within:ring-2 focus-within:ring-ring/35 focus-within:ring-offset-0">
			<Select value={protocol} onValueChange={(value) => onProtocolChange(value as URLProtocol)}>
				<SelectTrigger className="h-10 rounded-none border-0 border-r border-border/70 bg-surface-soft focus:ring-0 focus:ring-offset-0">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="http://">http://</SelectItem>
					<SelectItem value="https://">https://</SelectItem>
				</SelectContent>
			</Select>
			<Input
				value={address}
				onChange={(event) => onAddressChange(event.target.value)}
				placeholder={placeholder}
				className="rounded-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
			/>
		</div>
	)
}

export function IconPreview({ preview }: { preview: IconPreviewState }) {
	if (!preview.url && preview.status !== "failed") {
		return null
	}
	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-lg border border-border/70 bg-card p-3 shadow-none",
				preview.status === "failed" && "border-destructive/30 bg-card"
			)}
		>
			<div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border border-border/70 bg-surface-soft">
				{preview.status === "loaded" ? (
					<img src={preview.url} alt="" className="size-7 object-contain" />
				) : (
					<HomeIcon className={cn("size-5 text-muted-foreground", preview.status === "failed" && "text-destructive")} />
				)}
			</div>
			<div className="min-w-0">
				<div className={cn("text-sm font-medium", preview.status === "failed" && "text-destructive")}>
					{preview.status === "loading" && "正在获取图标"}
					{preview.status === "loaded" && "图标预览"}
					{preview.status === "failed" && "获取失败"}
					{preview.status === "idle" && "待获取图标"}
				</div>
				<div className="mt-1 truncate text-xs text-muted-foreground">{preview.url || "请先填写网站地址"}</div>
			</div>
		</div>
	)
}
