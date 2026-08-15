/**
 * Host-side one-shot pet chat Remote. The cyber whale's online brain: the
 * browser pet sends the recent chat turns, and this service issues ONE
 * standalone provider request through the llm seam with a fixed whale
 * persona — outside every agent session, so nothing here touches session
 * logs, agent context, or history. Credentials stay on the host side
 * (the configured provider's credential seam), so no API key lives in the
 * browser.
 * @module @deepseek-ai/dsh-pet-chat
 */

import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import {
  createAssistantMessage, createUserMessage,
} from '@deepseek-ai/dsh-llm'
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'
import type {
  PetChatAskRequest, PetChatAskResult,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    petChat: PetChatService
  }
}

/** The whale's on-wire persona. */
const PERSONA = 'You are a cute cyber whale pet living inside DeepSeek Harness. '
  + 'You speak briefly (1-2 short sentences), warmly and playfully, about tokens, quota, and swimming. '
  + 'Reply in the same language the user writes in.'

/** History tail bound kept per ask. */
const MAX_TURNS = 8
/** Reply length cap for the one-shot request. */
const MAX_REPLY_TOKENS = 220

/** One text block for a wire turn. */
function textBlock(text: string): ContentBlock {
  return { type: 'text', text } as ContentBlock
}

/**
 * The petChat Remote service: one `ask` method issuing one standalone
 * provider request per call.
 */
export class PetChatService extends TypertRemoteService {
  static inject = ['llm']

  /** @param ctx - Host context carrying the llm registry. */
  constructor(ctx: Context) {
    super(ctx, 'petChat')
  }

  /**
   * Answer one pet chat exchange with a standalone provider request.
   * @param request - provider route, model, and the recent turn tail.
   * @returns the whale reply with its token accounting, or a business failure.
   */
  @Remote('ask')
  async ask(request: PetChatAskRequest): Promise<PetChatAskResult> {
    if (typeof request.provider !== 'string' || request.provider.trim() === '') {
      return { ok: false, error: { code: 'missing-provider', message: 'a provider route is required' } }
    }
    if (typeof request.model !== 'string' || request.model.trim() === '') {
      return { ok: false, error: { code: 'missing-model', message: 'a model id is required' } }
    }
    if (!Array.isArray(request.history) || request.history.length === 0) {
      return { ok: false, error: { code: 'empty-history', message: 'nothing to answer' } }
    }
    try {
      const messages: Message[] = request.history.slice(-MAX_TURNS).map((turn): Message => {
        if (turn.role === 'assistant') {
          return createAssistantMessage({
            content: [textBlock(turn.content)],
            source: { provider: request.provider, model: request.model },
          })
        }
        return createUserMessage({
          content: [textBlock(turn.content)],
          source: { kind: 'user' },
        })
      })
      let reply = ''
      let inputTokens = 0
      let outputTokens = 0
      for await (const chunk of this.ctx.llm.stream({
        provider: request.provider,
        model: request.model,
        messages,
        system: PERSONA,
        maxTokens: MAX_REPLY_TOKENS,
      })) {
        if (chunk.type === 'text-delta') {
          reply += chunk.text
        }
        else if (chunk.type === 'usage') {
          inputTokens += chunk.usage.inputTokens + (chunk.usage.cacheReadTokens ?? 0) + (chunk.usage.cacheWriteTokens ?? 0)
          outputTokens += chunk.usage.outputTokens
        }
        else if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
          const failure = 'failure' in chunk.reason ? chunk.reason.failure : undefined
          return {
            ok: false,
            error: {
              code: chunk.reason.kind,
              message: typeof failure === 'object' && failure !== null && 'message' in failure
                ? String((failure as { message: unknown }).message)
                : chunk.reason.kind,
            },
          }
        }
      }
      const trimmed = reply.trim()
      if (trimmed === '') {
        return { ok: false, error: { code: 'empty-reply', message: 'the model returned no text' } }
      }
      return { ok: true, value: { reply: trimmed, inputTokens, outputTokens } }
    }
    catch (error) {
      return {
        ok: false,
        error: {
          code: 'pet-chat-failed',
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }
}

export default PetChatService
