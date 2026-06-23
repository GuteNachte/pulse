# Agent Install Flow Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` when available, otherwise use `superpowers:executing-plans` and execute task-by-task with verification checkpoints.

**Goal:** Make Linux generic, FlyNAS, and Unraid Agent installation all follow the same staged workflow: fixed data directory, pairing/connection step, and direct startup path, while keeping Windows install behavior unchanged.

**Architecture:** Keep the install string generation in `internal/site/src/lib/agent-install.ts` as the single source of truth. Split Linux install behavior by target metadata instead of by ad hoc UI branches, so the settings page, add-machine menu, and download actions all render the same staged install logic. Preserve the existing Hub/Agent protocol, token flow, and release version resolution; only the install packaging and the visible workflow change.

**Tech Stack:** TypeScript, React 19, Vite, current Pulse install UI, `npm run check`, `npm run build`, browser verification on the local app.

---

## Global Rules

- Do not change the backend pairing protocol or agent runtime semantics unless a test proves the current behavior is broken.
- Keep Windows install options and output stable.
- Linux generic, FlyNAS, and Unraid must all expose an explicit data directory and a direct startup path.
- Do not introduce placeholder or guessed install commands; every generated command must come from the shared helper functions.
- Every visible change must be reflected in `docs/release-notes-next.md` and the About release history.

## Task 1: Unify Linux install generators around staged install targets

**Files:**
- Modify: `internal/site/src/lib/agent-install.ts`
- Modify: `internal/site/src/components/routes/settings/agent-install-profiles.ts`
- Modify: `internal/site/src/components/install-dropdowns.tsx`
- Add: `internal/site/src/lib/agent-install.test.ts` (if the repo already has a TypeScript unit test harness available; otherwise skip and rely on static checks + browser verification)

- [ ] **Step 1: Write the failing tests** (only if the site package already has a unit test runner)

```ts
import { describe, expect, it } from "vitest"
import {
  DEFAULT_LINUX_AGENT_DATA_DIR,
  FLYNAS_LINUX_AGENT_DATA_DIR,
  UNRAID_LINUX_AGENT_DATA_DIR,
  buildLinuxAgentCompose,
  buildLinuxAgentPairCompose,
  buildLinuxAgentPairDockerRun,
  buildUnraidAgentTemplate,
} from "./agent-install"

describe("linux install generators", () => {
  it("keeps generic linux on the dedicated data dir and pair-first flow", () => {
    const output = buildLinuxAgentPairCompose({
      code: "PAIR-CODE",
      agentHubURL: "http://192.168.1.10:8090",
      version: "1.0.5",
      image: "registry.example.com/infra/pulse-agent:1.0.5",
      includeHeader: true,
      dataDir: DEFAULT_LINUX_AGENT_DATA_DIR,
      title: "Linux 通用容器版",
    })

    expect(output).toContain(DEFAULT_LINUX_AGENT_DATA_DIR)
    expect(output).toContain("/agent pair --url 'http://192.168.1.10:8090' --code 'PAIR-CODE'")
    expect(output).toContain("exec /agent")
  })

  it("keeps FlyNAS on its own directory and downloadable yml shape", () => {
    const output = buildLinuxAgentCompose({
      token: "TOKEN",
      agentHubURL: "http://192.168.1.10:8090",
      version: "1.0.5",
      image: "registry.example.com/infra/pulse-agent:1.0.5",
      includeHeader: true,
      dataDir: FLYNAS_LINUX_AGENT_DATA_DIR,
      title: "飞牛 / NAS 容器版",
    })

    expect(output).toContain(FLYNAS_LINUX_AGENT_DATA_DIR)
    expect(output).toContain("INSTALL_METHOD: docker")
    expect(output).toContain("AGENT_PROFILE: linux-container")
  })

  it("keeps Unraid as an XML template with the dedicated directory", () => {
    const output = buildUnraidAgentTemplate({
      code: "PAIR-CODE",
      agentHubURL: "http://192.168.1.10:8090",
      version: "1.0.5",
      image: "registry.example.com/infra/pulse-agent:1.0.5",
      dataDir: UNRAID_LINUX_AGENT_DATA_DIR,
    })

    expect(output).toContain(UNRAID_LINUX_AGENT_DATA_DIR)
    expect(output).toContain("<PostArgs>")
    expect(output).toContain("pulse-agent")
  })
})
```

- [ ] **Step 2: Run the new test file and confirm it fails for the current behavior** (skip if no unit test runner exists in this package)

Run:

```powershell
cd internal\site
npm run test:unit -- src/lib/agent-install.test.ts
```

Expected: if the test runner exists, the test should fail because the current install generation does not yet enforce the staged generic Linux flow. If the runner does not exist, stop and add a lightweight unit harness before continuing, or skip directly to browser-verifiable checks.

- [ ] **Step 3: Implement the shared staged Linux install helpers**

Update `internal/site/src/lib/agent-install.ts` so the Linux helpers become the canonical source for:

