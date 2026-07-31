# Pulse

<p align="center">
  <strong>A self-hosted platform for home-lab assets, network topology, and device monitoring</strong><br>
  Keep device records, network relationships, runtime health, and service availability in one focused workspace.
</p>

<p align="center">
  <a href="https://github.com/GuteNachte/pulse/actions/workflows/quality.yml"><img src="https://github.com/GuteNachte/pulse/actions/workflows/quality.yml/badge.svg" alt="Quality checks"></a>
  <a href="https://github.com/GuteNachte/pulse/releases/tag/v1.0.6-beta.6"><img src="https://img.shields.io/github/v/release/GuteNachte/pulse?include_prereleases&label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/GuteNachte/pulse" alt="MIT license"></a>
  <a href="https://pulse-demo-gute-nacht.vercel.app"><img src="https://img.shields.io/badge/demo-online-16a34a" alt="Live demo"></a>
</p>

<p align="center">
  <a href="https://pulse-demo-gute-nacht.vercel.app">Live demo</a> ·
  <a href="https://github.com/GuteNachte/pulse/releases/tag/v1.0.6-beta.6">Download beta</a> ·
  <a href="#three-minute-setup">Three-minute setup</a> ·
  <a href="docs/pulse-roadmap.md">Roadmap</a> ·
  <a href="readme.md">简体中文</a>
</p>

![Pulse dual-network overview](docs/media/screenshots/dashboard.png)

> The public demo uses entirely fictional data. It blocks every write operation and never connects to a real Hub, Agent, NAS, or private network.

## Choose your starting point

| Goal | Start here |
| --- | --- |
| Explore the interface | [Open the live demo](https://pulse-demo-gute-nacht.vercel.app) |
| Deploy on Linux, a NAS, or FlyNAS | Follow [Three-minute setup](#three-minute-setup), then download the matching Release file |
| Connect a Windows device | Create a pairing request in Agent Management and download the Windows Agent |
| Ask a question or suggest an improvement | [GitHub Discussions](https://github.com/GuteNachte/pulse/discussions) or the [Issue templates](https://github.com/GuteNachte/pulse/issues/new/choose) |

## Core capabilities

- **Asset center**: maintain hardware, network devices, smart-home devices, service endpoints, images, specifications, interfaces, and relationships.
- **Dual network topology**: map home and technology networks with automatic layout, grid snapping, four-sided handles, and line branches.
- **Device monitoring**: collect CPU, memory, storage, network, GPU, temperature, S.M.A.R.T., service, and software data through Windows or Linux / NAS Agents.
- **Containers and websites**: inspect Docker / Podman workloads and monitor internal or external service availability, latency, and history.
- **Alerts and audit**: consolidate operational alerts and retain important management actions.
- **Migration and backups**: move asset records or restore a complete instance, including settings, topology, attachments, and device images.
- **Web and Android**: use one explicit version across Hub, Agent, Web, and Android releases.

| Asset center | Home network topology | Client monitoring |
| --- | --- | --- |
| ![Asset center](docs/media/screenshots/assets.png) | ![Home network topology](docs/media/screenshots/network-home.png) | ![Client monitoring](docs/media/screenshots/clients.png) |

More views:
[asset detail](docs/media/screenshots/asset-detail.png) ·
[technology topology](docs/media/screenshots/network-technology.png) ·
[container monitoring](docs/media/screenshots/containers.png) ·
[website monitoring](docs/media/screenshots/websites.png)

## Three-minute setup

The current public beta is [`v1.0.6-beta.6`](https://github.com/GuteNachte/pulse/releases/tag/v1.0.6-beta.6). Docker Compose on Linux, a NAS, or FlyNAS is recommended; public Hub and Agent images currently focus on `amd64`.

```bash
mkdir -p pulse && cd pulse
curl -LO https://github.com/GuteNachte/pulse/releases/download/v1.0.6-beta.6/docker-compose.yml
docker compose pull
docker compose up -d
curl http://127.0.0.1:8090/api/health
```

After the health check succeeds, open `http://YOUR_SERVER_IP:8090` and create the first administrator. Data is stored in `pulse_data` in the current directory.

> **Protect your data:** Back up `pulse_data` before upgrades or container replacement. Do not delete it, run `docker compose down -v`, or mount an empty directory over existing data.

### Choosing a Release file

Each public Release keeps only four installation or deployment files:

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Deploy the Pulse Hub and same-host Agent |
| `pulse-agent.yml` | Deploy a standalone Agent on Linux, NAS, or FlyNAS |
| `pulse-agent-<version>.exe` | Windows Agent program; not a graphical installer |
| `pulse-android-<version>.apk` | Android client |

License, third-party notices, and build metadata remain in the repository rather than the normal download area.

Connect other devices:

- **Windows**: create a pairing request under Settings -> Agent Management, then run the generated PowerShell command as Administrator.
- **Linux / NAS / FlyNAS**: download `pulse-agent.yml`, then enter the pairing Token and a Hub URL reachable from that device.
- **Android**: install the matching APK and enter the Hub URL in the app.

## Supported platforms and limitations

| Component | Current support |
| --- | --- |
| Hub | Linux / NAS / FlyNAS Docker on `amd64` |
| Agent | Windows `amd64`; Linux / NAS container `amd64` |
| Web | Current Chromium, Firefox, and Safari releases |
| Android | APK attached to each Release; version synchronized with Hub |

- Pulse is still a public beta. Always create a restorable backup before upgrading.
- The Windows Agent is not Authenticode-signed yet, so SmartScreen may appear.
- There is no macOS Agent today. ARM images and additional NAS platforms need broader validation.
- Pulse sends no product telemetry by default. User-configured outbound features, such as website monitoring or metadata enrichment, are explicit exceptions.
- The public demo illustrates the interface only; it does not represent real Agent collection, writes, backup restoration, or production performance.

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

On Windows, run `Start-Pulse-Dev.cmd` from the repository root. It starts or reuses Hub `8090` and Vite `5173`, then opens the application after the health check succeeds. See the [local development runbook](docs/local-dev-runbook.md) for Windows and Unix workflows.

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

See the [roadmap](docs/pulse-roadmap.md) for details.

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
