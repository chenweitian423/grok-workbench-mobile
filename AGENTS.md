# Grok Workbench 项目记忆与执行规则

> 本文件是本项目跨对话的持续记忆。每次执行任何任务前必须先完整阅读本文件；每次完成代码、配置、部署或版本更新后，必须在“更新日志与当前进度”中追加记录，再向用户交付结果。不得把 API Key、密码、Cookie、会话令牌等敏感信息写入本文件。

## 1. 项目定位

- 项目名称：Grok Workbench（创作控制台）。
- Monorepo：npm workspaces，Node.js 22。
- Web：React 18 + Vite 6 + lucide-react，入口为 `apps/web/src/main.jsx`，样式为 `apps/web/src/styles.css`。
- Web 运行服务：`apps/web/server.mjs`。它负责静态文件、用户注册登录、用户媒体归属、媒体读取，以及把同源 `/api` 代理到 Grok2API。
- 移动端：Expo / React Native，入口为 `apps/mobile/App.js`。
- 共享客户端和数据适配：`packages/core/src/index.js`。
- 版本同步脚本：`scripts/set-version.mjs`。

## 2. 基础设施与正确路径

- Grok2API 主机：`192.168.123.195`。
- Grok2API 容器：`grok2api`，端口 `38695 -> 8000`，健康检查 `/healthz`。
- Workbench Web 地址：`http://192.168.123.195:38696`。
- Workbench 容器：`grok-workbench-web`，端口 `38696 -> 80`。
- Web 代理：`http://192.168.123.195:38696/api` -> `http://host.docker.internal:38695`。
- **服务器正确且完整的源码根目录：`/opt/grok-workbench`。**
- **正确部署目录：`/opt/grok-workbench/apps/web`。**
- `/opt/grok-workbench/app` 是一份滞后的旧源码目录，曾停留在 `1.0.0`。禁止从该目录构建或部署。
- Docker 数据卷：用户数据挂载到 `/app/data`，Grok2API 媒体以只读方式挂载到 `/grok2api-data`。重建容器时必须保留这些卷。

## 3. 当前完整 Web 功能基线

发布前不得只看版本号，必须逐项确认这些能力仍存在：

- 用户注册、登录、退出；不同用户只能看到自己的媒体库。
- 提示词：图片还原提示词、文字扩写图片提示词、一句话影视制作全案。
- 聊天：纯文本；选择图片；在输入框粘贴截图；单条最多 4 张、每张最多 10 MB；预览与删除；支持纯图片和文字加图片；聊天记录保留缩略图；兼容 `/v1/chat/completions` 的 `text + image_url` 和 `/v1/responses` 的 `input_text + input_image`。
- 图片：模型选择、数量、画幅、分辨率、参考图片；参考图会先经视觉模型分析，再将视觉约束并入生图提示词；普通线路 502 时可切换高清线路。
- 视频：参考图、时长、画幅、分辨率、异步轮询、UTF-8 字节长度保护、实际请求预览、近期未归属结果找回。
- 语音：文字转语音、目标语言翻译、音色选择与试听、语速、音频播放和下载、上传音频进行语音识别。
- 音乐：为本地 ComfyUI MiniMax Music 3 生成英文 description、中文说明、歌词和自动 `max_duration`，并支持分别复制。它不直接调用音乐生成服务。
- 媒体库：图片/视频历史、打开、下载、用户归属、深层返回结构解析。
- 模型：自动读取并缓存模型列表，包含已知聊天、图片和语音模型兜底项。

## 4. 本地与服务器源码状态

- 2026-08-21 已完成逐文件差异审计，并在统一基线上发布音乐质量增强版 `1.0.9`。
- 本地与服务器的完整项目文本源码已对齐；`apps/web/src/main.jsx` 和 `styles.css` 已通过 SHA256 一致性校验，可作为同一完整 `1.0.9` 基线。
- 当前基线同时包含音乐、语音、参考图、视频诊断以及聊天图片。以后开发应以当前本地源码和服务器 `/opt/grok-workbench` 为同一基线，发布前仍须重新做差异与功能标记审计。
- 同步源码时仍须先做双向差异审计，不能整目录覆盖用户未确认的本地改动。

## 5. 版本规则

- 任何用户可见功能、接口行为、错误修复或线上发布变化都必须增加版本号；不能新增功能后继续沿用旧版本号。
- 默认遵循 SemVer：兼容性功能或修复增加 patch，例如 `1.0.7 -> 1.0.8`；明显新增的大功能可由用户决定增加 minor；破坏兼容性才增加 major。
- 纯文档或仅更新本文件、不改变程序和部署行为时，可以不增加版本号。
- 统一执行：`npm run version:set -- X.Y.Z`。
- 版本必须同步到：根 `package.json`、各 workspace `package.json`、根 `package-lock.json` 的根包与 workspace 条目、`apps/mobile/app.json`、`packages/core/src/index.js` 中的 `APP_VERSION`。
- 发布前用 `rg` 或脚本核对所有项目版本元数据，不允许混用版本。

## 6. 每次任务强制流程

