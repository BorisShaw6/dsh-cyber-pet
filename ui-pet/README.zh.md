# @deepseek-ai/dsh-client-ui-pet

[English](README.md) | 中文

赛博宠物表面插件的浏览器半边：一只 DeepSeek 风格的鲸鱼悬浮在整帧 `shell.overlay` 浮层中（order 100，附加式 `pet` 单元）。插槽 inject 闭包里构建的唯一 `CyberPetTracker` 会把会话列表存储（对话框数量、当前选中）与当前会话的对话快照（用户消息交互数、助手消息 token 用量、最新请求提示词大小作为实时上下文占用）折叠成一个不可变的 `PetStats` 快照；注册方私有的 `hooks` 舱位把它发布为绑定的 `usePetStats` 选择器钩子，inject 面只携带一组设置动词。生命周期计数与全部偏好持久化在 `localStorage` 的 `dsh.cyber-pet.v3` 键下，并按会话记录单调递增的高水位，历史窗口收缩或页面刷新都不会让已记录的消耗变小。两分钟的滚动采样窗口推导实时消耗速度。

鲸鱼默认小黄体色，内置七个预设色与自由取色器，提供像素风与拟物风两种造型，并按累计 tokens 经历四个成长阶段（幼鲸 → 少年鲸 → 成年鲸 → 金冠鲸，最高级戴皇冠）。行为模式 活跃 / 静候 / 睡眠 可在设置面板或右键快捷菜单切换；活跃模式下鲸鱼自动巡游——游速 = 实时消耗速度 × 用户速度比，活动范围按用户设定的屏幕百分比圈定——休息提醒会在连续 N 轮后让它打盹三分钟。面板是玻璃拟态卡片，含三个标签页：概览（用户自定义的卡片矩阵——显示 / 大小 / 顺序——加额度条与 PNG 报告卡导出）、聊天（本地规则大脑、浏览器直连 OpenAI 兼容接口、或宿主侧 `petChat` Remote）、设置。鲸鱼下方的悬浮条展示用户选定的指标（额度 / 上下文 / 轮次），点击即切换；点在宠物以外区域会关闭面板。气泡会播报每轮消耗、里程碑（每 1 万 tokens）、首次加载时的昨日小结、休息提醒与投喂反馈（把 token 小鱼干拖到鲸鱼身上）。开启音效时，回合、里程碑与投喂伴随轻量 WebAudio 音效。

`/client` 导出为插件本体（`apply`/`inject`）与共享契约类型（`PetActions`、`PetKey` 以及 tracker 的设置/统计类型）。

## 安装到 DeepSeek Harness

插件以两个包的形式加入 harness 工作区：本客户端表面（`packages/client/ui-pet`）与可选的宿主侧聊天大脑（`packages/feedback/pet-chat`）。安装 = 把两者拷入 DeepSeek Harness 源码树，再加四处注册行。已在 harness `0.1.0-rc.5` 上验证（开发者预览版，API 变化很快，请钉住相同版本）。

> ⚠️ 这是源码级集成：需要一份 harness **源码 checkout** 才能打补丁并重新构建。如果你跑的是 npm 方式的 harness（`npx @deepseek-ai/dsh web`，≥ `0.1.0-rc.6`），请改用一行的 `dsh plugin add` bundle——见仓库 README 的方式 A。源码最快路径：在仓库根目录执行 `./install.sh --quick`，它会克隆固定版本的 harness 并自动完成下面全部步骤。

### 前置条件

- Node.js ≥ 22.19（推荐 24+）
- Git ≥ 2.26
- 通过 Corepack 启用 pnpm：`corepack enable`（harness 钉住 `pnpm@11.7.0`）

