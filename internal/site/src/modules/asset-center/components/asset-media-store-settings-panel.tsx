import { useEffect, useState } from "react"
import { FolderIcon, SaveIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { pb } from "@/lib/api"

export function AssetMediaStoreSettingsPanel() {
	const [root, setRoot] = useState("")
	const [writable, setWritable] = useState(false)
	const [saving, setSaving] = useState(false)
	const load = async () => { const result = await pb.send<{ root: string; writable: boolean }>("/api/pulse/asset-media/store", { method: "GET" }); setRoot(result.root); setWritable(result.writable) }
	useEffect(() => { void load() }, [])
	const save = async () => { setSaving(true); try { const result = await pb.send<{ root: string; writable: boolean }>("/api/pulse/asset-media/store", { method: "POST", body: { root } }); setRoot(result.root); setWritable(result.writable) } finally { setSaving(false) } }
	return <section className="grid gap-3 rounded-lg border border-border/70 bg-card p-4"><div className="flex items-center gap-2"><FolderIcon className="size-4 text-muted-foreground" /><div><div className="text-sm font-semibold">本地媒体对象存储</div><div className="text-xs text-muted-foreground">原图、编辑版本与缩略图仅保存到本机目录。</div></div></div><Input value={root} onChange={(event) => setRoot(event.target.value)} placeholder="绝对目录，例如 D:\\Pulse\\asset-media" /><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{writable ? "目录可写" : "正在检查目录"}</span><Button size="sm" onClick={() => void save()} disabled={saving}><SaveIcon className="mr-1 size-3.5" />{saving ? "保存中" : "保存目录"}</Button></div></section>
}
