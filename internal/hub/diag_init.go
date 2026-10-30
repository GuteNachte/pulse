package hub

// 诊断辅助：暴露 initialize 错误供测试读取（临时）。
func (h *Hub) RunDiagnosticInitialize() error {
	return h.initialize(h.App)
}
