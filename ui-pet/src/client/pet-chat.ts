/**
 * The online pet brain: one-shot chat completion against any
 * OpenAI-compatible endpoint the user configures (base URL + key + model).
 * The call runs straight from the browser; the key never leaves localStorage
 * and the request itself. Pure fetch wrapper — the panel owns message state.
 */

/** One chat turn as the wire protocol sees it. */
export interface ChatTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** The whale's on-wire persona for online replies. */
const PERSONA = 'You are a cute cyber whale pet living inside DeepSeek Harness. '
  + 'You speak briefly (1-2 short sentences), warmly and playfully, about tokens, quota, and swimming. '
  + 'Reply in the same language the user writes in.'

/** Online endpoint settings the wrapper needs. */
export interface OnlineChatConfig {
  baseUrl: string
  apiKey: string
  model: string
}

/**
 * Ask the configured endpoint for one whale reply.
 * @param config - endpoint, key, and model.
 * @param history - recent turns, oldest first (system persona is prepended).
 * @param signal - cancellation when the panel closes mid-flight.
 * @returns the assistant reply text.
 * @throws Error with a user-displayable message on any failure.
 */
export async function onlineReply(
  config: OnlineChatConfig,
  history: readonly ChatTurn[],
  signal?: AbortSignal,
): Promise<string> {
  if (config.baseUrl === '') throw new Error('missing-base-url')
  if (config.model === '') throw new Error('missing-model')
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    ...signal === undefined ? {} : { signal },
    headers: {
      'content-type': 'application/json',
      ...config.apiKey === '' ? {} : { authorization: `Bearer ${config.apiKey}` },
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      max_tokens: 220,
      messages: [
        { role: 'system', content: PERSONA },
        ...history.slice(-8).map(turn => ({ role: turn.role, content: turn.content })),
      ],
    }),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)}`)
  }
  const payload = await response.json() as {
    choices?: readonly { message?: { content?: unknown } }[]
  }
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '') throw new Error('empty-reply')
  return content.trim()
}