### 第 1 步 — 克隆 DeepSeek Harness

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
```

### 第 2 步 — 拷贝两个插件包

从本仓库拷入：

| 来源（本仓库） | 目标（harness 源码树） |
|---|---|
| `ui-pet/` | `packages/client/ui-pet/` |
| `pet-chat/` | `packages/feedback/pet-chat/` |

```sh
# 在 harness 根目录执行，假设本仓库克隆在旁边
cp -r ../dsh-cyber-pet/ui-pet   packages/client/ui-pet
cp -r ../dsh-cyber-pet/pet-chat packages/feedback/pet-chat
```

### 第 3 步 — 注册包（4 处修改）

1. `tsconfig.host.json` — 在 `references` 中加入：

   ```json
   { "path": "./packages/feedback/pet-chat" },
   ```

2. `tsconfig.client.json` — 在 `references` 中加入：

   ```json
   { "path": "./packages/client/ui-pet" },
   ```

3. `packages/bundle/web-app/package.json` — 在 `dependencies` 中加入：

   ```json
   "@deepseek-ai/dsh-pet-chat": "workspace:^",
   "@deepseek-ai/dsh-client-ui-pet": "workspace:^",
   ```

4. `packages/bundle/web-app/cordis.patch.yml` — 在宿主平面区块（`message-feedback` 附近）加入宿主服务行：

   ```yaml
   - id: pet-chat
     name: '@deepseek-ai/dsh-pet-chat'
   ```

   再在同文件的浏览器 roster `insert` 区块（其他 `dsh-client-ui-*` 行旁边）加入：

   ```yaml
   # Cyber pet: the floating usage whale in the shell.overlay layer.
   - id: ui-pet
     name: '@deepseek-ai/dsh-client-ui-pet'
   ```

### 第 4 步 — 安装、构建、运行

```sh
pnpm install
pnpm run build   # 宿主库 + 客户端 bundle + Web 前端（需要几分钟）
pnpm dsh web
```

打开 `http://127.0.0.1:3080`，右下角会出现小黄鲸。如果页面已经开着，请强制刷新（`Cmd/Ctrl+Shift+R`）。

可选 — 宿主宝贝聊天后端经宿主 llm 通道调用模型，需要配置好的供应商密钥，例如：

```sh
export DEEPSEEK_API_KEY=sk-...
pnpm dsh web
```

### 卸载

反向撤销第 3 步的四处修改，删除两个包目录，再执行 `pnpm install && pnpm run build`。

## 使用指南

- **移动**：拖动鲸鱼到任意位置，位置会持久化；右键切换行为模式 活跃 / 静候 / 睡眠。
- **打开面板**：点击鲸鱼。三个标签页：概览（额度条、自定义卡片矩阵、PNG 报告导出）、聊天（本地宝贝 / 在线宝贝 / 宿主宝贝）、设置（全部选项）。
- **鲸鱼下方的悬浮条**：点击可在 额度 → 上下文 → 轮次 之间循环切换展示指标。
- **聊天后端**：本地宝贝基于实时数据回答、零请求；在线宝贝直连你配置的任意 OpenAI 兼容接口（地址 / Key / 模型）；宿主宝贝走宿主 `petChat` 服务，使用 harness 凭据。
- **投喂**：面板打开时，把 🪙 小鱼干拖到鲸鱼身上。
- **语言**：设置里的 语言 开关会切换整个应用的界面语言（中文 / English）。
- **全部设置与计数**持久化在浏览器 `localStorage` 的 `dsh.cyber-pet.v3` 键下。

### 常见问题

| 现象 | 处理 |
|---|---|
| 页面上没有鲸鱼 | 没执行 `pnpm run build`，或浏览器缓存了旧 bundle——重新构建后强制刷新；同时检查控制台是否有 `dsh-client-ui-pet` 报错。 |
| 启动报 `failed to apply loader entry pet-chat` | `cordis.patch.yml` 的宿主编排行缺失/写错，或包没拷到 `packages/feedback/pet-chat`。 |
| 宿主宝贝回复 `pet-chat-unavailable` | 同上——宿主服务未挂载；本地宝贝 / 在线宝贝仍可正常使用。 |
| Typert 构建报 boundary types 错误 | 请保持 pet-chat 的传输类型放在 `./types` 子路径（仓库已按此结构提供，不要合并回 `index.ts`）。 |

## Model Experience

None, as the pet surface folds public session snapshots into browser-local usage stats and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **浏览器本地生命周期计数** — 累计 tokens / 交互数按浏览器档案累积在 `localStorage`；宿主上删除的会话仍保留其高水位贡献，另一台设备从零开始。
- **仅折叠当前会话** — 每会话计数只跟踪当前打开的会话；本浏览器从未打开过的会话在被访问前不产生任何贡献。
- **在线聊天的 Key 存在浏览器里** — 浏览器直连的在线宝贝把 API Key 存在 `localStorage`，且只会发送给用户配置的接口；宿主后端（`petChat` Remote）把凭据留在宿主侧，但需要部署挂载 `pet-chat` 行。
