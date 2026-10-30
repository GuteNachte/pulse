import assert from "node:assert/strict"
import { test } from "node:test"
import {
	AI_MODEL_CATALOG,
	aiModelHint,
	aiModelOptionLabel,
	describeAIModel,
	isChatCapableAIModel,
} from "./asset-ai-model-catalog.ts"

test("长前缀优先：glm-5.3-flashx 不被 glm-5.3-flash 吞掉", () => {
	const flashx = describeAIModel("glm-5.3-flashx")
	assert.equal(flashx?.price, "输入 ¥2 / 输出 ¥7")
	const flash = describeAIModel("glm-5.3-flash")
	assert.equal(flash?.price, "输入 ¥0.8 / 输出 ¥2.8")
})

test("免费模型识别与选项标注", () => {
	assert.equal(describeAIModel("glm-4.7-flash")?.free, true)
	assert.equal(aiModelOptionLabel("glm-4.7-flash"), "glm-4.7-flash · 免费")
	assert.equal(aiModelOptionLabel("glm-5.3"), "glm-5.3 · 付费")
})

test("大小写与空白不敏感；未知模型回退", () => {
	assert.equal(describeAIModel("  GLM-5.3 ")?.free, false)
	assert.equal(describeAIModel("unknown-model-42"), undefined)
	assert.match(aiModelHint("unknown-model-42"), /以服务商官方定价页为准/)
})

test("非对话模型过滤：向量/重排序/OCR/语音剔除，对话模型保留", () => {
	assert.equal(isChatCapableAIModel("Qwen/Qwen3-8B"), true)
	assert.equal(isChatCapableAIModel("THUDM/GLM-4-9B-0414"), true)
	assert.equal(isChatCapableAIModel("BAAI/bge-m3"), false)
	assert.equal(isChatCapableAIModel("BAAI/bge-reranker-v2-m3"), false)
	assert.equal(isChatCapableAIModel("deepseek-ai/DeepSeek-OCR"), false)
	assert.equal(isChatCapableAIModel("FunAudioLLM/SenseVoiceSmall"), false)
})

test("目录条目前缀唯一，免费条目必须带额度说明", () => {
	const prefixes = AI_MODEL_CATALOG.map((entry) => entry.prefix)
	assert.equal(new Set(prefixes).size, prefixes.length)
	for (const entry of AI_MODEL_CATALOG) {
		if (entry.free) {
			assert.ok(entry.freeTier.trim().length > 0, `免费条目 ${entry.prefix} 缺少免费额度说明`)
		}
	}
})
