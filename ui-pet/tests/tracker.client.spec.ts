/**
 * CyberPetTracker unit semantics: folding conversation snapshots into
 * session/lifetime counters, monotonic persistence, turn-boundary pricing,
 * settings mutations, and defensive storage handling. The fake sessions face
 * drives list and session observables by hand; the storage double inspects
 * the persisted record.
 */
import { describe, expect, it } from 'vitest'
import {
  CyberPetTracker, DEFAULT_QUOTA, usageTokens, type PetStats,
} from '../src/client/tracker.ts'
import { formatTokens, quotaRatio } from '../src/client/display.ts'

/** Minimal conversation snapshot the tracker reads. */
function conversation(nodes: unknown[], running = false): never {
  return { nodes, running } as never
}

function userNode(): never {
  return { kind: 'user', seq: 1 } as never
}

function assistantNode(input: number, output: number, extra: Record<string, number> = {}): never {
  return { kind: 'assistant', seq: 2, usage: { inputTokens: input, outputTokens: output, ...extra } } as never
}

/** In-memory localStorage double exposing the raw record. */
function makeStorage(initial?: string) {
  let value: string | null = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next },
    raw: () => value,
  }
}

/** Fake sessions face: one mutable list snapshot plus per-session fakes. */
function makeSessions() {
  const listListeners = new Set<() => void>()
  const list = {
    ids: [] as string[],
    byId: {} as Record<string, { blank: boolean }>,
    current: undefined as string | undefined,
  }
  const sessions = new Map<string, { nodes: unknown[]; running: boolean; listeners: Set<() => void> }>()
  const face = {
    list: {
      getSnapshot: () => list,
      subscribe: (fn: () => void) => {
        listListeners.add(fn)
        return () => { listListeners.delete(fn) }
      },
    },
    binding: (id: string) => {
      const session = sessions.get(id)
      if (session === undefined) return undefined
      return {
        sessionId: id,
        session: {
          getSnapshot: () => conversation(session.nodes, session.running),
          subscribe: (fn: () => void) => {
            session.listeners.add(fn)
            return () => { session.listeners.delete(fn) }
          },
        },
      }
    },
  } as never
  return {
    face,
    setList(ids: string[], current: string | undefined, blank: string[] = []) {
      list.ids = ids
      list.byId = Object.fromEntries(ids.map(id => [id, { blank: blank.includes(id) }]))
      list.current = current
      for (const fn of listListeners) fn()
    },
    addSession(id: string, nodes: unknown[] = [], running = false) {
      sessions.set(id, { nodes, running, listeners: new Set() })
    },
    setConversation(id: string, nodes: unknown[], running = false) {
      const session = sessions.get(id)
      if (session === undefined) throw new Error(`unknown session ${id}`)
      session.nodes = nodes
      session.running = running
      for (const fn of session.listeners) fn()
    },
  }
}

function makeTracker(options: { storage?: ReturnType<typeof makeStorage>; sessions?: ReturnType<typeof makeSessions> } = {}) {
  const harness = options.sessions ?? makeSessions()
  const tracker = new CyberPetTracker(harness.face, options.storage ?? makeStorage())
  tracker.start()
  return { harness, tracker }
}

describe('usageTokens', () => {
  it('sums the four disjoint billing axes and ignores malformed fields', () => {
    expect(usageTokens({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 2 })).toBe(20)
    expect(usageTokens({ inputTokens: 'x', outputTokens: -4 })).toBe(0)
    expect(usageTokens(null)).toBe(0)
    expect(usageTokens(undefined)).toBe(0)
  })
})

describe('display helpers', () => {
  it('formats counts compactly', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(12345)).toBe('12.3k')
    expect(formatTokens(12000)).toBe('12k')
    expect(formatTokens(1_500_000)).toBe('1.5M')
    expect(formatTokens(-5)).toBe('0')
  })

  it('clamps the quota ratio', () => {
    expect(quotaRatio(50, 100)).toBe(0.5)
    expect(quotaRatio(200, 100)).toBe(1)
    expect(quotaRatio(10, 0)).toBe(1)
    expect(quotaRatio(-1, 100)).toBe(0)
  })
})

