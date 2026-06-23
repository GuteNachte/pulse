# Pulse

Pulse is a self-hosted monitoring platform for machines, containers, services, software, websites, alerts, and release-managed agents.

It is built for a private home lab / small infrastructure workflow: Hub and Agent versions are released together, Docker deployments use explicit version tags, and the local Hub machine can run its own protected Agent.

## Features

- **Lightweight**: Uses a compact Hub + Agent architecture.
- **Simple**: Uses one Compose deployment for the Hub and the local Agent.
- **Docker stats**: Tracks CPU, memory, and network usage history for each container.
- **Alerts**: Global alert settings and alert history for resources, containers, services, software, and websites.
- **Website monitoring**: Website checks are attached to their owning machine.
- **Agent management**: Windows and Linux Agent releases are managed from the Hub.
- **Backups**: Save to and restore from local disk.

## Architecture

Pulse consists of two main components: the **Hub** and the **Agent**.

- **Hub**: A web application built on [PocketBase](https://pocketbase.io/) that provides dashboards, settings, alerts, and release management.
- **Agent**: Runs on each monitored system and reports metrics, containers, service/software state, and host capabilities to the Hub.

## Local Development

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-dev.ps1 -Restart
```

Open `http://localhost:5173` for the Vite frontend and `http://localhost:8090` for the Hub API.

## Supported metrics

- **CPU usage** - Host system and Docker / Podman containers.
- **Memory usage** - Host system and containers. Includes swap and ZFS ARC.
- **Disk usage** - Host system. Supports multiple partitions and devices.
- **Disk I/O** - Host system. Supports multiple partitions and devices.
- **Network usage** - Host system and containers.
- **Load average** - Host system.
- **Temperature** - Host system sensors.
- **GPU usage / power draw** - Nvidia, AMD, and Intel.
- **Battery** - Host system battery charge.
- **Containers** - Status and metrics of all running Docker / Podman containers.
- **S.M.A.R.T.** - Host system disk health (includes eMMC wear/EOL and Linux mdraid array health via sysfs when available).

## License

Pulse contains customized application code and also retains third-party open source license obligations. See [LICENSE](LICENSE) for the upstream MIT license notice.
