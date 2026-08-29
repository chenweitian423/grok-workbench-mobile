# Grok Workbench

全新重做的 iOS、Android 和 Web 客户端，直接连接已部署的 Grok2API，不包含自建业务服务端。Web 通过 Docker Compose 部署静态页面，并用同源 `/api` 反代到 Grok2API，避免浏览器跨域问题。

## 已核对的服务端

- SSH 主机：`192.168.123.195`
- 容器：`grok2api`
- 镜像：`ghcr.io/chenyme/grok2api:latest`
- 版本：`v3.1.1`
- 端口：`38695 -> 8000`
- 健康检查：`/healthz`
- OpenAI 兼容模型：`/v1/models`，需要客户端 Key
- 媒体接口：`/v1/images/generations`、`/v1/videos/generations`，需要客户端 Key
- 数据库已有 `model_routes`、`media_jobs`、`media_assets`，并存在历史图片和视频媒体文件

## Web 访问

```text
http://192.168.123.195:38696
```

接口代理：

```text
http://192.168.123.195:38696/api -> http://192.168.123.195:38695
```

## 三个提示词功能

- 上传图片 -> 生成还原提示词
- 文字描述 -> 生成专业图片提示词
- 一句话 -> 生成完整影视制作全案

这些功能通过 `/v1/chat/completions` 调用 Grok2API 的聊天模型完成，不新增服务端。

## 本地运行

```bash
npm install
npm run dev:web
npm run start:mobile
```

Web 客户端默认地址为：

```text
/api
```

iOS/Android 客户端默认地址为：

```text
http://192.168.123.195:38695
```

首次使用需要在设置里填写完整客户端 Key。

## GitHub 构建

GitHub Actions 会生成带版本号的产物：

- `grok-workbench-web-v版本号-run号`
- `GrokWorkbench-v版本号-run号.apk`
- `GrokWorkbench-v版本号-run号-unsigned.ipa`

每次发包前执行：

```bash
npm run version:set -- 1.0.1
```

脚本会同步根目录、Web、移动端、共享 core、Expo `buildNumber/versionCode` 和客户端显示版本。

## 服务器部署

```bash
cd /opt/grok-workbench/apps/web
docker compose up -d --build
```

当前部署容器：

```text
grok-workbench-web: 38696 -> 80
```
