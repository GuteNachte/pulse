import assert from "node:assert/strict"
import test from "node:test"
import { formatPocketBaseError } from "./pocketbase-error.ts"

test("extracts PocketBase field details instead of the generic message", () => {
	const error = {
		status: 400,
		data: {
			code: 400,
			message: "Failed to update record.",
			data: { type: { code: "invalid_value", message: "Invalid value smart_ont" } },
		},
	}

	assert.equal(formatPocketBaseError(error), "资产类型：不允许的值「smart_ont」")
})

test("joins multiple field errors with Chinese labels", () => {
	const error = {
		data: {
			message: "Failed to create record.",
			data: {
				name: "Cannot be blank.",
				serial_number: { code: "validation_invalid_length", message: "Must be at most 180 characters." },
			},
		},
	}

	assert.equal(formatPocketBaseError(error), "名称：Cannot be blank.；序列号：Must be at most 180 characters.")
})

test("accepts details passed directly without a nested data object", () => {
	assert.equal(formatPocketBaseError({ data: { metadata: "Invalid value x" } }), "扩展信息：不允许的值「x」")
})

test("falls back when PocketBase only returns a generic message", () => {
	assert.equal(
		formatPocketBaseError({ data: { message: "Failed to update record." } }, "请检查字段和权限。"),
		"请检查字段和权限。"
	)
	assert.equal(formatPocketBaseError(new Error(""), "请稍后重试。"), "请稍后重试。")
})
