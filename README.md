# MiGPT → Hermes

让小爱音箱成为现有 Hermes Agent 的语音入口。基于 [idootop/mi-gpt](https://github.com/idootop/mi-gpt)，保留小米登录、提问获取、TTS 播报；绕过原版 MyBot、人设提示和 Prisma 记忆管理，由 Hermes 负责模型、工具、会话与记忆。

```text
小爱音箱 ⇄ mi-gpt-hermes 容器 ⇄ 现有 Hermes 容器
                                  ↑
                                微信等入口
```

音箱使用自己的持久会话，不接管微信会话。同一 Hermes profile 下，可使用同一份长期记忆。共享效果取决于 Hermes 的记忆 provider、范围、工具权限及实际保存情况；不是所有聊天内容实时同步。holographic 的 `scope: profile` 适合此用途，`user/chat/thread` 会按身份或通道隔离。

## 镜像和验证状态

GitHub Actions 在推送 `main` 后测试并构建 `linux/amd64`、`linux/arm64` 镜像：

```text
ghcr.io/gatanozoa/mi-gpt-hermes:latest
```

同时发布按提交 SHA 标记的镜像，便于固定版本。NAS 不需要安装 Node.js 或构建镜像。GHCR 第一次发布可能默认私有：仓库拥有者需在 GitHub Packages 设置中把此容器包设为 Public；公开仓库并不保证包自动公开。

已完成桥接自动测试、音箱模块编译和运行时导入验证。尚未进行真实小米账号、音箱播报及微信↔音箱记忆互通验收。不应把单元测试当成实机兼容性保证。

## NAS 部署

要求：现有 Hermes 已运行，容器名为 `hermes`；其 API 在容器内 `127.0.0.1:8642` 可访问。Hermes v0.22.5 可使用该接口。无需 Dashboard。

1. 下载本仓库的 `compose.hermes.yaml` 和 `.env.hermes.example` 到一个新目录，例如 `/volume1/docker/mi-gpt-hermes`。将后者重命名为 `.env`。
2. 填写 `.env` 中的小米 ID、密码、设备名称或 did，以及 **现有 Hermes 的 `API_SERVER_KEY`**。不要填写模型供应商的 Key，也不要把 `.env` 上传 GitHub。
3. 确认镜像地址为 `ghcr.io/gatanozoa/mi-gpt-hermes:latest`。如果现有 Hermes 容器名不是 `hermes`，修改 Compose 中的 `network_mode: container:hermes`。
4. 在此目录运行：

```sh
docker compose -f compose.hermes.yaml pull
# 只读检查 Hermes API，不连接小米、不创建对话、不调用模型。
docker compose -f compose.hermes.yaml run --rm mi-gpt-hermes node /app/hermes/app.mjs --check
docker compose -f compose.hermes.yaml up -d
docker compose -f compose.hermes.yaml logs --tail 50
```

桥接共用现有 Hermes 的网络空间，因而可访问其回环接口，不用修改 Hermes 的绑定地址或向外开放新端口。桥接不挂载 Hermes 数据目录，通过 API 使用现有 Agent。现有 Hermes 必须先启动；若重建了 Hermes 容器，随后也应重新创建桥接容器以加入新的网络空间：

```sh
docker compose -f compose.hermes.yaml up -d --force-recreate
```

`./data` 保存小米登录缓存和 `hermes-session.json`，请保留并保护此目录。同一份 data 只运行一个桥接实例。会话 ID 重启后保持不变；如果改换 Hermes 后端，先备份并移走此会话文件，再启动。删除本地会话文件不等于删除 Hermes 中的历史或结束旧会话。

## 小爱音箱 Play

默认关闭流式响应与连续对话，每轮重新唤醒。没有后台管理页面；触发前缀完全由 `.env` 中必填的 `MI_AI_KEYWORDS` 决定，镜像没有内置默认列表。未设置、留空或只填分隔符时，程序会明确报错并拒绝启动，不会退回“请”“你”等宽泛前缀。

例如，在 `.env` 中配置（以下五项只是示例，可自行替换）：

```dotenv
MI_AI_KEYWORDS=问问hermes,问问爱马仕,问问赫尔墨斯,告诉爱马仕,告诉赫尔墨斯
```

使用英文或中文逗号分隔，英文不区分大小写，重复项和两端空格会被清理。只匹配提问开头；按上述示例，可说“小爱同学，问问爱马仕，今天有什么安排”。其他提问不转交 Hermes。

修改 `.env` 后重新创建容器：

```sh
docker compose -f compose.hermes.yaml up -d --force-recreate
```

仅 `restart` 不会重新加载 `env_file`。从旧版升级时，先在 `.env` 填好 `MI_AI_KEYWORDS`，再拉取新版镜像并重新创建容器。登录缓存及音箱会话仍使用原来的 `data` 目录。

`MI_HARDWARE=L05B` 使用 TTS `[5,3]`、唤醒 `[5,1]`；2019 款 `LX05` 则使用 `[5,1]`、`[5,3]`。连续对话均关闭，但命令映射仍必须与实际硬件相符。型号未知时默认先用 L05B，能否播报需实测；如未播报，请核对机身标签。兼容性依据[上游列表](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md)。

## 会话、记忆和故障处理

- 每轮传递原始提问和持久的 `X-Hermes-Session-Id`。历史由 Hermes 管理，不使用 mi-gpt 的摘要记忆。
- 并发提问按顺序发给 Hermes；上游在用户提出新问题时可能丢弃旧问题的播报，但已提交的任务仍可能执行。
- 请求附带稳定的 `Idempotency-Key`，按会话、消息时间与内容生成。不会因超时或失败自动重试，避免重复执行工具；幂等保证仍取决于 Hermes 版本和运行模式。
- 默认等待 180 秒，可设置 `HERMES_TIMEOUT_MS`。超时只表示桥接未收到结果，不表示 Hermes 已取消任务。
- 不自动接管外部平台会话；HTTP 409 等错误不会触发会话重建。
- 仅播报最终回答；工具审批目前没有音箱交互界面，需要人工批准的任务应通过适合的入口完成。
- `auto_extract` 不保证每轮立即保存。测试互通时明确说“请记住……”，确认已写入后，再换到微信询问；随后反向测试。
- 基础 MEMORY.md / USER.md 的会话快照和 holographic 的按轮检索是不同机制。共享数据库不代表每条记忆都会被每轮召回。
- 若 Hermes 使用命名 profile，在 `HERMES_BASE_URL` 设置该 profile 的 API 路径并使用对应 Key；默认地址连接默认 profile。
- 调用 Hermes 的 API Key 赋予 Agent 能力，请仅放在自己的受信任设备中。日志不打印 API 响应正文或凭据；上游仍会记录音箱识别的提问。

## 开发与发布

```sh
node --test hermes/client.test.mjs hermes/triggers.test.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec tsup --config tsup.hermes.config.ts
docker build -f Dockerfile.hermes -t mi-gpt-hermes:test .
```

上游仍保留原入口，Hermes 镜像只启动 `hermes/app.mjs`。构建跳过原版安装脚本，运行时不初始化 Prisma 数据库。入口为 `src/hermes-speaker.ts`，桥接协议实现位于 `hermes/client.mjs`。

发布无需额外仓库 Secret，Actions 使用 `GITHUB_TOKEN` 发布 GHCR。推送 `main` 或手动运行 **Hermes image** 工作流即可构建镜像。

## 版权

保留上游 MIT 许可证及作者信息。原项目说明见 [README.upstream.md](README.upstream.md)。本分支不包含任何真实小米账号、Hermes Key、聊天记录或 NAS 配置。