describe('CyberPetTracker', () => {
  it('publishes defaults before any session exists', () => {
    const { tracker } = makeTracker()
    const stats = tracker.getSnapshot()
    expect(stats.quota).toBe(DEFAULT_QUOTA)
    expect(stats.skin).toBe('pixel')
    expect(stats.totalTokens).toBe(0)
    expect(stats.remaining).toBe(DEFAULT_QUOTA)
    expect(stats.sessionCount).toBe(0)
    tracker.dispose()
  })

  it('counts sessions excluding blank rows and folds the current conversation', () => {
    const { harness, tracker } = makeTracker()
    harness.addSession('s1', [userNode(), assistantNode(10, 4)], false)
    harness.addSession('s2')
    harness.setList(['s1', 's2', 's3'], 's1', ['s3'])
    const stats = tracker.getSnapshot()
    expect(stats.sessionCount).toBe(2)
    expect(stats.sessionId).toBe('s1')
    expect(stats.sessionTokens).toBe(14)
    expect(stats.sessionTurns).toBe(1)
    expect(stats.totalTokens).toBe(14)
    expect(stats.totalTurns).toBe(1)
    tracker.dispose()
  })

  it('prices a completed turn on the running→idle boundary', () => {
    const { harness, tracker } = makeTracker()
    harness.addSession('s1', [userNode()], false)
    harness.setList(['s1'], 's1')
    expect(tracker.getSnapshot().lastTurnTokens).toBeNull()

    // Turn starts: the admitted user message flips the session to running.
    harness.setConversation('s1', [userNode()], true)
    // Mid-turn: an assistant message lands while running.
    harness.setConversation('s1', [userNode(), assistantNode(20, 10)], true)
    // Turn completes: a second message lands and the session idles.
    harness.setConversation('s1', [userNode(), assistantNode(20, 10), assistantNode(5, 2)], false)

    const stats = tracker.getSnapshot()
    expect(stats.lastTurnTokens).toBe(37)
    expect(stats.lastTurnRevision).toBe(1)
    expect(stats.running).toBe(false)
    // Two samples (30, 37) inside the minimum 5s window: 7 tokens * 12.
    expect(stats.tokenRate).toBe(84)
    tracker.dispose()
  })

  it('keeps lifetime counters monotonic across a shrinking window and session switch', () => {
    const { harness, tracker } = makeTracker()
    harness.addSession('s1', [userNode(), assistantNode(50, 50)], false)
    harness.addSession('s2', [userNode(), assistantNode(10, 5)], false)
    harness.setList(['s1', 's2'], 's1')
    expect(tracker.getSnapshot().totalTokens).toBe(100)

    // Window truncation shrinks the visible fold; the lifetime stays.
    harness.setConversation('s1', [assistantNode(20, 0)], false)
    expect(tracker.getSnapshot().totalTokens).toBe(100)
    expect(tracker.getSnapshot().sessionTokens).toBe(20)

    harness.setList(['s1', 's2'], 's2')
    const stats = tracker.getSnapshot()
    expect(stats.sessionTokens).toBe(15)
    expect(stats.totalTokens).toBe(115)
    expect(stats.totalTurns).toBe(2)
    tracker.dispose()
  })

  it('persists settings and totals and reloads them', () => {
    const storage = makeStorage()
    const harness = makeSessions()
    harness.addSession('s1', [userNode(), assistantNode(30, 10)], false)
    const first = new CyberPetTracker(harness.face, storage)
    first.start()
    harness.setList(['s1'], 's1')
    first.setQuota(5000)
    first.setSkin('skeuo')
    first.setMuted(true)
    first.setPosition({ x: 12.4, y: 99.6 })
    first.dispose()

    const second = new CyberPetTracker(harness.face, storage)
    second.start()
    harness.setList(['s1'], 's1')
    const stats = second.getSnapshot()
    expect(stats.quota).toBe(5000)
    expect(stats.skin).toBe('skeuo')
    expect(stats.muted).toBe(true)
    expect(stats.position).toEqual({ x: 12, y: 100 })
    expect(stats.totalTokens).toBe(40)
    expect(stats.remaining).toBe(4960)
    second.dispose()
  })

  it('ignores corrupt storage and rejects invalid quota values', () => {
    const storage = makeStorage('{ not json')
    const harness = makeSessions()
    const tracker = new CyberPetTracker(harness.face, storage)
    tracker.start()
    expect(tracker.getSnapshot().quota).toBe(DEFAULT_QUOTA)
    tracker.setQuota(Number.NaN)
    tracker.setQuota(0)
    expect(tracker.getSnapshot().quota).toBe(DEFAULT_QUOTA)
    tracker.dispose()
  })

  it('resetTotals clears lifetime counters but keeps settings', () => {
    const { harness, tracker } = makeTracker()
    harness.addSession('s1', [userNode(), assistantNode(30, 10)], false)
    harness.setList(['s1'], 's1')
    tracker.setQuota(777)
    tracker.resetTotals()
    const stats = tracker.getSnapshot()
    expect(stats.totalTokens).toBe(0)
    expect(stats.totalTurns).toBe(0)
    expect(stats.quota).toBe(777)
    tracker.dispose()
  })

  it('notifies on real changes only and detaches on dispose', () => {
    const { harness, tracker } = makeTracker()
    let count = 0
    const off = tracker.subscribe(() => { count += 1 })
    harness.addSession('s1', [userNode()], false)
    harness.setList(['s1'], 's1')
    const after = count
    expect(after).toBeGreaterThan(0)
    // Same fold again: no new notification (identical snapshot).
    harness.setConversation('s1', [userNode()], false)
    expect(count).toBe(after)
    off()
    tracker.dispose()
    harness.setConversation('s1', [userNode(), assistantNode(1, 1)], false)
    expect(count).toBe(after)
  })

  it('snapshot identity stays stable between changes', () => {
    const { tracker } = makeTracker()
    const before: PetStats = tracker.getSnapshot()
    tracker.setSkin('pixel')
    expect(tracker.getSnapshot()).toBe(before)
    tracker.dispose()
  })
})

