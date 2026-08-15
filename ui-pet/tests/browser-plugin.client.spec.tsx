// @vitest-environment jsdom
/**
 * ui-pet browser half on a real cordis Context with fake slots/sessions
 * faces: the plugin registers the pet entry into shell.overlay with its
 * locale namespace, the inject face carries the tracker observable in the
 * hooks compartment plus the five mutation verbs wired to it, verbs mutate
 * the published snapshot, and registration disposal rides the plugin fiber
 * (HMR safety). The node half is an inert loader seat.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import type { PetStats } from '../src/client/tracker.ts'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

const sid = (k: string): SessionId => k as SessionId

/** Fake sessions face with a hand-driven list and one scripted session. */
function makeSessions() {
  const listListeners = new Set<() => void>()
  const sessionListeners = new Set<() => void>()
  const list = {
    ids: [] as string[],
    byId: {} as Record<string, { blank: boolean }>,
    current: undefined as string | undefined,
  }
  let nodes: unknown[] = []
  let running = false
  return {
    face: {
      list: {
        getSnapshot: () => list,
        subscribe: (fn: () => void) => {
          listListeners.add(fn)
          return () => { listListeners.delete(fn) }
        },
      },
      binding: (id: SessionId) => ({
        sessionId: id,
        session: {
          getSnapshot: () => ({ nodes, running }),
          subscribe: (fn: () => void) => {
            sessionListeners.add(fn)
            return () => { sessionListeners.delete(fn) }
          },
        },
        ctx: undefined,
      }),
    } as never,
    setList(ids: string[], current: string | undefined) {
      list.ids = ids
      list.byId = Object.fromEntries(ids.map(value => [value, { blank: false }]))
      list.current = current
      for (const fn of listListeners) fn()
    },
    setConversation(next: unknown[], nextRunning: boolean) {
      nodes = next
      running = nextRunning
      for (const fn of sessionListeners) fn()
    },
  }
}

/** The inject-face shape this suite reads. */
interface PetFace {
  hooks: { petStats: { getSnapshot(): PetStats; subscribe(fn: () => void): () => void } }
  setSkin: (skin: 'pixel' | 'skeuo') => void
  setColor: (color: string) => void
  setView: (view: 'compact' | 'full') => void
  setQuota: (quota: number) => void
  setMuted: (muted: boolean) => void
  setRoam: (roam: { enabled?: boolean; speedRatio?: number; range?: number }) => void
  setChat: (chat: { mode?: 'local' | 'online'; model?: string }) => void
  setPosition: (position: { x: number; y: number }) => void
  resetTotals: () => void
  activeLocale: () => string
  setLocale: (id: string) => void
  setMode: (mode: 'active' | 'standby' | 'sleep') => void
  setName: (name: string) => void
  feed: () => number
  askHarness: (history: readonly { role: string; content: string }[]) => Promise<string>
}

/** Boot the plugin over fake faces. */
async function bench() {
  const sessions = makeSessions()
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root', children: {
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('sessions', sessions.face)
  ctx.provide('remote', {})
  const fiber = ctx.plugin({ inject: [...inject], apply })
  return {
    ctx,
    fiber,
    sessions,
    entry: () => {
      const entry = ctx.slots.entries('shell.overlay')[0]
      if (entry === undefined) return undefined
      return {
        ...entry.options,
        locale: entry.locale,
        inject: entry.inject as unknown as (() => PetFace) | undefined,
      }
    },
  }
}

describe('ui-pet browser plugin', () => {
  it('registers the whale entry into shell.overlay with the pet namespace', async () => {
    const b = await bench()
    await b.fiber.await()
    expect(b.entry()).toMatchObject({ id: 'pet', order: 100, locale: 'pet' })
    expect(b.entry()?.inject).toBeTypeOf('function')
    await b.fiber.dispose()
  })

  it('the inject face carries the stats observable and wired mutation verbs', async () => {
    const b = await bench()
    await b.fiber.await()
    b.sessions.setList(['s1'], 's1')
    b.sessions.setConversation([
      { kind: 'user', seq: 1 },
      { kind: 'assistant', seq: 2, usage: { inputTokens: 30, outputTokens: 12 } },
    ], false)

    const face = b.entry()!.inject!()
    expect(face.hooks.petStats.getSnapshot().sessionTokens).toBe(42)
    expect(face.hooks.petStats.getSnapshot().sessionCount).toBe(1)

    let notified = 0
    const off = face.hooks.petStats.subscribe(() => { notified += 1 })
    face.setSkin('skeuo')
    face.setColor('#4d9fff')
    face.setView('compact')
    face.setQuota(8000)
    face.setMuted(true)
    face.setRoam({ enabled: false, speedRatio: 2, range: 60 })
    face.setChat({ mode: 'online', model: 'deepseek-chat' })
    face.setPosition({ x: 10, y: 20 })
    const stats = face.hooks.petStats.getSnapshot()
    expect(stats.skin).toBe('skeuo')
    expect(stats.color).toBe('#4d9fff')
    expect(stats.view).toBe('compact')
    expect(stats.quota).toBe(8000)
    expect(stats.muted).toBe(true)
    expect(stats.roam).toEqual({ enabled: false, speedRatio: 2, range: 60 })
    expect(stats.chat.mode).toBe('online')
    expect(stats.chat.model).toBe('deepseek-chat')
    expect(stats.position).toEqual({ x: 10, y: 20 })
    expect(notified).toBe(8)
    expect(['zh', 'en']).toContain(face.activeLocale())

    face.setMode('standby')
    expect(face.hooks.petStats.getSnapshot().mode).toBe('standby')
    face.setName('鲸鲸')
    expect(face.hooks.petStats.getSnapshot().name).toBe('鲸鲸')
    expect(face.feed()).toBe(1)
    // No petChat row in this bench: the harness backend degrades to an error.
    await expect(face.askHarness([{ role: 'user', content: 'hi' }])).rejects.toThrow('pet-chat-unavailable')

    face.resetTotals()
    expect(face.hooks.petStats.getSnapshot().totalTokens).toBe(0)
    off()
    await b.fiber.dispose()
  })

  it('tracks a scripted turn boundary through the inject face', async () => {
    const b = await bench()
    await b.fiber.await()
    b.sessions.setList([sid('s1') as unknown as string], 's1')
    b.sessions.setConversation([{ kind: 'user', seq: 1 }], true)
    b.sessions.setConversation([
      { kind: 'user', seq: 1 },
      { kind: 'assistant', seq: 2, usage: { inputTokens: 7, outputTokens: 3 } },
    ], false)
    const stats = b.entry()!.inject!().hooks.petStats.getSnapshot()
    expect(stats.lastTurnTokens).toBe(10)
    expect(stats.lastTurnRevision).toBe(1)
    await b.fiber.dispose()
  })

  it('drops the entry and tracker when the plugin fiber unloads (HMR safety)', async () => {
    const b = await bench()
    await b.fiber.await()
    expect(b.entry()).toBeDefined()
    await b.fiber.dispose()
    expect(b.entry()).toBeUndefined()
  })
})

describe('ui-pet node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