1. 完整阅读本文件，并检查工作树状态；不得撤销不属于当前任务的修改。
2. 在“更新日志与当前进度”追加本次任务的“进行中”条目，写明目标、预期版本、涉及范围和风险。
3. 阅读涉及模块及相邻代码，确认完整功能基线，不凭单一目录或版本字符串判断新旧。
4. 实施最小范围修改；共享协议优先落在 `packages/core`，Web 页面逻辑在 `apps/web/src/main.jsx`，服务端路由在 `apps/web/server.mjs`。
5. 代码或部署行为变化必须先增加版本号，并核对所有版本位置。
6. 本地至少运行 `npm run build:web`；移动端改动还要运行适合的 Expo/原生构建检查。
7. 部署前：备份正确源码文件；保留/标记当前镜像；只构建候选镜像，不立即替换线上。
8. 候选镜像验证：检查版本号和完整功能标记，至少覆盖音乐、语音、图片参考、视频请求预览、聊天图片；构建失败不得替换线上容器。
9. 从 `/opt/grok-workbench/apps/web` 部署。部署后检查 HTTP 200、静态资源哈希、`/auth/me`、容器状态、日志、数据卷挂载和全部功能标记。
10. 将旧镜像保留为明确的回滚标签。不得删除数据卷，不得从 `/opt/grok-workbench/app` 发布。
11. 更新本文件的任务条目为“已完成”或“受阻”，写明变更、验证、部署镜像、回滚点和遗留问题，然后再回复用户。

## 7. 常用命令

```bash
npm run build:web
npm run version:set -- 1.0.9
```

服务器发布：

```bash
ssh 192.168.123.195
cd /opt/grok-workbench/apps/web
docker compose build
# 候选镜像验证通过后：
docker compose up -d --no-build --force-recreate
```

线上检查重点：

```text
GET http://192.168.123.195:38696/
GET http://192.168.123.195:38696/auth/me
docker inspect grok-workbench-web
docker logs --tail 20 grok-workbench-web
```

## 8. 事故复盘：错误基线导致功能降级

- 2026-08-21，为聊天增加图片功能时，最初只修改了本地源码，没有部署，用户仍看到旧页面。
- 后续部署时误把服务器 `/opt/grok-workbench/app` 中滞后的 `1.0.0` 源码当成线上基线，导致原本完整的 `1.0.7` 被替换成“`1.0.0 + 聊天图片`”，音乐、语音等功能消失。
- 处理过程：确认并切回原始 `1.0.7` 镜像；找到 `/opt/grok-workbench` 的完整源码；仅在完整源码上合入聊天图片；候选镜像逐项验证后重新部署。
- 根因不是代码合并本身，而是没有先确认构建目录与线上镜像的功能基线。
- 永久约束：发布前必须同时核对正确路径、版本、功能标记和候选镜像；不得因目录名看似合理就直接重建。

## 9. 更新日志与当前进度

### 2026-08-21：恢复 1.0.7 并增加聊天图片

- 状态：已完成。
- 恢复原始完整 `1.0.7`，保留音乐、语音、图片参考、视频请求预览等功能。
- 在完整 `1.0.7` 源码上增加聊天图片选择、粘贴、预览、删除和多模态消息提交。
- 当前已部署候选镜像 ID：`sha256:ac7cf990869f3544d762a685dd424f08abf0836f6f3e01a26ba7fabdd43b9ada`。
- 回滚镜像标签：`web-grok-workbench-web:1.0.7-original`。
- 当前功能镜像标签：`web-grok-workbench-web:1.0.7-chat-images`。
- 遗留问题：聊天图片属于新增功能，但当时仍显示 `1.0.7`；应在下一条记录中修正为 `1.0.8`。

### 2026-08-21：建立项目持续记忆并修正版本治理

- 状态：已完成。
- 目标：建立 `AGENTS.md` 强制流程；修正版本脚本；将聊天图片发布正式升级为 `1.0.8`；验证完整功能没有回退。
- 范围：文档、版本脚本、项目版本元数据、服务器正确源码和 Web 容器。
- 风险：本地 Web 源码缺音乐，禁止用本地 Web 目录直接发布；服务器 `/opt/grok-workbench` 是此次候选构建基线。
- 完成内容：已创建本文件；版本脚本已支持根 `package-lock.json` 的根包和 workspace 版本；本地与服务器正确源码的版本元数据均已统一为 `1.0.8`。
- 验证：本地 `npm run build:web` 通过；服务器候选 Docker 构建通过；线上首页与 `/auth/me` 返回 200；线上 JS/CSS 确认包含 `1.0.8`、音乐、语音试听、图片参考分析、视频请求预览、聊天图片、粘贴提示和 `clipboardData.items/getAsFile` 兼容逻辑。
- 当前线上镜像：`sha256:28abe8dbb4097fee63ed5c793f6d17b940000b71c5ac80e0c3ecd742fdfb4022`，标签 `web-grok-workbench-web:1.0.8`。
- 回滚点：`web-grok-workbench-web:1.0.7-chat-images` 和 `web-grok-workbench-web:1.0.7-original`。
- 数据：容器继续挂载 `web_grok-workbench-data:/app/data` 和 `grok2api_grok2api-data:/grok2api-data`，未删除或迁移用户数据。
- 测试边界：未使用用户客户端 Key 发起真实多模态模型请求；已完成请求构造代码、构建产物和线上静态功能标记验证。

