# DSH Remote

[English](README.md) | 中文 | [GitHub](https://github.com/xiaoxiaohai/dsh-remote)

> **Beta 状态：** 这是 `@musitoolbox/dsh-remote` 的公开源码仓库。只有在 npm 官方 registry 已显示 `0.4.0-beta.1` 和 `beta` tag 后才能使用下面的安装命令；registry 发布只由获得授权的人类所有者执行。

DSH Remote 让手机打开 Mac 上现有的 DeepSeek Harness Web 界面。只有本机用户明确同意后，插件才会匿名注册 Mac、启动经过校验的 FRPC，并在 DSH 设置中提供二维码配对和已授权手机管理。

这是托管 Beta，不是正式可用的远程访问服务。开启前请阅读[安全策略](SECURITY.md)和[隐私说明](PRIVACY.md)。

## 功能

- 明确选择开启：只安装不会发送注册请求，也不会打开隧道。
- 本机 **设置 → 手机访问** 卡片，提供二维码、暂停、轮换和单手机撤销。
- 转发现有 DSH Web HTTP/WebSocket，而不是另建一套任务与审批协议。
- 受管理的 FRPC `0.70.1`，只转发本机 DSH Web 端口。
- 同时提供经过校验的 `darwin-x64` 和 `darwin-arm64` 包内文件。
- 模型可见、只读说明型 `remote-access` Skill，覆盖手机、Android、iPhone、移动端、二维码配对和远程 DSH 问题。
- 可为拥有兼容 DSH Remote Server 的运营者覆盖成自托管服务地址。

Skill 只解释安全的本机设置步骤。它不能启动隧道、修改配置，也不能证明远程访问正在运行；本机设置卡片始终是状态依据。

## 环境要求

- Intel Mac（`darwin-x64`）或 Apple Silicon Mac（`darwin-arm64`）；
- Node.js 22 或更高版本；
- DeepSeek Harness `0.1.0-rc.8` 或更高版本；
- DSH Web profile；
- 兼容的手机端和到所选服务的网络路径。

本包不支持 Windows 或 Linux 主机。

托管 Android 手机端是位于 `https://remote.musitoolbox.com/downloads/dsh-remote-android.apk` 的 Release 签名 `0.4.0-beta.1`；托管 `assetlinks.json` 使用匹配的 Release 证书。手机端源码和二进制不属于本插件仓库或 npm 包。iOS 公开分发仍待完成。

## npm 安装方式

npm 官方 registry 显示 Beta 后执行：

```bash
dsh plugin --profile web add @musitoolbox/dsh-remote@beta
dsh --profile web --dump-config
dsh web
```

确认配置输出中的 `dsh-remote` 行包含：

```yaml
serviceUrl: https://remote.musitoolbox.com
enabled: false
autoStart: false
```

新增或更新插件后，需要重启正在运行的 `dsh web`。

### 从当前源码测试

npm 发布前，开发者可以构建经过校验的二进制并安装本地目录：

```bash
npm run fetch-frpc
npm test
dsh plugin --profile web add /absolute/path/to/dsh-remote-plugin
dsh --profile web --dump-config
dsh web
```

发布检查应使用一次性 DSH profile，不要在打包测试时替换用户现有的 Web profile。

## 第一次连接

1. 在 Mac 上通过 loopback 本机地址打开 DSH Web。
2. 打开 **设置 → 手机访问**。
3. 检查配置中显示的托管服务运营者。
4. 点击 **开启手机访问**。这是第一次注册 Mac、写入本地凭证和启动 FRPC 的操作。
5. 使用兼容的手机端扫描二维码。
6. 确认手机出现在 **已授权手机** 中。

二维码 URL 等同于凭证。不要把它粘贴到聊天、Issue、截图、统计系统或日志中。

## 更新与移除

更新命令：

```bash
dsh plugin --profile web update @musitoolbox/dsh-remote@beta
```

移除前，先在本机设置中撤销手机或轮换二维码，然后暂停访问。删除本地包不会自动删除托管服务中的匿名记录。

```bash
dsh plugin --profile web remove @musitoolbox/dsh-remote
```

本地状态默认保存在 `~/.dsh/dsh-remote/`。其中包含权限为 `0600` 的有效凭证；只有在撤销访问并停止 DSH 后才能检查和删除。

## 数据路径与信任边界

```text
手机 HTTPS/WSS
  → 选定的 DSH Remote Gateway
  → 已鉴权的 FRP 虚拟主机
  → Mac 上的 FRPC
  → 本机 DSH Web HTTP/WebSocket
```

托管 Gateway 会传输 DSH 页面和对话流量。公网链路使用 TLS，但此 Beta 没有额外提供对 Gateway 运营者隐藏 DSH 内容的应用层端到端加密。若不能接受该信任模型，请使用[兼容的自托管服务](docs/SELF_HOSTING.md)。

管理 RPC 仅限 loopback，设置客户端不会在远程页面注入。代理只指向 `127.0.0.1:<DSH Web port>`，FRPC 直接启动，不经过 shell。

## Agent 发现

安装后，插件会注册 `remote-access` Skill。路由描述包含 phone、mobile、Android、iPhone、iOS、QR pairing、remote DSH Web 和连接排查。它要求 Agent 只解释本机 UI 步骤，不能静默启动进程，也不能索取凭证。

Skill 只在安装后生效。安装前仍要依靠公开仓库、npm 元数据、网页搜索和社区插件目录。本项目不声称得到 DSH 官方背书，也不保证固定搜索排名。

## 自托管

在 Web profile 的用户 patch 中覆盖 `serviceUrl`，同时保留首次明确开启边界。详见[自托管](docs/SELF_HOSTING.md)。本仓库只包含插件，不包含兼容 Server。

## 开发与发布包验证

```bash
node --version
npm test
npm run check:docs
npm run check:secrets
npm run fetch-frpc
npm pack --dry-run --ignore-scripts
npm run pack:verify
```

`bin/` 由脚本生成并被 Git 忽略。打包脚本从 FRP 官方发布下载文件，校验固定 SHA-256，并带入 Apache-2.0 上游许可证。另见[第三方声明](THIRD_PARTY_NOTICES.md)和[贡献指南](CONTRIBUTING.md)。

## Beta 限制

- 托管服务没有正式 SLA、公开保留周期、账号恢复或完整的自助身份删除功能。
- iOS 公开分发和真机收尾仍未完成。
- 设置卡片目前是中文；英文 UI 本地化仍待完成。
- 受信任的 Gateway 运营者可以处理被代理的 DSH Web 流量。
- 目前只测试 macOS 和 DSH `0.1.0-rc.8` 或更高版本。

另见[变更记录](CHANGELOG.md)、[发布清单](docs/PUBLISHING.md)和[安全策略](SECURITY.md)。

## 许可证

插件源码使用 [MIT License](LICENSE)，Copyright © 2026 MusiToolbox。包内 FRPC 二进制继续使用 Apache-2.0。
