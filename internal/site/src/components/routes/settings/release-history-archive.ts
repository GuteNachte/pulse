// 旧版本记录单独成块：由 release-history.ts 动态 import，打开“历史版本”时才加载。
import archiveData from "./release-history-archive.json" with { type: "json" }
import type { ReleaseNote } from "./release-history"

const archive: ReleaseNote[] = archiveData
export default archive
