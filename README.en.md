# Pulse

An open-source, self-hosted platform for home assets, network topology, and device monitoring.

[![Quality](https://github.com/GuteNachte/pulse/actions/workflows/quality.yml/badge.svg)](https://github.com/GuteNachte/pulse/actions/workflows/quality.yml)
[![Release](https://img.shields.io/github/v/release/GuteNachte/pulse?include_prereleases&label=release)](https://github.com/GuteNachte/pulse/releases/tag/v1.0.6-beta.6)
[![License](https://img.shields.io/github/license/GuteNachte/pulse)](LICENSE)
[![Demo](https://img.shields.io/badge/demo-online-16a34a)](https://pulse-demo-gute-nacht.vercel.app)

[Live demo](https://pulse-demo-gute-nacht.vercel.app) · [Download beta](https://github.com/GuteNachte/pulse/releases/tag/v1.0.6-beta.6) · [Three-minute setup](#three-minute-setup) · [简体中文](readme.md)

![Pulse dual-network dashboard](docs/media/screenshots/dashboard.png)

| Asset center | Home network topology | Client monitoring |
| --- | --- | --- |
| ![Asset center](docs/media/screenshots/assets.png) | ![Home network topology](docs/media/screenshots/network-home.png) | ![Client monitoring](docs/media/screenshots/clients.png) |

> The public demo uses entirely fictional data. It blocks every write operation and never connects to a real Hub, Agent, NAS, or private network.

## What Pulse does

- **Asset center**: maintain hardware, network devices, smart-home devices, service endpoints, images, specifications, interfaces, and relationships.
- **Network topology**: map separate home and technology networks with automatic layout, grid snapping, four-sided handles, and line branches.
- **Device monitoring**: collect CPU, memory, storage, network, GPU, temperature, S.M.A.R.T., service, and software data through Windows or Linux / NAS Agents.
- **Containers and websites**: inspect Docker / Podman workloads and monitor internal or external service availability and latency.
- **Alerts and audit**: consolidate operational alerts and retain important management actions.
- **Migration and backups**: move asset records or restore a complete instance, including settings, topology, attachments, and device images.
- **Web and Android**: use one explicit version across Hub, Agent, Web, and Android releases.

## Three-minute setup

The current public beta is [`v1.0.6-beta.6`](https://github.com/GuteNachte/pulse/releases/tag/v1.0.6-beta.6). Docker Compose on Linux or a NAS is the recommended deployment. Public Hub and Agent images currently focus on `amd64`.

```bash
mkdir -p pulse && cd pulse
curl -LO https://github.com/GuteNachte/pulse/releases/download/v1.0.6-beta.6/docker-compose.yml
docker compose pull
docker compose up -d
curl http://127.0.0.1:8090/api/health
```

After the health check succeeds, open `http://YOUR_SERVER_IP:8090` and create the first administrator. Data is stored in `pulse_data` in the current directory.

> **Protect your data:** Back up `pulse_data` before upgrades or container replacement. Do not delete it, run `docker compose down -v`, or mount an empty directory over existing data.

Connect other devices:

- **Windows**: create a pairing request under Settings -> Agent Management, then run the generated PowerShell command as Administrator. The `.exe` release asset is the Agent binary, not a graphical installer.
- **Linux / NAS**: use the generated Compose configuration or download `pulse-agent.yml`, then enter the pairing Token and a Hub URL reachable from that device.
- **Android**: install `pulse-android-1.0.6-beta.6.apk` from the Release and enter the Hub URL in the app.

Verify downloaded release files with:

```bash
sha256sum -c SHA256SUMS
```

See [public installation acceptance](docs/public-installation-acceptance.md) for verified release evidence and [deployment and rollback](docs/release-deployment-runbook.md) for upgrades.

## Supported platforms and limitations

| Component | Current support |
| --- | --- |
| Hub | Linux / NAS Docker on `amd64` |
| Agent | Windows `amd64`; Linux / NAS container on `amd64` |
| Web | Current Chromium, Firefox, and Safari releases |
| Android | APK attached to each release; version synchronized with Hub |

- Pulse is still a public beta. Always create a restorable backup before upgrading.
- The Windows Agent is not Authenticode-signed yet, so SmartScreen may appear.
- There is no macOS Agent today. ARM images and additional NAS platforms need broader validation.
- Pulse sends no product telemetry by default. User-configured outbound features, such as website monitoring or metadata enrichment, are explicit exceptions.
- The public demo illustrates the interface only; it does not represent real Agent collection, writes, backup restoration, or performance.

## Architecture

```text
Browser / Android App
        |
        v
Pulse Hub (PocketBase + Web + API)
        |
        +---- Windows Agent
        +---- Linux / NAS Agent
        +---- Websites, containers, and other monitoring targets
```

- **Hub** provides the Web application, API, assets, topology, alerts, audit records, settings, and backups.
- **Agent** runs on monitored systems, connects outbound to the Hub, and collects system, hardware, container, service, and software state.
- **Modules** keep asset center, network topology, client monitoring, maintenance, and future capabilities behind explicit boundaries and manifests.

## Development

On Windows, run `Start-Pulse-Dev.cmd` from the repository root. It starts or reuses Hub on `8090` and Vite on `5173`, then opens the application after the health check succeeds. See the [local development runbook](docs/local-dev-runbook.md) for Windows and Unix workflows.

```powershell
npm.cmd --prefix internal/site ci
npm.cmd --prefix internal/site run test
npm.cmd --prefix internal/site run typecheck
npm.cmd --prefix internal/site run build
```

## Roadmap

- Validate ARM, additional NAS platforms, and more real home-network environments.
- Continue improving topology editing, asset profiles, and relationship modeling.
- Expand Agent collection, alert channels, and observability while keeping data provenance explicit.
- Evaluate a macOS Agent, Windows code signing, and a more durable Android distribution path.

See [docs/pulse-roadmap.md](docs/pulse-roadmap.md) for the detailed roadmap.

## Get involved

- Help and deployment questions: [GitHub Discussions](https://github.com/GuteNachte/pulse/discussions)
- Reproducible defects: [open an Issue](https://github.com/GuteNachte/pulse/issues/new/choose)
- Security vulnerabilities: [private vulnerability report](https://github.com/GuteNachte/pulse/security/advisories/new)
- Code contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Support boundaries: [SUPPORT.md](SUPPORT.md)
- Community conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

Before sharing logs, screenshots, or configurations, remove Tokens, domains, IP addresses, MAC addresses, account details, household asset names, and other private data.

## License

Pulse is distributed under the [MIT License](LICENSE). Upstream and third-party notices remain available in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