### 2026-08-21：同步本地与服务器最新 1.0.8 源码

- 状态：已完成。
- 目标：以服务器 `/opt/grok-workbench` 已验证的完整 `1.0.8` 为基线，将音乐等缺失功能同步回本地，消除双基线风险。
- 版本：保持 `1.0.8`；本次只修复源码一致性，不改变线上行为。
- 范围：先审计全部项目文本文件，再同步确认属于最新基线的差异；不得覆盖本地独有且与最新基线不冲突的配置或用户修改。
- 风险：工作树已有大量历史修改，必须逐文件比较，不能使用 Git 重置或整目录覆盖。
- 完成内容：逐文件 SHA256 审计确认仅 `apps/web/src/main.jsx` 与 `apps/web/src/styles.css` 存在差异，差异全部为服务器完整基线中的音乐模块；已原样同步音乐页签、参数生成、结果解析与复制组件及响应式样式，没有改动聊天图片等其他功能。
- 验证：本地 `main.jsx` 与服务器副本 SHA256 一致，本地 `styles.css` 与服务器副本 SHA256 一致；`npm run build:web` 成功，Vite 完成 1577 个模块构建。
- 部署：本次没有替换容器或镜像，线上行为和当前镜像 `sha256:28abe8dbb4097fee63ed5c793f6d17b940000b71c5ac80e0c3ecd742fdfb4022` 保持不变；版本继续为 `1.0.8`。
- 当前结论：本地与服务器 `/opt/grok-workbench` 已恢复为同一套完整 `1.0.8` 源码，可作为后续开发与发布的统一基线。

### 2026-08-21：诊断音乐歌词偏短

- 状态：已完成。
- 目标：对比当前音乐参数生成结果与用户提供的长歌词示例，定位歌词篇幅、段落密度和叙事完整度不足的原因。
- 版本：保持 `1.0.8`；本次仅诊断和记录，不修改程序或线上行为。
- 范围：检查 `apps/web/src/main.jsx` 中音乐系统提示、输出额度、歌曲语言推断、歌词解析和自动时长逻辑，并核对截图中的实际输出结构。
- 风险：截图示例的输入提示和模型可能与当前工作台不同，结论需要区分“系统约束不足”和“模型/用户输入差异”，不能仅按界面行数判断。
- 结论：当前结果不是被解析器或界面截断；歌词解析会完整保留 `LYRICS` 与 `MAX_DURATION` 标记之间的内容，4200 token 输出额度也不是此次约 25–35 行歌词的直接瓶颈。
- 根因一：音乐系统提示只列出了段落标签，没有规定目标歌曲时长、总行数/字数、各段最少行数、重复副歌必须完整写出或叙事推进要求，模型以最短内容满足了格式。
- 根因二：用户示例输入“国风中文歌曲 女声”只有风格、语言和人声，没有主题、人物、冲突、意象或情绪转折；与带完整亲情叙事的参考长歌词并非同等输入条件。
- 根因三：音乐调用 `selectChatModel()`，该函数在固定模型列表中选择第一个名称包含 `chat` 的项目，实际固定使用 `grok-chat-fast`；即使存在 `grok-chat-expert`、`grok-chat-heavy` 等模型，音乐页也无法选择，快模型更倾向短而保守的合规输出。
- 质量问题：当前约 25–35 行有效歌词却给出约 230 秒自动时长，缺少歌词密度与时长一致性校验；同时出现无实际歌词内容的拟声式 Post-Chorus，说明结构优先于内容质量。
- 建议方向：后续若实施，应增加歌曲长度/创作模式与模型选择，默认完整歌曲约 3.5–4.5 分钟；中文歌词约 45–65 个非空演唱行、320–500 汉字，Verse 8–12 行、Pre-Chorus 4 行、Chorus 8–12 行、Bridge 6–8 行，并要求重复副歌完整输出、每段推进故事且自动时长按实际歌词密度校验。
- 变更与部署：本次仅完成诊断和文档记录，没有修改代码、版本或线上容器，继续保持 `1.0.8`。

### 2026-08-21：增强音乐歌词完整度与模型选择

