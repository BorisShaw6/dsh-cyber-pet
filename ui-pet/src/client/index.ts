/**
 * Cyber pet surface plugin, browser half: the CyberWhale entry in the
 * frame-wide `shell.overlay` floating layer. Live stats (session count,
 * per-session and lifetime tokens, interactions, quota, context occupancy,
 * skin, modes, growth) arrive through the registrant-private `hooks`
 * compartment — one CyberPetTracker built in the inject closure folds the
 * sessions list and the current conversation snapshot into a bare observable
 * the renderer binds as `usePetStats`. The inject face carries only the
 * settings mutation verbs plus the harness-chat probe. The tracker persists
 * lifetime counters and preferences to localStorage; the only wire touch is
 * the optional host-side petChat Remote probe for the harness chat backend
 * and the account-balance sync.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-layout SlotMap merge (the shell.overlay seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { CyberPet } from './CyberPet.tsx'
import { CyberPetTracker } from './tracker.ts'
import type { PetActions } from './slots.ts'
import type { ChatTurn } from './pet-chat.ts'
import { en, zh, type PetKey } from './locales.ts'

export type { PetActions } from './slots.ts'
export type { PetKey } from './locales.ts'
export type {
  PetBadgeMetric, PetCardConfig, PetChatMode, PetChatSettings, PetMode,
  PetRoamSettings, PetSkin, PetStats, PetView,
} from './tracker.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The cyber whale's copy. */
    pet: PetKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'pet'

/** Required services: slots, sessions feed, copy, and the web transport (the petChat probe). */
export const inject = ['slots', 'sessions', 'locale', 'connection']

/** Settled petChat outcome as it crosses the wire. */
type PetChatWireResult<V> =
  | { ok: true; value: V }
  | { ok: false; error: { code: string; message: string } }

/** The typed petChat face published by in-tree Remote assemblies (absent out-of-tree). */
interface PetChatRemoteFace {
  ask(request: {
    provider: string
    model: string
    history: readonly { role: 'user' | 'assistant'; content: string }[]
  }): Promise<PetChatWireResult<{ reply: string }>>
  balance?(request: Record<string, never>): Promise<
    PetChatWireResult<{ availableBalance: number; totalBalance: number; currency: string }>
  >
}

/** The web transport's RPC seam (one gateway channel: `/api`). */
interface ConnectionRpcFace {
  rpc: {
    call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<
      { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
    >
  }
}

/** A balance reading younger than this is served from cache, not the wire. */
const BALANCE_TTL_MS = 10 * 60 * 1000

/**
 * Client plugin body: the CyberWhale shell.overlay entry with its tracker.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-pet: dictionaries')

  ctx.slots.inject('shell.overlay', () => {
    const tracker = new CyberPetTracker(ctx.sessions)
    tracker.start()

    // petChat transport: in-tree assemblies publish the typed Remote face on
    // ctx.remote; the npm shell's Remote assembly is frozen to the official
    // remotes, so out-of-tree deployments fall back to the raw gateway RPC.
    // The facade probe is lazy and guarded — the namespace may be absent, or
    // its access gated by the inject-declaration invariant.
    const petChatFace = (): PetChatRemoteFace | undefined => {
      try {
        return (ctx as unknown as { remote?: Record<string, unknown> }).remote?.petChat as
          PetChatRemoteFace | undefined
      }
      catch {
        return undefined
      }
    }
    const callPetChat = async <V>(method: 'ask' | 'balance', request: unknown): Promise<PetChatWireResult<V>> => {
      const face = petChatFace()
      if (face !== undefined && typeof face[method] === 'function') {
        const call = face[method] as (request: never) => Promise<PetChatWireResult<V>>
        return call(request as never)
      }
      const connection = (ctx as unknown as { connection?: ConnectionRpcFace }).connection
      if (connection?.rpc?.call === undefined) throw new Error('pet-chat-unavailable')
      // The host gateway derives the wire field from the service method's
      // literal parameter name; both petChat methods take `request`.
      const wire = await connection.rpc.call('/api', `petChat/${method}`, { args: { request } })
      if (!wire.ok) throw new Error(wire.error.message)
      return wire.value as PetChatWireResult<V>
    }

    const askHarness = async (history: readonly ChatTurn[]): Promise<string> => {
      const settings = tracker.getSnapshot().chat
      const result = await callPetChat<{ reply: string }>('ask', {
        provider: 'deepseek-official',
        model: settings.model === '' ? 'deepseek-chat' : settings.model,
        history: history
          .filter((turn): turn is ChatTurn & { role: 'user' | 'assistant' } => turn.role !== 'system')
          .map(turn => ({ role: turn.role, content: turn.content })),
      })
      if (!result.ok) throw new Error(result.error.message)
      return result.value.reply
    }

    // Account-balance sync: host-side fetch keeps the API key off the
    // browser; a fresh reading short-circuits the wire.
    const fetchBalance = async (): Promise<{ amount: number; currency: string }> => {
      const cached = tracker.getSnapshot().balance
      if (cached !== null && tracker.balanceFresh(BALANCE_TTL_MS)) {
        return { amount: cached.amount, currency: cached.currency }
      }
      const result = await callPetChat<{ availableBalance: number; totalBalance: number; currency: string }>('balance', {})
      if (!result.ok) throw new Error(result.error.message)
      tracker.applyBalance(result.value.availableBalance, result.value.currency)
      return { amount: result.value.availableBalance, currency: result.value.currency }
    }

    const dispose = ctx.slots.register({
      name: 'shell.overlay',
      id: 'pet',
      order: 100,
      locale: NS,
      inject: (): PetActions & { hooks: { petStats: CyberPetTracker } } => ({
        hooks: { petStats: tracker },
        setSkin: skin => tracker.setSkin(skin),
        setColor: color => tracker.setColor(color),
        setView: view => tracker.setView(view),
        setQuota: quota => tracker.setQuota(quota),
        setQuotaSource: source => tracker.setQuotaSource(source),
        setTokensPerUnit: tokensPerUnit => tracker.setTokensPerUnit(tokensPerUnit),
        fetchBalance,
        setBalanceDisplay: display => tracker.setBalanceDisplay(display),
        setThresholds: patch => tracker.setThresholds(patch),
        setPanelSize: size => tracker.setPanelSize(size),
        setMode: mode => tracker.setMode(mode),
        setName: name => tracker.setName(name),
        setBadgeMetric: metric => tracker.setBadgeMetric(metric),
        setCards: cards => tracker.setCards(cards),
        setSound: sound => tracker.setSound(sound),
        setRestEvery: restEvery => tracker.setRestEvery(restEvery),
        startNap: () => tracker.startNap(),
        wakeUp: () => tracker.wakeUp(),
        cycleBadgeMetric: () => tracker.cycleBadgeMetric(),
        feed: () => tracker.feed(),
        askHarness,
        setMuted: muted => tracker.setMuted(muted),
        setRoam: roam => tracker.setRoam(roam),
        setChat: chat => tracker.setChat(chat),
        setPosition: position => tracker.setPosition(position),
        resetTotals: () => tracker.resetTotals(),
        activeLocale: () => ctx.locale.getLocale().active,
        setLocale: id => ctx.locale.setLocale(id),
      }),
    }, CyberPet)
    return () => {
      dispose()
      tracker.dispose()
    }
  })
}