describe('CyberPetTracker v3 life settings', () => {
  it('publishes the v3 defaults', () => {
    const { tracker } = makeTracker()
    const stats = tracker.getSnapshot()
    expect(stats.mode).toBe('active')
    expect(stats.name).toBe('小深')
    expect(stats.badgeMetric).toBe('quota')
    expect(stats.sound).toBe(true)
    expect(stats.restEvery).toBe(8)
    expect(stats.fedCount).toBe(0)
    expect(stats.cards.length).toBeGreaterThan(6)
    expect(stats.contextTokens).toBe(0)
    tracker.dispose()
  })

  it('switches modes, names, and the badge metric cycle', () => {
    const { tracker } = makeTracker()
    tracker.setMode('sleep')
    expect(tracker.getSnapshot().mode).toBe('sleep')
    expect(tracker.getSnapshot().muted).toBe(true)
    tracker.setMode('active')
    tracker.setName('  鲸鲸  ')
    expect(tracker.getSnapshot().name).toBe('鲸鲸')
    tracker.setName('')
    expect(tracker.getSnapshot().name).toBe('小深')
    tracker.cycleBadgeMetric()
    expect(tracker.getSnapshot().badgeMetric).toBe('context')
    tracker.cycleBadgeMetric()
    tracker.cycleBadgeMetric()
    expect(tracker.getSnapshot().badgeMetric).toBe('quota')
    tracker.dispose()
  })

  it('folds the latest assistant prompt size into context occupancy', () => {
    const { harness, tracker } = makeTracker()
    harness.addSession('s1', [userNode(), assistantNode(400, 20, { cacheReadTokens: 1600 })], false)
    harness.setList(['s1'], 's1')
    expect(tracker.getSnapshot().contextTokens).toBe(2000)
    tracker.dispose()
  })

  it('counts feedings and sanitizes card layouts', () => {
    const { tracker } = makeTracker()
    expect(tracker.feed()).toBe(1)
    expect(tracker.feed()).toBe(2)
    expect(tracker.getSnapshot().fedCount).toBe(2)
    tracker.setCards([
      { id: 'totalTokens', size: 'l', visible: true },
      { id: 'bogus', size: 's', visible: true },
      { id: 'totalTokens', size: 's', visible: true },
      { id: 'rate', size: 'x', visible: false } as never,
    ])
    const cards = tracker.getSnapshot().cards
    expect(cards.map(card => card.id)).toEqual(['totalTokens', 'rate'])
    expect((cards[1] as { size: string }).size).toBe('m')
    tracker.dispose()
  })

  it('celebrates a milestone grid crossing once', () => {
    const { harness, tracker } = makeTracker()
    harness.addSession('s1', [userNode()], false)
    harness.setList(['s1'], 's1')
    harness.setConversation('s1', [userNode(), assistantNode(8000, 1)], false)
    expect(tracker.getSnapshot().milestoneRevision).toBe(0)
    harness.setConversation('s1', [userNode(), assistantNode(10_001, 1)], false)
    expect(tracker.getSnapshot().milestoneRevision).toBe(1)
    expect(tracker.getSnapshot().milestoneTotal).toBe(10_000)
    harness.setConversation('s1', [userNode(), assistantNode(10_500, 1)], false)
    expect(tracker.getSnapshot().milestoneRevision).toBe(1)
    tracker.dispose()
  })

  it('fires the rest reminder on the turn grid and naps until wake', () => {
    const { harness, tracker } = makeTracker()
    tracker.setRestEvery(2)
    const nodes = [userNode(), assistantNode(5, 5)]
    harness.addSession('s1', nodes, false)
    harness.setList(['s1'], 's1')
    // One completed turn: not on the grid yet.
    harness.setConversation('s1', nodes, true)
    harness.setConversation('s1', nodes, false)
    expect(tracker.getSnapshot().restRevision).toBe(0)
    // A second user message completes turn two: the grid fires.
    harness.setConversation('s1', [...nodes, userNode(), assistantNode(5, 5)], true)
    harness.setConversation('s1', [...nodes, userNode(), assistantNode(5, 5)], false)
    expect(tracker.getSnapshot().restRevision).toBe(1)
    tracker.startNap()
    expect(tracker.getSnapshot().napUntil).toBeGreaterThan(Date.now())
    tracker.wakeUp()
    expect(tracker.getSnapshot().napUntil).toBe(0)
    tracker.dispose()
  })
})