- 状态：已完成。
- 目标：按诊断建议增加音乐模型手动选择、歌曲长度模式、完整歌词结构与叙事约束，并校验歌词密度和自动时长。
- 预期版本：`1.0.9`；属于用户可见功能和生成行为改进，必须增加 patch 版本。
- 范围：`apps/web/src/main.jsx`、`apps/web/src/styles.css`、版本元数据、服务器正确源码 `/opt/grok-workbench` 和 Web 候选镜像。
- 模型策略：先测试服务器实际可用模型，优先支持用户判断可用的 `grok-4.5`、`grok-4.6`、`grok-chat-fast`，界面提供手动切换；不得仅凭本地已知模型列表声称可用。
- 风险：真实模型调用依赖客户端 Key；如果服务器端无法取得用户 Key，只能验证模型列表暴露、请求构造和由用户会话完成真实调用。部署前必须确认聊天图片、音乐、语音、图片参考和视频诊断没有回退。
- 当前进度：版本元数据已统一为 `1.0.9`；音乐模型下拉、短歌/标准/长歌模式、最低歌词密度自动重试、叙事和重复段落约束、时长归一化已实现；本地构建通过。
- 候选验证：服务器正确目录构建的候选镜像 `sha256:87e62551a45c158cb37b17c6b9f07d9ecaa37bc27d3b365d72e8d16e99d02d82` 在临时端口 `38697` 返回 200、版本显示 1.0.9，桌面和 390px 移动端控件均已检查；匿名 `/v1/models` 返回 401 属于预期鉴权行为。
- 模型实测：经用户明确确认后，使用浏览器中已配置的客户端 Key 分别对 `grok-4.5`、`grok-4.6`、`grok-chat-fast` 发起最小文本请求，三个模型均成功返回 `OK`；音乐页最终保留三者手动切换，默认 `grok-4.5`。
- 生成改进：增加短歌 2–3 分钟、标准 3.5–4.5 分钟、长歌 4.5–5.5 分钟；分别定义最低有效演唱行和正文密度；要求 Verse 叙事推进、Bridge 转折、重复副歌完整写出；低于最低密度时自动重写一次，并按歌词密度和模式区间归一化 `max_duration`。
- 界面改进：桌面和 390px 移动端验证通过；修正移动端页签被挤成竖排的问题，页签保持单行并横向滚动。
- 部署：已从正确目录 `/opt/grok-workbench/apps/web` 部署到 `http://192.168.123.195:38696`；线上首页与 `/auth/me` 返回 200，当前容器镜像为 `sha256:87e62551a45c158cb37b17c6b9f07d9ecaa37bc27d3b365d72e8d16e99d02d82`，标签 `web-grok-workbench-web:1.0.9`。
- 完整功能回归：线上构建产物确认包含音乐模型/长度/自动扩写、聊天图片粘贴、语音试听、图片参考和视频实际发送预览；容器继续挂载 `web_grok-workbench-data:/app/data` 与只读 `grok2api_grok2api-data:/grok2api-data`。
- 一致性：本地与服务器 `/opt/grok-workbench` 的 `main.jsx`、`styles.css`、根 `package.json` 和根 `package-lock.json` SHA256 完全一致，版本元数据统一为 `1.0.9`。
- 回滚点：`web-grok-workbench-web:1.0.8-before-music-quality`，镜像 ID `sha256:28abe8dbb4097fee63ed5c793f6d17b940000b71c5ac80e0c3ecd742fdfb4022`；备份目录 `/opt/grok-workbench/backups/1.0.8-before-music-quality-20260821`。

### 2026-08-30：重建 GitHub 仓库并补全移动端对齐 Web 1.0.9

- 状态：已完成。
- 目标：按方案 1 重建 `chenweitian423/grok-workbench-mobile` 公共仓库，将移动端功能对齐 Web 1.0.9（补齐真实聊天页、聊天图片多模态、音乐页），并通过 GitHub Actions 产出 Android APK 与未签名 iOS IPA。
- 版本：移动端与 Web 保持一致 `1.0.9`；本次只改移动端与 CI，不修改 Web `main.jsx`、不部署线上 Web 容器。
- 仓库：已重建并推送 `https://github.com/chenweitian423/grok-workbench-mobile`（public），本地 remote 指向该 URL，基线提交 `776c2f5`。
- 移动端改动：`apps/mobile/App.js` 新增聊天页（消息历史、聊天模型输入、最多 4 张图片多选、预览删除、`text+image_url` / `input_text+input_image` 多模态发送）；新增音乐页（grok-4.5 / grok-4.6 / grok-chat-fast 模型选择、短歌/标准/长歌模式、歌词密度校验与自动重写、时长归一化、四段结果复制，逻辑与 Web 1.0.9 一致）。
- 配置改动：`app.json` 增加 Android `usesCleartextTraffic: true` 与 iOS `NSAllowsArbitraryLoads: true`，保证能访问 `http://192.168.123.195:38695`；`package.json` 增加 `expo-clipboard ~7.0.1`。
- 事故与修复：CI 首次 Android 构建失败，根因是 `expo-document-picker ^13.0.2`、`expo-image-picker ^16.0.3`、`expo-status-bar ^2.0.1` 的 caret 范围解析到更新 SDK 的版本（13.1.6 / 16.1.4 / 2.2.3），与 Expo 52 的 `expo-modules-core` 不兼容（`expo-module-gradle-plugin` 找不到、`release` component 属性缺失）。已全部改为 Expo 52 配套版本 `~13.0.3 / ~16.0.6 / ~2.0.1`；同时修复 `android-apk.yml` 与 `web-build.yml` 中读取版本号的 shell 转义问题。
- 验证：本地 `npm run build:web` 通过（1577 模块）；`npx expo export --platform android` 通过（581 模块）；`npx expo config --type public` 确认明文 HTTP 配置生效。
- 构建产物：Android APK 构建成功（run 33268370792，约 65 MB），下载至本地 `dist-android/GrokWorkbench-v1.0.9-3.apk`；iOS 未签名 IPA 构建成功（run 33268807697，约 5.6 MB），下载至本地 `dist-ios/GrokWorkbench-v1.0.9-2-unsigned.ipa`。两者均已用归档结构校验（APK 含 classes.dex/lib，IPA 含 Payload/GrokWorkbench.app）。
- 部署：本次没有替换任何服务器容器或镜像，Web 线上 1.0.9 保持不变；`grok-workbench-deploy.tgz` 与 `dist-*` 已加入 `.gitignore`，不进入仓库。
- 遗留：移动端功能补齐未做真实设备上的图片选择/多模态请求联调，依赖用户安装 APK/IPA 后使用真实客户端 Key 验证；iOS IPA 未签名，需侧载（如 AltStore）或后续签名。

