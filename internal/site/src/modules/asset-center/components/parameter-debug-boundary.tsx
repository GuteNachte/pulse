import { Component, type ReactNode } from "react"

// 2026-10-10 参数专项调试：临时错误边界——参数卡渲染崩溃时显示错误文本而不是白屏
export class ParameterDebugBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
	state = { error: null as Error | null }

	static getDerivedStateFromError(error: Error) {
		return { error }
	}

	componentDidCatch(error: Error, info: { componentStack: string }) {
		console.error("PARAMETER BOUNDARY CAUGHT:", error.message, info.componentStack?.slice(0, 500))
	}

	render() {
		if (this.state.error) {
			return (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3 text-xs text-destructive">
					参数区渲染失败：{this.state.error.message}
					<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[10px]">
						{this.state.error.stack?.slice(0, 800)}
					</pre>
				</div>
			)
		}
		return this.props.children
	}
}
