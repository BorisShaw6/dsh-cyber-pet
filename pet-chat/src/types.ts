/**
 * Wire types crossing the petChat Remote boundary. Typert requires Remote
 * request/result types on a public non-root type subpath (`./types`), so the
 * service and the generated client both import them from here.
 */

/** One chat turn as it crosses the wire. */
export interface PetChatTurn {
  /** Turn role ('system' turns are rejected — the persona is service-owned). */
  role: 'user' | 'assistant'
  /** Turn text. */
  content: string
}

/** One ask request: endpoint selection plus the recent history tail. */
export interface PetChatAskRequest {
  /** Registered llm provider route (e.g. the DeepSeek official route). */
  provider: string
  /** Model id the route serves. */
  model: string
  /** Recent turns, oldest first; the service keeps only the tail. */
  history: PetChatTurn[]
}

/** Successful ask value. */
export interface PetChatAskValue {
  /** The whale's reply text. */
  reply: string
  /** Billed input tokens of the one-shot request. */
  inputTokens: number
  /** Generated output tokens of the one-shot request. */
  outputTokens: number
}

/** Business failure carried verbatim to the pet panel. */
export interface PetChatFailure {
  /** Failure code. */
  code: string
  /** Human-displayable message. */
  message: string
}

/** Settled ask outcome. */
export type PetChatAskResult =
  | { ok: true; value: PetChatAskValue }
  | { ok: false; error: PetChatFailure }