### 2026-08-30：移动端补齐提示词页、设置页与逐项模型选择

- 状态：已完成。
- 目标：按用户反馈补齐移动端缺失的“提示词”页签（图片还原/文字扩写/影视制作全案）与“设置”页签（API 地址、客户端 Key、获取模型按钮），并让聊天/图片/视频/语音/音乐每一项都能手动选择模型。
- 版本：保持 `1.0.9`，只改移动端与 CI 产物，不动 Web 线上。
- 范围：`apps/mobile/App.js`、`apps/mobile/package.json`、根 `package-lock.json`、AGENTS.md；新增 `@react-native-async-storage/async-storage 1.23.1`（Expo 52 配套版本）。
- 完成内容：
  - 页签补齐为 7 个：提示词、聊天、图片、视频、语音、音乐、设置。
  - 设置页：API 地址、完整客户端 Key 移入设置页，支持“保存设置”与“获取模型”；设置与模型列表通过 AsyncStorage 持久化，启动时自动恢复。
  - 提示词页：图片还原提示词 / 文字扩写图片提示词 / 一句话影视制作全案，参考图（需要时）、创作模型选择、结果展示与“用于创作”复制回输入框。
  - 逐项模型选择：聊天、图片、视频、语音均增加模型 chips（从获取的模型列表按类型过滤，并带已知模型兜底）；音乐保持 grok-4.5 / grok-4.6 / grok-chat-fast 切换。
  - 图片/视频页使用所选图片/视频模型；参考图分析仍走聊天模型。
- 验证：本地 `npx expo export --platform android` 通过（新增 AsyncStorage 后打包正常）；`npm run build:web` 通过，Web 基线未变。
- 构建产物：Android run 33269706349 成功，`dist-android/GrokWorkbench-v1.0.9-5.apk`（约 65 MB）；iOS run 33269709668 成功，`dist-ios/GrokWorkbench-v1.0.9-3-unsigned.ipa`（约 5.7 MB）。旧版安装包已移到各自 `旧版本/` 子目录，未删除。
- 部署：未改动任何服务器容器或镜像，Web 线上 1.0.9 保持不变。
- 遗留：真实设备验证仍未完成，建议安装 v1.0.9-5 APK / v1.0.9-3 IPA 后重点验证：设置页填 Key 并“获取模型”、各功能页模型 chips、提示词三种工作流、聊天带图。

### 2026-08-30：仓库可见性确认、Actions 额度与构建记录清理

- 状态：已完成。
- 目标：确认 `grok-workbench-mobile` 为公开仓库（开源项目，避免私有仓库消耗 Actions 免费分钟额度），检查额度状态并清理旧构建记录。
- 仓库可见性：已确认 `chenweitian423/grok-workbench-mobile` 为 `PUBLIC`，无需再改；公开仓库的 GitHub Actions 免费且不限分钟，本项目构建不消耗账户额度。
- 额度说明：账户级精确分钟用量需要 gh 授权 `user` scope（会弹出浏览器授权）或在 GitHub 网页 Settings → Billing 查看；账号下另有 2 个私有仓库 `mmusic-client`、`tmdb`，只有私有仓库的 Actions 才消耗 Free 计划每月 2000 分钟免费额度。
- 清理动作：删除 11 条旧构建记录（失败/取消/早期成功 runs），保留最新 Web（33270195834）、Android v1.0.9-6（33270195830）、iOS v1.0.9-3（33269709668）；旧 artifacts 随 run 自动清除，GitHub 上现有 artifacts 仅 web v6、android v6、ios v3 三项。
- 工作流优化：`android-apk.yml` 与 `web-build.yml` 增加 push 路径过滤（`apps/mobile/**`、`apps/web/**`、`packages/**`、`package.json`、`package-lock.json`），以后仅文档/AGENTS.md 变更不再触发构建；iOS 仍为手动触发。
- 本地产物：最新 Android 安装包 `dist-android/GrokWorkbench-v1.0.9-6.apk`；旧版 v1.0.9-3、v1.0.9-5 已移入 `dist-android/旧版本/`；iOS 最新为 `dist-ios/GrokWorkbench-v1.0.9-3-unsigned.ipa`，旧版在 `dist-ios/旧版本/`。
- 部署：未改动服务器容器或镜像，Web 线上 1.0.9 保持不变。

### 2026-08-30：移动端修复生成图片显示并新增图库（进行中）

