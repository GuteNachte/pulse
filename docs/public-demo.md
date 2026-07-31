# Pulse 公开演示站

公开地址：<https://pulse-demo-gute-nacht.vercel.app>

## 边界

- 演示站只使用仓库内的完全虚构数据，不连接 PocketBase、Agent、NAS 或任何真实 Pulse 环境。
- 演示身份固定为只读角色；界面隐藏或禁用写操作，剩余写请求由客户端守卫和 MSW 双重拒绝。
- Vercel 项目的 Deployment Protection 已关闭，使演示站可匿名访问；应用自身的数据隔离和只读限制不受影响。
- 演示数据使用 RFC 5737 文档网段 `192.0.2.0/24`，不会指向可路由的真实设备。

## 覆盖页面

- `/`
- `/assets`
- `/assets/demo-nas`
- `/network/home`
- `/network/technology`
- `/clients`
- `/containers`
- `/websites`
- `/settings/backups`
- `/settings/about`

## 构建与验证

本地演示构建：

```powershell
npm.cmd --prefix internal/site run build:demo
```

本地完整路由验证：

```powershell
npm.cmd --prefix internal/site run test:e2e:demo
```

远程部署验证：

```powershell
$env:PULSE_DEMO_BASE_URL = "https://pulse-demo-gute-nacht.vercel.app"
Push-Location internal/site
npx.cmd playwright test e2e/demo-site.spec.ts --config=playwright.demo.config.ts
Pop-Location
Remove-Item Env:PULSE_DEMO_BASE_URL
```

生成截图并执行隐私审计：

```powershell
npm.cmd --prefix internal/site run test:demo:screenshots
pwsh -NoProfile -File supplemental/scripts/verify-demo-artifacts.ps1
```

完整路由验证不会重写仓库截图；只有显式执行 `test:demo:screenshots` 才会更新 `docs/media` 中的公开素材。

## 发布方式

Vercel 项目为 `gute-nacht/pulse-demo`，关联 GitHub 仓库 `GuteNachte/pulse`，生产分支固定为 `main`。功能分支先生成 Preview，经远程 Playwright 验证后再晋级同一份构建，避免验证与正式环境不是同一产物。

当前首次部署由公开准备分支触发，并已验证不可变部署后绑定正式别名。后续发布优先使用 Git 集成，避免在本机上传依赖目录。

## 回滚

在已登录 Vercel CLI 的环境中执行：

```powershell
npx.cmd --yes vercel@50.28.0 rollback --scope gute-nacht
```

回滚后重新运行远程路由验证，并确认稳定地址仍返回安全响应头和 HTTP `200`。
