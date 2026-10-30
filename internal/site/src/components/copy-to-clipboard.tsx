import { CopyIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import { $copyContent } from "@/lib/stores"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"
import { toast } from "./ui/use-toast"

export default function CopyToClipboard({ content }: { content: string }) {
	const codeRef = useRef<HTMLElement>(null)

	async function copyContent() {
		try {
			await navigator.clipboard.writeText(content)
			toast({ title: "已复制", description: "命令已复制到剪贴板。" })
			return
		} catch (_error) {
			if (copyWithLegacyCommand(content)) {
				toast({ title: "已复制", description: "命令已复制到剪贴板。" })
				return
			}
		}

		selectCodeBlock(codeRef.current)
		toast({ title: "已选中文本", description: "当前浏览器限制自动复制，请按 Ctrl+C 复制。" })
	}

	return (
		<Dialog open={true} onOpenChange={(open) => !open && $copyContent.set("")}>
			<CopyCleanup />
			<DialogContent
				data-manual-copy-dialog="true"
				className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[54rem] overflow-hidden rounded-lg border-border/70 bg-card p-0 shadow-none md:pt-0"
			>
				<DialogHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-border/70 px-5 py-4 pr-14">
					<div className="min-w-0">
						<DialogTitle className="text-lg font-semibold">手动复制命令</DialogTitle>
						<DialogDescription className="mt-1 text-sm text-muted-foreground">
							自动复制失败。请复制下面内容，到目标机器的终端里执行。
						</DialogDescription>
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="min-h-10 shrink-0 gap-1.5 border-border/70 bg-card px-3 shadow-none transition-transform active:scale-[0.96]"
						onClick={copyContent}
					>
						<CopyIcon className="size-4" />
						复制
					</Button>
				</DialogHeader>
				<div className="bg-surface-soft px-4 py-4 sm:px-5 sm:py-5">
					<pre className="max-h-[66dvh] overflow-auto rounded-lg border border-border/70 bg-card p-4 text-xs leading-relaxed shadow-none">
						<code
							ref={codeRef}
							className="block min-w-fit whitespace-pre-wrap break-words font-mono text-foreground selection:bg-foreground selection:text-background"
						>
							{content}
						</code>
					</pre>
				</div>
			</DialogContent>
		</Dialog>
	)
}

function CopyCleanup() {
	useEffect(() => {
		return () => $copyContent.set("")
	}, [])

	return null
}

function copyWithLegacyCommand(content: string) {
	const textarea = document.createElement("textarea")
	textarea.value = content
	textarea.setAttribute("readonly", "")
	textarea.style.position = "fixed"
	textarea.style.opacity = "0"
	textarea.style.pointerEvents = "none"
	document.body.appendChild(textarea)
	textarea.select()
	try {
		return document.execCommand("copy")
	} catch (_error) {
		return false
	} finally {
		document.body.removeChild(textarea)
	}
}

function selectCodeBlock(element: HTMLElement | null) {
	if (!element) return
	const selection = window.getSelection()
	if (!selection) return
	const range = document.createRange()
	range.selectNodeContents(element)
	selection.removeAllRanges()
	selection.addRange(range)
}
