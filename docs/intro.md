# dsh-cyber-pet 是什么

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的一只赛博鲸鱼宠物：悬浮在 Web UI 里游动，实时播报你的 token 消耗，可以投喂、换色、陪它聊天。

一行安装（harness ≥ 0.1.0-rc.6）：

```sh
npx @deepseek-ai/dsh plugin --profile web add @borisshaw6/dsh-cyber-pet
```

## 解决什么问题

跑 Agent 时，token 消耗是"看不见"的——你不知道这轮花了多少、额度还剩多少、上下文占了多满，往往等到额度告警或上下文爆掉才反应过来。

这只鲸鱼把仪表盘变成了一只宠物：

- **消耗可视化**：每轮对话结束，鲸鱼用气泡播报本轮花费与剩余额度；额度条、上下文占用、消耗速度实时可见。额度不足 10% 时它会焦虑，烧得快时它游得快。
- **零打扰**：不需要打开任何监控页，它就游在你的工作界面角落，瞥一眼即可。
- **有粘性**：鲸鱼会成长（幼鲸 → 金冠鲸）、有情绪、每 1 万 tokens 庆祝一次——把枯燥的成本管理变成一件愿意持续看的事。

## 主要能力

| 能力 | 说明 |
|---|---|
| 📊 实时播报 | tokens / 额度 / 上下文占用 / 轮次 / 对话数，每轮气泡播报消耗 |
| 🎨 外观 | 像素风 / 拟物风两套皮肤，7 个预设色 + 自由取色器 |
| 💬 聊天 | 本地规则大脑（零请求）、任意 OpenAI 兼容接口、宿主侧 Remote（凭据不出宿主）三选一 |
| 🌱 成长 | 4 级成长系统、情绪引擎、里程碑庆祝、首次加载昨日摘要 |
| 🍱 互动 | 拖拽投喂、右键切换行为模式、自动巡游、轻柔音效 |
| 📸 报告卡 | 一键导出带鲸鱼和你的数据的 PNG |

## 技术形态

一个 dsh-plugin bundle（`@borisshaw6/dsh-cyber-pet`），同时携带宿主侧 `petChat` Remote 与浏览器表面，通过 `dsh.bundle` + `dsh.client` 挂载——不改 harness 源码、无需重新构建。所有计数与偏好持久化在浏览器 `localStorage`，升级不丢。

- 仓库：https://github.com/BorisShaw6/dsh-cyber-pet
- 在线演示（不装也能玩）：https://borisshaw6.github.io/dsh-cyber-pet/demo/
- 协议：MIT（与 DeepSeek Harness 一致）
