# @deepseek-ai/dsh-pet-chat

English | [中文](README.zh.md)

Host-side one-shot pet chat Remote. The cyber whale's online brain: the browser pet sends the recent chat turns through the generated `petChat.ask` endpoint, and the service issues ONE standalone provider request through the `ctx.llm` seam with a fixed whale persona — outside every agent session, so nothing here touches session logs, agent context, or durable history. Credentials stay on the host side (the configured provider's credential seam), so no API key lives in the browser. The reply returns with its one-shot token accounting; business failures (`missing-provider`, `missing-model`, `empty-history`, `empty-reply`, provider `error`/`aborted`, and `pet-chat-failed`) reach the pet panel verbatim.

This package is the optional host half of the cyber whale plugin; see the `ui-pet` README's **Install into DeepSeek Harness** section for the complete step-by-step installation guide (copy this directory to `packages/feedback/pet-chat`, register the tsconfig/web-app/cordis.patch lines, build, run).

## Model Experience

None, as the service issues caller-initiated one-shot provider requests outside any agent session and contributes nothing to session model context.

#### KV Cache effect

Independent: each `ask` sends its own standalone request with the service-owned persona prefix; it neither extends nor invalidates any session provider cache.

## Known Limitations and Deferred Work

- **Single provider request shape** — `ask` is one-shot text-in/text-out; streaming replies, tool use, and multi-turn provider-side memory are deferred.
