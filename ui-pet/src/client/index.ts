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
 * the optional host-side petChat Remote probe for the harness chat backend.
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

/** Required services: slots, sessions feed, copy, and the Remote namespace (the petChat probe). */
export const inject = ['slots', 'sessions', 'locale', 'remote']

/** The generated petChat Remote face this plugin probes for (absent deployments fall back). */
interface PetChatRemoteFace {
  ask(request: {
    provider: string
    model: string
    history: readonly { role: 'user' | 'assistant'; content: string }[]
  }): Promise<{ ok: true; value: { reply: string } } | { ok: false; error: { code: string; message: string } }>
}

/**
 * Client plugin body: the CyberWhale shell.overlay entry with its tracker.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-pet: dictionaries')

  ctx.slots.inject('shell.overlay', () => {
    const tracker = new CyberPetTracker(ctx.sessions)
    tracker.start()

    // Harness chat backend probe: the host-side petChat Remote when this
    // deployment mounts it; absent rows degrade to the browser-direct online
    // backend instead of faulting the pet fiber.
    const petChat = (ctx.remote as unknown as Record<string, unknown>).petChat as PetChatRemoteFace | undefined
    const askHarness = async (history: readonly ChatTurn[]): Promise<string> => {
      if (petChat === undefined || typeof petChat.ask !== 'function') {
        throw new Error('pet-chat-unavailable')
      }
      const settings = tracker.getSnapshot().chat
      const result = await petChat.ask({
        provider: 'deepseek-official',
        model: settings.model === '' ? 'deepseek-chat' : settings.model,
        history: history
          .filter((turn): turn is ChatTurn & { role: 'user' | 'assistant' } => turn.role !== 'system')
          .map(turn => ({ role: turn.role, content: turn.content })),
      })
      if (!result.ok) throw new Error(result.error.message)
      return result.value.reply
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
