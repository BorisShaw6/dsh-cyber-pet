# dsh-cyber-pet 🐳

[English](README.md) | **中文** · **[🎮 在线演示](https://borisshaw6.github.io/dsh-cyber-pet/demo/)**

---

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的赛博鲸鱼宠物：一只悬浮在 Web 页面里、可以投喂、可以换色的鲸鱼，实时播报 token 用量、额度、上下文占用、交互次数与对话框数量——自带三种聊天后端、成长等级、情绪系统、里程碑庆祝与一键 PNG 报告卡。

> 🎮 **不用安装也能玩**：[在线演示](https://borisshaw6.github.io/dsh-cyber-pet/demo/) —— 浏览器里直接换造型、换颜色、模拟对话、投喂鲸鱼。

## 界面预览

**两种造型** — 像素风与拟物风（动态图为应用内皮肤的 SVG 实时复刻，下方为真实截图）：

| 像素风 | 拟物风 |
|:---:|:---:|
| ![像素风演示](docs/demo-pixel.svg) | ![拟物风演示](docs/demo-skeuo.svg) |
| ![像素风实机](docs/whale-pixel.png) | ![拟物风实机](docs/whale-skeuo.png) |

**中英双语面板**：

| 中文面板 | 英文面板 |
|:---:|:---:|
| ![中文面板](docs/whale-panel-zh.png) | ![英文面板](docs/whale-panel-en.png) |

**它会说话** — 每轮对话结束，鲸鱼用气泡播报本轮消耗与剩余额度：

<p align="center"><img src="docs/whale-bubble.png" width="420" alt="气泡播报"/></p>

## 安装

### 方式 A — 一行插件安装（推荐）

需要 DeepSeek Harness ≥ `0.1.0-rc.6`（`dsh plugin` 流程）与 PATH 上的 pnpm。兼容 npm 方式的 harness——无需源码 checkout、无需重新构建：

```sh
npx @deepseek-ai/dsh plugin --profile web add @borisshaw6/dsh-cyber-pet
npx @deepseek-ai/dsh web                  # （重新）启动后打开 http://127.0.0.1:3080
```

bundle 包（[dsh-cyber-pet-bundle/](dsh-cyber-pet-bundle/)）同时携带两半——宿主侧 `petChat` Remote 与浏览器表面——通过 profile 的 `cordis.patch.yml` 层与 `dsh.client` 声明挂载。卸载：`npx @deepseek-ai/dsh plugin --profile web remove @borisshaw6/dsh-cyber-pet`，然后重启 profile。

在包发布到 npm 之前，可以先装本地构建的 tarball：

```sh
cd dsh-cyber-pet-bundle && npm install && npm pack
npx @deepseek-ai/dsh plugin --profile web add ./borisshaw6-dsh-cyber-pet-0.1.0.tgz
```

### 方式 B — 源码 checkout 安装（开发者）

前置条件：Node.js ≥ 22.19、Git、pnpm（`corepack enable`）。已在 harness `0.1.0-rc.5` 上验证。

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
git clone https://github.com/BorisShaw6/dsh-cyber-pet.git
cd dsh-cyber-pet && ./install.sh ../deepseek-harness
cd ../deepseek-harness && pnpm dsh web     # 打开 http://127.0.0.1:3080
```

或者让安装脚本帮你拉取 harness：

```sh
git clone https://github.com/BorisShaw6/dsh-cyber-pet.git && cd dsh-cyber-pet && ./install.sh --quick
```

未指定 checkout 时，安装脚本会克隆 harness `0.1.0-rc.5`（固定 tag），随后拷贝两个包、注册 4 处配置、安装并构建。脚本幂等、可重复执行；可选参数：`--force`（覆盖已有插件文件）、`--skip-deps`、`--skip-build`。

完整的手动步骤（拷贝两个包、编辑四处文件、构建）、使用指南与常见问题见 [ui-pet/README.zh.md](ui-pet/README.zh.md)。

卸载：

```sh
./uninstall.sh /path/to/deepseek-harness --purge
```

## 功能一览

- 🐋 **两种造型** — 像素风与拟物风；**七个预设色 + 自由取色器**（默认小黄鲸）
- 🧭 **行为模式** — 活跃 / 静候 / 睡眠，右键快捷菜单或设置里切换
- 🏊 **自动巡游** — 游速 = 实时 token 消耗速度 × 你的速度比，活动范围随你设定
- 📊 **玻璃拟态面板** — 概览 / 聊天 / 设置三个标签页；卡片矩阵可自定义（显示 / 大小 / 顺序），额度条、上下文占用、上一轮消耗、消耗速度
- 🎛️ **鲸鱼下方的悬浮条** — 点击在 额度 → 上下文 → 轮次 之间切换
- 💬 **和鲸鱼聊天** — 本地宝贝（规则大脑、零请求）、在线宝贝（你配置的任意 OpenAI 兼容接口）、宿主宝贝（宿主侧 `petChat` Remote，凭据留在宿主——需要 `DEEPSEEK_API_KEY`）
- 🌱 **成长系统** — 幼鲸 → 少年鲸 → 成年鲸 → 金冠鲸（满级戴皇冠）
- 😊 **情绪系统** — 开心 / 专注 / 焦虑（额度不足 10%）/ 困倦
- 🎉 **里程碑与日报** — 每 1 万 tokens 庆祝一次；首次加载播报"昨天你烧了 X tokens"
- 🍱 **投喂** — 把 🪙 小鱼干拖到鲸鱼身上
- ⏸️ **休息提醒** — 连续 N 轮后打盹 3 分钟
- 📸 **报告卡** — 一键导出带鲸鱼和你的数据的 PNG
- 🔊 **轻柔音效**（可关闭），🌍 中 / 英界面切换

全部计数与偏好持久化在浏览器 `localStorage`（`dsh.cyber-pet.v3`）。

## 目录结构

```
dsh-cyber-pet/
├── install.sh            # 一键源码安装脚本（方式 B）
├── uninstall.sh          # 一键卸载脚本
├── scripts/
│   └── patch-files.mjs   # 幂等注册引擎（应用/回滚）
├── dsh-cyber-pet-bundle/ # dsh-plugin bundle 包（方式 A，可发 npm）
├── docs/                 # 画廊素材（截图 + 动画 SVG 演示）
├── ui-pet/               # → packages/client/ui-pet   （浏览器鲸鱼表面）
└── pet-chat/             # → packages/feedback/pet-chat（宿主聊天 Remote）
```

安装脚本会把 `ui-pet/` 与 `pet-chat/` 拷入 harness 工作区，并写入四处注册行（`tsconfig.host.json`、`tsconfig.client.json`、`packages/bundle/web-app/package.json`、`packages/bundle/web-app/cordis.patch.yml`）。完整的手动安装步骤、使用指南与常见问题见 [ui-pet/README.zh.md](ui-pet/README.zh.md)。

## 注意事项

- DeepSeek Harness 处于开发者预览阶段，版本间接口会变——方式 A 的 peers 钉在 `0.1.0-rc.6`；方式 B 钉住 harness checkout `0.1.0-rc.5`（`--quick` 克隆这个精确 tag）。
- 方式 A 与方式 B 不要在同一份 harness 安装上混用——二选一。`dsh plugin add` 面向 harness ≥ `0.1.0-rc.6`；源码安装器面向 `0.1.0-rc.5`。

## 写在最后

满心期待与欣喜中，DeepSeek Harness 终于正式面世。身处奔涌向前的 AI 浪潮里，我们每个开发者都是这个时代的亲历者。作为后端工程师，日常工作里我们或是循着 Spec 文档推进需求，或是在各类驱动规范与开发标准的框架中打磨业务逻辑；AI 工具的飞速迭代在提效的同时，也无形中增添了追赶的压力，仿佛脚步稍慢，就会落在时代身后。

技术更迭不休，但心底对代码的那份热忱始终未变，想来既感慨又奇妙。我平日多在 GitLab 处理业务需求，GitHub 虽常登录，却很少能卸下包袱在其中畅玩，折腾些纯粹出于热爱的个人项目。

周六清晨随手翻逛，翻到自己多年前上传的数据结构实践作业——其中还有用二叉树实现的迷宫小游戏。以今日眼光回看，写法稚嫩，却盛满了当年纯粹敲代码的快乐。借着 DeepSeek Harness 发布的契机，我萌生了一个念头：想为 Harness 生态贡献一份自己微薄的力量。

我本身是纯后端开发，从未接触过前端技术，便全程依托 Qoder 完成了这个小宠物的开发。它体量很小，代码也远称不上完美，或许还藏着未被发现的 bug，算不上什么有技术分量的产出。但我仍希望这个小东西，能在 Harness 生态里发挥一点属于它的作用，也能给奔波在业务与规范中的同行们，带去一点技术之外的松弛。

在所有人都被时代推着加速奔跑的当下，规范与压力常伴左右。但我始终觉得，埋头 coding 的间隙，也该留一点碎片化的休闲时刻。愿这个小小的赛博宠物，能给你紧绷的开发日常，添上片刻无关 KPI、无关规范的纯粹快乐。

**你好，朋友们。**

## 许可证

MIT — 与 DeepSeek Harness 一致。
