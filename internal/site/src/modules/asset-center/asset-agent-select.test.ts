import assert from "node:assert/strict"
import { formatAgentCandidateLabel, normalizeAgentSelectValue } from "./asset-agent-select.ts"

// 交换机严格模板只接受固定值：粘贴文本里的中文描述要归一成存储值
assert.equal(normalizeAgentSelectValue("switch", "management_access", "Web轻管理"), "web")
assert.equal(normalizeAgentSelectValue("switch", "management_access", "Web"), "web")
assert.equal(normalizeAgentSelectValue("switch", "management_access", "App 管理"), "app")
assert.equal(normalizeAgentSelectValue("switch", "management_level", "轻管理"), "smart")
assert.equal(normalizeAgentSelectValue("switch", "management_level", "全管理交换机"), "managed")
assert.equal(normalizeAgentSelectValue("switch", "vlan_status", "已启用"), "enabled")
assert.equal(normalizeAgentSelectValue("switch", "vlan_status", "未启用"), "disabled")
// 认不出的值保持原文，由后端给出明确报错
assert.equal(normalizeAgentSelectValue("switch", "management_access", "串口"), "串口")
// 非选择字段不改
assert.equal(normalizeAgentSelectValue("switch", "supported_features", "VLAN / 端口隔离"), "VLAN / 端口隔离")

// 参数名去掉末尾单位（单位留在值里）
assert.equal(formatAgentCandidateLabel("交换容量 Gbps"), "交换容量")
assert.equal(formatAgentCandidateLabel("防雷等级 kV"), "防雷等级")
assert.equal(formatAgentCandidateLabel("工作温度"), "工作温度")

console.log("asset agent select contract passed")
