# mi-gpt-hermes · 小爱音箱接入 Hermes

这个镜像只运行 mi-gpt。它从小爱音箱获取提问，去掉句首的触发词，将问题交给已有的 Hermes Agent，再让音箱朗读回答。模型、工具、聊天历史和长期记忆都由 Hermes 管理。

```text
小爱音箱 ⇄ mi-gpt-hermes ── hermes-voice 网络 ── Hermes Agent ⇄ 微信
```

音箱拥有自己的持久会话。音箱与微信连接同一 Hermes profile 时，可以按该 profile 的记忆配置共享已保存的长期记忆，各自保留聊天上下文。镜像支持 `linux/amd64` 和 `linux/arm64`，NAS 可以直接拉取。[公开镜像与版本标签](https://github.com/Gatanozoa/mi-gpt-hermes/pkgs/container/mi-gpt-hermes)

## 首次部署

### 1. 确认 Hermes 已就绪

以下示例使用外部 Docker 网络 `hermes-voice`。如果 Hermes 已接入该网络，API 在容器内监听 `0.0.0.0:8642`，且在网络上可以用名称 `hermes` 访问，直接进行第 2 步。两个容器通过内部端口通信，NAS 无需向局域网开放 8642。

首次配置 Hermes 端时：

1. 在 Docker 所在主机运行一次 `docker network create hermes-voice`。
2. 在 Hermes 的 Compose 中，把 `hermes-voice` 追加到服务原有的 `networks` 列表，并在顶层 `networks` 下声明 `hermes-voice: { external: true, name: hermes-voice }`。保留原有网络。以下步骤假设服务名或网络别名是 `hermes`。
3. 启用 Hermes API，设置 `API_SERVER_KEY`。在 Hermes v0.23.4 的容器终端执行 `hermes config set platforms.api_server.host 0.0.0.0`。应用 Compose 修改，并重启 Hermes 使监听配置生效。如果还需要从 NAS 本机访问 API，端口映射可写成 `127.0.0.1:8642:8642`。

### 2. 填写 mi-gpt 配置

在一个新的部署目录中保存 [compose.hermes.yaml](compose.hermes.yaml) 和 [.env.hermes.example](.env.hermes.example)，然后运行 `cp .env.hermes.example .env`。

| 配置项 | 填写内容 |
| --- | --- |
| `MI_USER`、`MI_PASS` | 小米账号的数字 ID 和密码 |
| `MI_DID`、`MI_HARDWARE` | 米家设备名称或 did，以及音箱型号。镜像支持 Play 的 `L05B` 和 `LX05` 两种命令映射，请以机身标签为准 |
| `MI_AI_KEYWORDS` | 必填，用中文或英文逗号分隔。示例文件包含五个可替换的前缀 |
| `HERMES_BASE_URL` | 显式填写 `http://hermes:8642/v1`。若使用其他网络别名或 profile API 路径，相应调整 |
| `HERMES_API_KEY` | 与目标 Hermes 服务的 `API_SERVER_KEY` 相同 |
| `HERMES_MODEL`、`HERMES_TIMEOUT_MS` | 示例为 `hermes-agent` 和 `180000` 毫秒。模型名以连接检查列出的结果为准 |

`.env` 和 `data/.mi.json` 含有登录凭据，请保存在部署主机。Compose 默认拉取 `ghcr.io/gatanozoa/mi-gpt-hermes:latest`，也可以通过 `MIGPT_IMAGE` 固定镜像标签。

### 3. 检查连接并启动

在部署目录运行：

```sh
docker compose -f compose.hermes.yaml pull
docker compose -f compose.hermes.yaml run --rm mi-gpt-hermes node /app/hermes/app.mjs --check
```

检查会读取 Hermes 的 `/v1/models`。看到“Hermes API 连接成功”及配置的模型名后，再启动音箱服务。检查本身不登录小米，也不创建会话。

```sh
docker compose -f compose.hermes.yaml up -d
docker compose -f compose.hermes.yaml logs --tail 50
```

使用示例中的触发词，对音箱说「小爱同学，问问爱马仕，今天几号？」。Hermes 收到的是「今天几号？」，音箱随后朗读最终回答。每轮重新唤醒；普通小爱指令仍可照常使用。

## 日常使用与排查

| 情况 | 操作 |
| --- | --- |
| 修改触发词 | 编辑 `.env` 的 `MI_AI_KEYWORDS`，再运行 `docker compose -f compose.hermes.yaml up -d --force-recreate`。触发词由环境变量提供，无需管理页面或构建镜像 |
| 只把某类提问交给 Hermes | 例如添加「问问AI」后，「问问AI，里面有几张照片？」只会转发「里面有几张照片？」。前缀只匹配句首，英文忽略大小写，重叠时取最长项。只说触发词会提示补充问题 |
| 验证与微信共享记忆 | 在音箱明确要求「请记住……」，待 Hermes 保存后，再到微信询问。两端须使用支持跨入口共享的记忆范围 |
| 找不到网络或无法连接 | 确认两个容器都加入同一个 `hermes-voice`，URL 中的主机名与 Hermes 的网络别名一致，API 监听容器的 `0.0.0.0:8642`，再运行 `--check` |
| 检查返回 `HTTP_401` | 核对 `HERMES_API_KEY` 与目标 Hermes 的 `API_SERVER_KEY`。这里使用 Hermes 服务密钥 |
| 音箱提示「问题没有送达」 | DNS 解析失败、连接被拒绝等建连错误发生在发送之前。检查 Hermes 的网络和服务状态，恢复后可以重新提问 |
| 等待超时或提示任务可能仍在执行 | 默认等待 180 秒。连接中断或等待超时后，请先确认任务结果。桥接不会自动重发请求，以免工具执行两次 |
| 容器显示 `unhealthy` | 镜像每 30 秒带密钥读取一次 Hermes 的模型列表，启动宽限期后连续三次失败会标记异常。此状态反映 API 连通和鉴权，小米登录与播报可用一次语音提问验证 |

`data/hermes-session.json` 保存音箱会话 ID 和上次访问的地址。修改 `HERMES_BASE_URL` 后会自动更新记录并沿用会话 ID。如果有意连接另一套 Hermes 并希望开始新会话，停止 mi-gpt，将此文件移走备份，再启动。遇到损坏的 JSON 或无效标识，mi-gpt 会将原件保存在同目录的 `hermes-session.json.corrupt-*`，创建新会话并记录原因。目录权限或磁盘错误请按启动日志处理。

## 更新容器

更新 Hermes 时，只要它继续使用同一网络、服务名和持久数据，mi-gpt 就可以在 Hermes 就绪后继续处理提问。更新期间未收到结果的语音请求不会自动重发。

更新 mi-gpt 时，在部署目录运行以下命令。保留 `./data`，其中保存了小米登录缓存和音箱会话标识。

停止容器时，mi-gpt 停止接收新提问，等待已接收的提问处理和播报结束。示例 Compose 用 `stop_grace_period: 4m` 给默认的 180 秒请求和播报留出时间。延长请求超时或经常连续提交多条任务时，请相应延长停机宽限期；超出宽限期后 Docker 会强制停止容器。

```sh
docker compose -f compose.hermes.yaml pull
docker compose -f compose.hermes.yaml up -d
```

项目基于 mi-gpt，沿用 MIT 许可证。[上游项目](https://github.com/idootop/mi-gpt) · [上游使用说明](README.upstream.md) · [许可证](LICENSE)
