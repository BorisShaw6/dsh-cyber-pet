# @deepseek-ai/dsh-pet-chat

[English](README.md) | 中文

宿主侧一次性宠物聊天 Remote。赛博鲸鱼的在线大脑：浏览器宠物把最近的聊天记录通过生成的 `petChat.ask` 端点发上来，服务用固定的鲸鱼人格经由 `ctx.llm` 通道发起一次独立的供应商请求——完全在 agent 会话之外，不碰会话日志、agent 上下文或持久历史。凭据留在宿主侧（配置好的供应商凭据通道），API Key 不会落在浏览器里。回复会附带这次请求的 token 计数；业务失败（`missing-provider`、`missing-model`、`empty-history`、`empty-reply`、供应商 `error`/`aborted`、以及 `pet-chat-failed`）会原样传回宠物面板。

本包是赛博鲸鱼插件的可选宿主半边；完整的逐步安装指南见 `ui-pet` README 的《安装到 DeepSeek Harness》一节（把本目录拷到 `packages/feedback/pet-chat`，注册 tsconfig/web-app/cordis.patch 四处行，构建并运行）。

## Model Experience

None, as the service issues caller-initiated one-shot provider requests outside any agent session and contributes nothing to session model context.

#### KV Cache effect

Independent：每次 `ask` 都带着服务自带的人格前缀发起独立请求；既不扩展也不会使任何会话供应商缓存失效。

## Known Limitations and Deferred Work

- **单一请求形态** — `ask` 是一次性文本进/文本出；流式回复、工具调用与供应商侧多轮记忆留待后续。