```ts
export type LinuxInstallTarget = "linux-generic" | "flynas" | "unraid"

export function getLinuxInstallDefaults(target: LinuxInstallTarget) {
  return {
    title: target === "linux-generic" ? "Linux 通用容器版" : target === "flynas" ? "飞牛 / NAS 容器版" : "Unraid Docker 模板",
    dataDir:
      target === "linux-generic"
        ? DEFAULT_LINUX_AGENT_DATA_DIR
        : target === "flynas"
          ? FLYNAS_LINUX_AGENT_DATA_DIR
          : UNRAID_LINUX_AGENT_DATA_DIR,
  }
}
```

Then keep:

```ts
buildLinuxAgentCompose(...)
buildLinuxAgentPairCompose(...)
buildLinuxAgentPairDockerRun(...)
buildUnraidAgentTemplate(...)
```

but make sure the UI calls the pair-first flow for generic Linux and FlyNAS, while direct `docker run` remains an explicit secondary option.

- [ ] **Step 4: Re-run the install generator tests** (or the equivalent static verification if no unit harness exists)

Run:

```powershell
cd internal\site
npm run test:unit -- src/lib/agent-install.test.ts
```

Expected: PASS if the harness exists; otherwise use `npm run check` and browser verification as the executable verification path.

- [ ] **Step 5: Run repo checks**

Run:

```powershell
cd internal\site
npm run check
```

Expected: PASS with no new lint or type errors.

## Task 2: Rework the Agent install UI to surface the same staged flow everywhere

**Files:**
- Modify: `internal/site/src/components/routes/settings/agent-settings-components.tsx`
- Modify: `internal/site/src/components/routes/settings/agent.tsx`
- Modify: `internal/site/src/components/routes/settings/agent-install-profiles.ts`
- Modify: `internal/site/src/components/install-dropdowns.tsx`

- [ ] **Step 1: Write the failing browser-level expectation**

Use the local app at `/settings/agent` and `/clients` to verify:

```text
Linux 通用: 显示固定数据目录、配对安装模板、直接运行命令
飞牛 / NAS: 显示固定数据目录、下载 yml、配对安装模板
Unraid: 显示固定数据目录、XML 模板、配对安装参数
```

The current UI should fail this expectation because generic Linux still reads like a single static compose path.

- [ ] **Step 2: Refactor the install workbench**

Update the desktop and mobile Agent install surfaces so generic Linux is no longer treated as a special one-off compose blob. The visible actions should read as:

```ts
[
  { label: "配对 Compose", filename: "pulse-agent-linux-pair.yml" },
  { label: "直接运行命令", filename: "pulse-agent-linux-run.sh" },
]
```

FlyNAS should keep the same pair-first pattern but use its own default data directory and downloadable `pulse-agent-flynas.yml`.

Unraid should continue to be XML-only, but the UI should present it as the third staged install target rather than as an arbitrary extra template.

- [ ] **Step 3: Update the add-machine dropdown actions**

Make the add-machine/install dropdown mirror the settings page:

```ts
// Generic Linux
copyPairingDockerCompose(code)
copyPairingDockerRun(code)

// FlyNAS
copyPairingFlynasCompose(code)
downloadPairingFlynasCompose(code)

// Unraid
copyPairingUnraidTemplate(code)
downloadPairingUnraidTemplate(code)
```

Keep Windows behavior unchanged.

- [ ] **Step 4: Re-run browser verification**

Open:

```text
http://127.0.0.1:5173/settings/agent
http://127.0.0.1:5173/clients
```

Confirm the generic Linux install path now shows the same staged structure as FlyNAS and Unraid, and that the copy/download buttons still work after closing and reopening.

## Task 3: Update release notes and About history for the new install model

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Modify: `docs/agent-1.0-install.md`
- Modify: `docs/flynas-compose-checklist.md`

- [ ] **Step 1: Add the new install-flow entry to release notes**

Record that Linux generic, FlyNAS, and Unraid now share the same staged install model with explicit data directories and direct startup paths.

- [ ] **Step 2: Mirror the same explanation in About history**

Update the `1.0.5-dev` history block so the install model change appears under the Agent / deployment section, not just as a generic UI tweak.

- [ ] **Step 3: Keep the docs aligned with the new target-specific directories**

Ensure the install docs match the actual UI output:

```text
/opt/pulse-agent/data
/vol1/1000/docker/pulse-agent/data
/mnt/user/appdata/pulse-agent
```

- [ ] **Step 4: Final consistency checks**

Run:

```powershell
cd C:\Users\Nacht\Documents\123
git diff -- docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts docs/agent-1.0-install.md docs/flynas-compose-checklist.md
```

Then verify:

```powershell
cd internal\site
npm run check
npm run build
```

Expected: PASS.

## Verification Checklist

- [ ] Generic Linux uses the staged install model, not a lone static compose blob.
- [ ] FlyNAS keeps its dedicated directory and downloadable yml.
- [ ] Unraid keeps XML template output and its own directory.
- [ ] Windows install behavior is unchanged.
- [ ] Release notes and About history describe the new install flow.
