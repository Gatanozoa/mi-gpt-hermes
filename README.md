# MiGPT → Hermes

将小爱音箱接入 Hermes Agent。桥接容器通过 [mi-gpt](https://github.com/idootop/mi-gpt) 获取音箱提问，将匹配触发词的问题转发给 Hermes，再由音箱朗读最终回答。模型、工具和会话历史由 Hermes 管理。

音箱拥有独立的持久会话。要与微信等其他入口共享长期记忆，应让各入口连接同一 Hermes profile，并选择支持该共享范围的记忆配置。例如，holographic 的 `scope: profile` 按 profile 共享，`user/chat/thread` 按身份或通道隔离。

## 使用 Docker Compose 部署

镜像 `ghcr.io/gatanozoa/mi-gpt-hermes:latest` 支持 `linux/amd64` 和 `linux/arm64`。启动桥接前，请先启动 Hermes Agent 容器，启用其 API 服务并设置 `API_SERVER_KEY`。示例使用容器内的 `http://127.0.0.1:8642/v1`。

1. 下载 [compose.hermes.yaml](compose.hermes.yaml) 和 [.env.hermes.example](.env.hermes.example)，放在同一目录。运行 `cp .env.hermes.example .env`。
2. 在 `.env` 中填写小米 ID（`MI_USER`）、密码（`MI_PASS`）、设备名称或 did（`MI_DID`）。按实际型号设置 `MI_HARDWARE`，并用 `MI_AI_KEYWORDS` 指定触发词。
3. 将 Hermes 服务的 `API_SERVER_KEY` 填入桥接的 `HERMES_API_KEY`。Compose 通过 `network_mode: container:hermes` 共享 Hermes 的网络空间。如果 Hermes 容器使用其他名称，请将 `container:` 后的名称改为实际容器名。

在 Compose 所在目录运行以下命令。第二条命令检查 Hermes API 连接，不调用模型。

```sh
docker compose -f compose.hermes.yaml pull
docker compose -f compose.hermes.yaml run --rm mi-gpt-hermes node /app/hermes/app.mjs --check
docker compose -f compose.hermes.yaml up -d
docker compose -f compose.hermes.yaml logs --tail 50
```

`./data` 保存小米登录缓存和音箱的 `hermes-session.json`。每个桥接实例应使用独立的数据目录。切换 Hermes 后端前，先备份并移走该会话文件，再启动桥接。

修改 `.env` 或重建 Hermes 容器后，运行以下命令，让桥接加载配置并加入当前 Hermes 容器的网络空间。

```sh
docker compose -f compose.hermes.yaml up -d --force-recreate
```

## 音箱与触发词

每轮提问前先唤醒音箱，在问题开头说一个触发词。用英文或中文逗号分隔多个词，例如：

```dotenv
MI_AI_KEYWORDS=问问hermes,问问爱马仕
```

说“小爱同学，问问爱马仕，今天有什么安排”，Hermes 收到的问题是“今天有什么安排”。匹配时忽略英文大小写，多个前缀重叠时优先使用最长项。只说触发词时，音箱会提示补充问题。`MI_AI_KEYWORDS` 必须包含至少一个触发词。

`MI_HARDWARE=L05B` 使用 TTS `[5,3]`、唤醒 `[5,1]`；2019 款 `LX05` 则使用 `[5,1]`、`[5,3]`。连续对话均关闭，但命令映射仍必须与实际硬件相符。型号未知时默认先用 L05B，能否播报需实测；如未播报，请核对机身标签。兼容性依据[上游列表](https://github.com/idootop/mi-gpt/blob/main/docs/compatibility.md)。

## 会话、记忆和故障处理

- 每轮传递去掉句首触发词后的问题正文和持久的 `X-Hermes-Session-Id`。历史由 Hermes 管理，不使用 mi-gpt 的摘要记忆。
- 并发提问按顺序发给 Hermes；上游在用户提出新问题时可能丢弃旧问题的播报，但已提交的任务仍可能执行。
- 请求附带稳定的 `Idempotency-Key`，按会话、消息时间与内容生成。不会因超时或失败自动重试，避免重复执行工具；幂等保证仍取决于 Hermes 版本和运行模式。
- 默认等待 180 秒，可设置 `HERMES_TIMEOUT_MS`。超时只表示桥接未收到结果，不表示 Hermes 已取消任务。
- 不自动接管外部平台会话；HTTP 409 等错误不会触发会话重建。
- 仅播报最终回答；工具审批目前没有音箱交互界面，需要人工批准的任务应通过适合的入口完成。
- `auto_extract` 不保证每轮立即保存。测试互通时明确说“请记住……”，确认已写入后，再换到微信询问；随后反向测试。
- 基础 MEMORY.md / USER.md 的会话快照和 holographic 的按轮检索是不同机制。共享数据库不代表每条记忆都会被每轮召回。
- 若 Hermes 使用命名 profile，在 `HERMES_BASE_URL` 设置该 profile 的 API 路径并使用对应 Key；默认地址连接默认 profile。
- 调用 Hermes 的 API Key 赋予 Agent 能力，请仅放在自己的受信任设备中。日志不打印 API 响应正文或凭据；上游仍会记录音箱识别的提问。

自动测试覆盖桥接逻辑。小米登录、实际播报和跨入口记忆共享需在对应设备与 Hermes 配置上验证。

## 开发

```sh
node --test hermes/client.test.mjs hermes/triggers.test.mjs
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec tsup --config tsup.hermes.config.ts
docker build -f Dockerfile.hermes -t mi-gpt-hermes:test .
```

镜像从 `hermes/app.mjs` 启动。音箱入口位于 `src/hermes-speaker.ts`，Hermes API 客户端位于 `hermes/client.mjs`。

## 版权

本项目基于 mi-gpt，遵循上游 MIT 许可证。见[上游项目说明](README.upstream.md)。
