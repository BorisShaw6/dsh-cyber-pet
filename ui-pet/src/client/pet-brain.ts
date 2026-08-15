/**
 * The local pet brain: rule-based whale replies over the live stats. Pure
 * function — the panel supplies the dictionary translate and the snapshot;
 * nothing here subscribes or mutates. Online replies come from
 * {@link ./pet-chat.ts} instead.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetKey } from './locales.ts'
import type { PetStats } from './tracker.ts'
import { formatTokens } from './display.ts'

/** Fill `{name}` placeholders in one template. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => values[name] ?? '')
}

/** The stat placeholders every stats-aware reply may use. */
function statValues(stats: PetStats): Record<string, string> {
  return {
    session: formatTokens(stats.sessionTokens),
    total: formatTokens(stats.totalTokens),
    remaining: formatTokens(stats.remaining),
    used: formatTokens(stats.used),
    quota: formatTokens(stats.quota),
    turns: String(stats.totalTurns),
    sessions: String(stats.sessionCount),
    rate: String(stats.tokenRate),
  }
}

/**
 * Compose one local reply.
 * @param input - the user's message text.
 * @param stats - current tracker snapshot.
 * @param t - the pet namespace translate seat.
 * @returns the whale's reply text.
 */
export function localReply(input: string, stats: PetStats, t: TranslateNS<'pet'>): string {
  const text = input.trim().toLowerCase()
  const values = statValues(stats)
  const key = (name: PetKey) => fill(t(name), values)

  if (/你好|您好|hi|hello|嗨|哈喽|hey/u.test(text)) return key('reply.greet')
  if (/你是谁|who.*you|什么鲸|名字/u.test(text)) return key('reply.who')
  if (/额度|quota|剩余|remaining|还剩/u.test(text)) return key('reply.quota')
  if (/消耗|token|用量|usage|花了|烧/u.test(text)) return key('reply.usage')
  if (/速度|rate|多快|游/u.test(text)) return key('reply.rate')
  if (/交互|次数|对话|session|conversation|聊/u.test(text)) return key('reply.interactions')
  if (/帮|help|怎么用|做什么|功能/u.test(text)) return key('reply.help')

  // Idle chatter: rotate the fallback lines deterministically by usage so the
  // whale feels alive without a random source that tests cannot pin.
  const fallbacks = ['reply.fallback.1', 'reply.fallback.2', 'reply.fallback.3'] as const
  const pick = fallbacks[(stats.totalTurns + stats.totalTokens) % fallbacks.length] as PetKey
  return key(pick)
}