- 状态：进行中。
- 目标：修复移动端生成图片无法显示的问题（媒体 URL 被解析成 Web 专属 `/asset/` 路径，移动端访问不到），并新增图库页展示历史图片/视频、支持打开与下载。
- 版本：保持 `1.0.9`，只改移动端与 CI 产物，不动 Web 线上。
- 侦察结论：Grok2API 媒体读取接口为 `GET /v1/media/images/{id}`（图片，无需鉴权）与 `GET /v1/media/videos/{id}`（视频）；生成接口返回的 url 形如 `http://127.0.0.1:8000/v1/media/images/xxx`；历史列表仅有管理端接口 `/api/admin/v1/media/images|videos?page=&pageSize=`（需管理员权限，普通客户端 Key 可能 401）。
- 范围：`apps/mobile/App.js`、`apps/mobile/package.json`、根 `package-lock.json`、AGENTS.md；新增 `expo-file-system ~18.0.12` 与 `expo-sharing ~13.0.1` 用于下载/分享媒体。

### 2026-08-30：移动端修复生成图片显示并新增图库

- 状态：已完成。
- 目标：修复移动端生成图片无法显示（媒体 URL 被解析成 Web 专属 `/asset/` 路径），并新增图库页展示历史图片/视频、支持打开与下载。
- 版本：保持 `1.0.9`，只改移动端与 CI 产物，未动 Web 线上。
- 根因：`packages/core` 的 `extractMediaItems` 在有 asset id 时优先生成 `/asset/xxx`（Web server 专属路由，需登录+归属），移动端直接连 Grok2API 无法访问；Grok2API 实际媒体读取路径是 `/v1/media/images/{id}` / `/v1/media/videos/{id}`（图片无需鉴权可读）。
- 完成内容：
  - 移动端自实现 `extractMobileMediaItems`：优先使用 Grok2API 返回的原始 url（`/v1/media/...`），并把 `127.0.0.1` / `localhost` / `host.docker.internal` 主机替换为设置里的 Grok2API 地址；有 asset id 时构造 `/v1/media/images|videos/{id}`。
  - 新增“图库”页签：自动记录本机生成的图片/视频（AsyncStorage 持久化，最多 300 条）；提供“同步服务器媒体”（尝试调用 Grok2API 管理端列表接口，客户端 Key 有权限则拉取全部历史，无权限仅提示本机记录）；图片网格缩略图 + 点击全屏预览 Modal；视频卡片可播放/下载；图片与视频均支持下载（expo-file-system 下载到缓存目录 + expo-sharing 调起系统保存/分享）。
  - 生成图片/视频成功后自动写入图库。
- 依赖：新增 `expo-file-system ~18.0.12`、`expo-sharing ~13.0.1`（Expo 52 配套版本；SDK 52 的 expo-file-system 主入口即旧 API，无需 `/legacy` 子路径）。
- 验证：本地 `npx expo export --platform android` 通过；`npm run build:web` 通过，Web 基线未变。
- 构建产物：Android run 33292012524 成功，`dist-android/GrokWorkbench-v1.0.9-7.apk`；iOS run 33292016047 成功，`dist-ios/GrokWorkbench-v1.0.9-4-unsigned.ipa`；旧版安装包已移入各自 `旧版本/` 子目录。
- 清理：删除被取代的旧构建记录（Android v6、iOS v3、旧 Web），GitHub 仅保留最新 Web / Android v7 / iOS v4 三条。
- 遗留：图库的“同步服务器媒体”依赖客户端 Key 是否拥有 Grok2API 管理权限；若 401 则只能显示本机生成记录（本机记录已覆盖移动端自己的生成历史）。真实设备验证仍建议重点检查：生成后立即显示、图库缩略图、点击大图、下载保存。

### 2026-08-30：移动端图库同步与相册下载修复

- 状态：已完成。
- 目标：修复图库“同步服务器媒体”拿不到服务器图片，以及生成图片点击下载报错/无法保存到系统相册的问题；用户已将 Grok2API 地址改为公网 `https://grok.sky423.cn:18888`。
- 版本：移动端升 `1.0.10`；Web 线上保持 `1.0.9` 不动。本次为移动端专属版本：只改 `apps/mobile/package.json`、`apps/mobile/app.json`、移动端 CI 版本读取和 `App.js`，不触碰 Web 源码与部署基线（根 `package.json` 仍为 1.0.9，作为例外在交付说明中记录）。
- 侦察结论：
  - 同步失败根因：`/api/admin/v1/media/images|videos` 是 Grok2API 管理端接口，要求管理员 JWT（源码确认中间件优先读 `Authorization: Bearer`，普通客户端 Key 必然 401 `adminUnauthorized`）。
  - 公网反代验证：`https://grok.sky423.cn:18888` 证书有效；`/healthz` 200；`/v1/media/images/{id}` 免鉴权可读；`POST /api/admin/v1/auth/login` 可达（错误时返回 400/401）。登录成功返回 `tokens.accessToken`，可直接带 Bearer 调管理端接口，无需 Cookie。
  - 下载报错根因：旧图库记录可能存有 `http://127.0.0.1:8000/...` 或 `/asset/...` 失效路径；且当前实现用 expo-sharing 分享，不会直接写入系统相册。
  - 管理端视频列表返回的是任务对象（`assetID` 才是媒体资源 ID），旧解析按任务 ID 拼 URL 会 404。
