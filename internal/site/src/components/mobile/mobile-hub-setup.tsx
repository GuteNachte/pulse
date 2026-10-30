import { ServerIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { saveAndUseHubUrl } from "@/lib/api"
import { getDefaultHubUrl } from "@/lib/mobile-runtime"

export function MobileHubSetup({ onReady }: { onReady: () => void }) {
	const [value, setValue] = useState(getDefaultHubUrl())
	const [saving, setSaving] = useState(false)
	const [errorMessage, setErrorMessage] = useState("")

	async function save() {
		setSaving(true)
		setErrorMessage("")
		try {
			await saveAndUseHubUrl(value)
			onReady()
		} catch (error) {
			const description = error instanceof Error ? error.message : "请输入 http 或 https 开头的 Hub 地址。"
			setErrorMessage(description)
			toast({
				title: "Hub 地址不可用",
				description,
				variant: "destructive",
			})
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="grid min-h-svh place-items-center bg-surface-soft px-4 py-8">
			<Card className="w-full max-w-md rounded-lg border-border/70 bg-card p-1 shadow-none">
				<CardHeader className="gap-1.5 rounded-lg border border-border/70 bg-surface-soft p-4">
					<div className="flex min-w-0 items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="text-xs font-medium text-muted-foreground">Pulse Mobile</div>
							<CardTitle className="mt-1 text-xl ">连接 Hub</CardTitle>
						</div>
						<div className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
							<ServerIcon className="size-4" />
						</div>
					</div>
				</CardHeader>
				<CardContent className="grid gap-3 p-4">
					<div className="grid gap-2 rounded-lg border border-border/70 bg-surface-soft p-2">
						<div className="grid gap-2 rounded-md border border-border/70 bg-card p-3">
							<div className="flex min-w-0 items-center gap-2 text-muted-foreground">
								<span className="grid size-5 shrink-0 place-items-center">
									<ServerIcon className="size-4" />
								</span>
								<Label htmlFor="mobile-hub-url" className="truncate text-xs font-medium">
									Hub 地址
								</Label>
							</div>
							<Input
								id="mobile-hub-url"
								inputMode="url"
								value={value}
								onChange={(event) => {
									setValue(event.target.value)
									setErrorMessage("")
								}}
								className="h-11 bg-card shadow-none"
								placeholder="http://192.168.1.30:8090"
							/>
						</div>
					</div>
					{errorMessage && (
						<p
							role="alert"
							className="rounded-lg border border-destructive/30 bg-card px-3 py-2 text-sm text-destructive shadow-none"
						>
							{errorMessage}
						</p>
					)}
					<div className="rounded-lg border border-border/70 bg-surface-soft px-3 py-2 text-xs leading-relaxed text-muted-foreground">
						地址会保存到 App 安全存储里，后续打开自动连接。
					</div>
					<Button
						type="button"
						className="h-11"
						onClick={() => save().catch(console.error)}
						disabled={saving || !value.trim()}
					>
						{saving ? "正在连接" : "保存并继续"}
					</Button>
				</CardContent>
			</Card>
		</div>
	)
}
