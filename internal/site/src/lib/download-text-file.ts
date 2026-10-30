// 触发浏览器下载文本文件；type 有默认值，兼容旧的两参调用。
// 独立无依赖叶子模块：node --experimental-strip-types 测试链不解析 @/ 别名，
// 也不能加载 utils.ts 的别名值导入，故实现单独存放、由 utils.ts 原地 re-export。
export function downloadTextFile(filename: string, content: string, type = "text/plain;charset=utf-8") {
	const blob = new Blob([content], { type })
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = filename
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	URL.revokeObjectURL(url)
}