- 方案：设置页新增“管理端账号/密码”（仅本机持久化，不写入本文件）；同步时先登录拿 accessToken 再拉媒体列表；视频用 `assetID` 拼 URL；下载改为 `expo-media-library` 的 `saveToLibraryAsync` 直接存相册，下载前按当前 baseUrl 重建旧记录 URL。
- 范围：`apps/mobile/App.js`、`apps/mobile/package.json`、`apps/mobile/app.json`、根 `package-lock.json`、`android-apk.yml`、`ios-unsigned-ipa.yml`、AGENTS.md。
- 风险：管理端登录依赖用户提供正确的管理员账号密码；真实设备上的相册权限授权需要用户实测确认。
- 完成内容：
  - 设置页新增“管理端账号/密码”输入（仅 AsyncStorage 本机保存，不写入本文件、不上传服务器）。
  - 图库“同步服务器媒体”改为：无管理端凭据时提示去设置填写；有凭据时先 `POST /api/admin/v1/auth/login` 拿 `accessToken`（带过期时间缓存），再带 `Authorization: Bearer` 拉图片/视频列表；视频只同步 `completed` 且带 `vid_` 资源 ID 的任务，URL 直接用 `assetId` 构造。
  - 下载改为：下载前用 `repairGalleryItem` 按当前 Grok2API 地址重建 URL（旧记录里的 `127.0.0.1`、`/asset/`、旧内网地址都会被修正）；`expo-media-library` 的 `requestPermissionsAsync(true)` + `saveToLibraryAsync` 直接写入系统相册；权限被拒时回退系统分享；data URL 用 Base64 写文件兜底。
  - 版本：移动端 `1.0.10`（`app.json` version/buildNumber、Android versionCode 10010）；Android/iOS CI 的版本读取改为 `apps/mobile/package.json`；新增 `expo-media-library ~17.0.6`（SDK 52 配套）；iOS 增加 `NSPhotoLibraryAddUsageDescription`，Android 增加 `WRITE_EXTERNAL_STORAGE`。
- 验证：本地 `npx expo export --platform android` 通过（590 模块）；`npm run build:web` 通过（1577 模块，Web 基线未变）；`npx expo config` 确认 1.0.10/versionCode 10010/权限生效；登录与媒体接口字段已对照开源源码确认（`tokens.accessToken`、图片 `items[].url`、视频 `items[].assetId`）。
- 构建产物：Android run 33293185228 成功，`dist-android/GrokWorkbench-v1.0.10-8.apk`（约 65 MB）；iOS run 33293189087 成功，`dist-ios/GrokWorkbench-v1.0.10-5-unsigned.ipa`（约 5.8 MB）；APK 含 classes.dex/lib、IPA 含 Payload 结构校验通过。旧版 v1.0.9-7 APK 与 v1.0.9-4 IPA 已移入各自 `旧版本/` 子目录。
- 清理：删除被取代的旧构建记录（Android v7、iOS v4、旧 Web），GitHub 仅保留最新 Web（33293185279）/ Android v1.0.10-8 / iOS v1.0.10-5 三条。
- 部署：未改动任何服务器容器或镜像，Web 线上 1.0.9 保持不变；本文件已同步到服务器 `/opt/grok-workbench/AGENTS.md`。
- 遗留：真实设备验证建议重点检查：设置页填管理端账号密码后“同步服务器媒体”能拉到服务器历史图片/视频；生成图片点击下载能直接写入系统相册（首次会弹权限）；公网地址下旧图库记录能正常显示与下载。

### 2026-08-30：移动端接入工作台账号系统与下载修复

- 状态：已完成。
- 目标：按用户反馈重构移动端图库方案：① 不再用 Grok2API 管理端账号同步（普通客户端 Key 永远无管理权限），改为和 Web 端一致的工作台注册/登录，图库按账号隔离，每个人只看自己的历史；② 修复 iOS 下载报错 `NSURLErrorDomain -3000 Cannot create file`。
- 版本：全仓统一升 `1.0.11`（根、Web、移动端、core、锁文件、`APP_VERSION`、`app.json`、versionCode 10011）。上一轮移动端临时 `1.0.10` 仅为过渡，本轮统一回同版本。Web 需要重新构建并部署（server.mjs 有接口行为变化）。
- 服务端改动（`apps/web/server.mjs`）：登录/注册响应体新增 `token` 字段；`getSessionUser` 同时接受 `Authorization: Bearer` / `X-GW-Token` 头（Cookie 兼容保留，Web 端不受影响）。本地已端到端验证：注册返回 token、带 token 读 `/library` 200、无 token 401、退出登录正常。
- 移动端改动（`apps/mobile/App.js`、`app.json`、`package.json`）：
  - 设置页移除“管理端账号/密码”，新增“工作台地址”（默认 `http://192.168.123.195:38696`）和注册/登录/退出；令牌与本机保存，密码不持久化。
  - 图库“同步我的图库”改为拉取工作台 `/library?kind=image|video`（按账号），展示与下载用 Grok2API 公网媒体 URL（`/v1/media/images|videos/{id}`，免鉴权）。
  - 生成图片/视频成功后自动 `POST /ownership/claim` 把资源归属到当前账号，Web 端与移动端同账号互通。
  - 下载修复：弃用 `FileSystem.downloadAsync`（iOS 后台下载任务会报 -3000），改为 `fetch` + `blob` + Base64 `writeAsStringAsync` 落盘，再 `MediaLibrary.saveToLibraryAsync` 存相册，权限拒绝时回退分享。
