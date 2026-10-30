import fs from "node:fs/promises"
import vm from "node:vm"
import ts from "typescript"

const source = await fs.readFile(new URL("./agent-install.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2020,
	},
	fileName: "agent-install.ts",
}).outputText

const sandbox = {
	module: { exports: {} },
	exports: {},
	URL,
	URLSearchParams,
	require: (name) => {
		throw new Error(`unexpected require: ${name}`)
	},
	console,
}
sandbox.exports = sandbox.module.exports

vm.createContext(sandbox)
vm.runInContext(compiled, sandbox, { filename: "agent-install.js" })

const { buildUnraidAgentTemplate, buildUnraidAgentTemplateXml } = sandbox.module.exports
const output = buildUnraidAgentTemplate({ agentHubURL: "http://hub.local:8090" })
const xml = buildUnraidAgentTemplateXml({
	code: "123-456",
	agentHubURL: "http://hub.local:8090",
})

if (output.startsWith("#!/bin/bash")) {
	throw new Error(`Expected download command, got bash installer script: ${output.slice(0, 32)}`)
}

if (!output.includes("curl -fsSL")) {
	throw new Error("Expected curl download command")
}

if (!output.includes("/api/pulse/agent-install/unraid.xml")) {
	throw new Error("Expected Unraid XML download endpoint")
}

if (!output.includes("/boot/config/plugins/dockerMan/templates-user/pulse-agent-unraid.xml")) {
	throw new Error("Expected Unraid template target path in download command")
}

if (output.includes('<Container version="2">')) {
	throw new Error("Did not expect embedded XML template content in download command")
}

if (!xml.includes("--device /dev/mem:/dev/mem")) {
	throw new Error("Expected Unraid XML to include a valid /dev/mem device mapping")
}

if (xml.includes("/dev/mem:/dev/mem:ro")) {
	throw new Error("Unraid XML must not use volume-style :ro mode on --device /dev/mem")
}

if (!xml.includes("/var/lib/pulse-agent/paired.code")) {
	throw new Error("Expected Unraid pairing template to use an explicit pairing marker file")
}

if (
	!xml.includes("rm -f /var/lib/pulse-agent/token /var/lib/pulse-agent/paired.env /var/lib/pulse-agent/pairing.json")
) {
	throw new Error("Expected Unraid pairing template to clear stale pairing state before pairing")
}

if (!xml.includes("grep -Fxq")) {
	throw new Error("Expected Unraid pairing template to check the pairing marker before pairing")
}

if (!xml.includes("/agent pair --url")) {
	throw new Error("Expected Unraid pairing template to still run pairing when the marker is missing or mismatched")
}