- 风险：工作台默认内网地址，手机在外网时需在设置里填工作台公网地址（或连内网 Wi-Fi）；Web 部署必须保留数据卷与旧镜像回滚标签。
- 范围：`apps/web/server.mjs`、版本元数据、`apps/mobile/*`、CI 版本读取（上轮已改）、AGENTS.md；Web 容器需重新部署。
- 完成内容：
  - 服务端 `apps/web/server.mjs`：登录/注册响应体新增 `token`；`getSessionUser` 同时接受 `Authorization: Bearer` / `X-GW-Token`（Cookie 兼容保留，Web 端不受影响）。
  - 移动端设置页：移除管理端账号，新增“工作台地址”+ 注册/登录/退出；令牌持久化，密码不落盘。
  - 图库：`同步我的图库` 改拉工作台 `/library?kind=image|video`（按账号隔离）；生成图片/视频成功后 `POST /ownership/claim` 自动归属到当前账号；展示/下载统一用 Grok2API 公网媒体 URL。
  - 下载：弃用 `FileSystem.downloadAsync`（iOS 报 -3000），改为 `fetch` + `blob` + Base64 `writeAsStringAsync` 落盘后 `MediaLibrary.saveToLibraryAsync` 存相册，权限拒绝回退分享。
  - 版本：全仓统一 `1.0.11`（根/Web/移动端/core/锁文件/`APP_VERSION`/`app.json`/versionCode 10011）。
- 验证：
  - 本地：`npm run build:web` 通过（1577 模块）；`npx expo export --platform android` 通过（590 模块）；本地临时起 server.mjs 端到端验证注册返回 token、带 token 读 `/library` 200、无 token 401、退出正常。
  - 部署：候选镜像 `sha256:c85a5f67ad9c9258d3b5fef790c4d4782fd9e77b9f6c3de411ae02f13f825908` 临时端口 38697 验证首页 200、`/auth/me` 200、未登录 `/library` 401、产物含 1.0.11；正式上线后线上 `/auth/me` 200、容器挂载 `web_grok-workbench-data:/app/data` 与只读 `grok2api_grok2api-data:/grok2api-data` 保留；线上用临时账号 `codetest_live` 验证登录→me→library→退出全部正常后已从 auth.json 清理（恢复测试前备份）。
  - 构建：Android run 33294237062 成功 `dist-android/GrokWorkbench-v1.0.11-9.apk`（约 65 MB）；iOS run 33294239898 成功 `dist-ios/GrokWorkbench-v1.0.11-6-unsigned.ipa`（约 5.8 MB）；结构校验通过；旧包 v1.0.10-8 / v1.0.10-5 已移入 `旧版本/`。
  - 清理：删除被取代的 v1.0.10 三条构建记录，GitHub 仅保留最新 Web（33294237212）/ Android v1.0.11-9 / iOS v1.0.11-6。
- 部署状态：Web 线上已更新为 1.0.11（镜像 `c85a5f67ad9c`）；回滚标签 `web-grok-workbench-web:1.0.9-before-accounts`（镜像 `87e62551a45c`）；源码备份 `/opt/grok-workbench/backups/1.0.9-before-accounts-20260830/`（含旧 server.mjs 与测试前 auth.json）。
- 遗留：真实设备验证重点：① 设置页用与 Web 端相同的账号登录后，“同步我的图库”能拉到自己的历史；② 换账号登录不会看到别人的图库；③ iOS 下载能直接存相册（首次弹权限）；④ 手机在外网时需把工作台（38696）也暴露到公网，或在设置里填工作台公网地址。

### 2026-08-30：移动端图片参数对齐 Web 与提示词分段复制（进行中）

- 状态：进行中。
- 目标：① 移动端图片生成界面补齐 Web 端的图片数量（1x/2x/4x）、比例（1:1/16:9/9:16/4:3/3:4）、分辨率（1k/2k）参数；② 提示词功能生成结果按段落展示，每段可单独复制。
- 预期版本：全仓统一 `1.0.12`；按版本规则不允许混用版本，Web 需重新构建并部署以同步版本号（server.mjs 无逻辑变化，走标准候选镜像流程，风险低）。
- 范围：`apps/mobile/App.js`、版本元数据（根/Web/移动端/core/锁文件/`APP_VERSION`/`app.json`/`MOBILE_APP_VERSION`）、AGENTS.md；Web 容器需重新部署。
- 风险：提示词输出格式由模型决定，分段解析采用“短行标题冒号”识别 + 空行分段兜底，可能无法完美匹配所有模型输出；真实设备需验证生成参数是否生效、分段复制是否好用。
- 已完成侦察：Web `main.jsx` 数量 `[1,2,4]`（显示 1x/2x/4x）、比例 `["1:1","16:9","9:16","4:3","3:4"]`、分辨率 `["1k","2k"]`，默认 `{count:1, aspectRatio:"1:1", resolution:"1k"}`；`packages/core` 的 `generateImage` 已原生支持 `n/aspect_ratio/resolution`，无需改 core；移动端 `createImage` 未传这些参数，`PromptWorkspace` 整段展示无分段复制，已有 `ResultBlock` 组件可复用。
