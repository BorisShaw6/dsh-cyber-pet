/**
 * CyberPetTracker: the pet's object-layer data plane. One tracker instance
 * lives in the plugin apply closure and publishes one immutable PetStats
 * snapshot through the bare observable contract (subscribe/getSnapshot), so
 * the renderer binds it as the registrant-private `usePetStats` hook.
 *
 * Feeds: the sessions list store (session count + current selection) and the
 * current session's conversation snapshot (user-message count and assistant
 * token usage). Per-session totals accumulate monotonically into localStorage
 * so the lifetime quota survives reloads and session switches; a recomputed
 * session total never lowers the recorded high-water mark (window truncation
 * or log compaction may shrink the visible fold, never the lifetime spend).
 * A rolling sample window derives the live token burn rate (driving the swim
 * speed); the latest assistant prompt size approximates the live context
 * occupancy. The tracker also owns the pet-life machinery: modes and naps,
 * milestone grid, daily digest, feeding counter, and the overview-card layout.
 */
import type { ConversationSnapshot, ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_COLOR, normalizeColor } from './color.ts'
import { MILESTONE_STEP } from './pet-life.ts'

/** Whale skin choice. */
export type PetSkin = 'pixel' | 'skeuo'
/** Panel density. */
export type PetView = 'compact' | 'full'
/** Chat backend. */
export type PetChatMode = 'local' | 'online' | 'harness'
/** Pet behavior mode (2–4 char labels ride the locale). */
export type PetMode = 'active' | 'standby' | 'sleep'
/** Metric the under-whale badge displays. */
export type PetBadgeMetric = 'quota' | 'context' | 'turns'
/** Overview card size. */
export type PetCardSize = 's' | 'm' | 'l'

/** One overview card's persisted layout cell. */
export interface PetCardConfig {
  /** Counter id (matches the StatCell roster). */
  id: string
  /** Rendered size. */
  size: PetCardSize
  /** Whether the card shows at all. */
  visible: boolean
}

/** Autonomous-swim settings. */
export interface PetRoamSettings {
  enabled: boolean
  /** User speed multiplier (0.5 – 3). */
  speedRatio: number
  /** Roam area as a percentage of the viewport (20 – 100). */
  range: number
}

/** Chat settings (online mode speaks the OpenAI-compatible protocol). */
export interface PetChatSettings {
  mode: PetChatMode
  baseUrl: string
  apiKey: string
  model: string
}

/** The tracker's whole published fact set (immutable per notification). */
export interface PetStats {
  sessionId: SessionId | null
  /** Non-blank sessions in the host list (the visible conversation boxes). */
  sessionCount: number
  /** Whether the current session is running a turn. */
  running: boolean
  /** Tokens folded from the current session's assistant messages. */
  sessionTokens: number
  /** User messages admitted in the current session. */
  sessionTurns: number
  /** Tokens the latest completed turn of the current session consumed. */
  lastTurnTokens: number | null
  /** Monotonic revision so equal consecutive turn costs still retrigger the bubble. */
  lastTurnRevision: number
  /** Lifetime tokens across every session this browser ever tracked. */
  totalTokens: number
  /** Lifetime user interactions across every tracked session. */
  totalTurns: number
  /** Recent token burn rate in tokens/minute (rolling sample window). */
  tokenRate: number
  /** Latest assistant prompt size — the live context-occupancy approximation. */
  contextTokens: number
  /** User-configured lifetime token budget. */
  quota: number
  /** `totalTokens` clamped to the quota for bar display. */
  used: number
  /** Remaining budget (floor 0). */
  remaining: number
  skin: PetSkin
  /** Whale body color (hex). */
  color: string
  view: PetView
  roam: PetRoamSettings
  chat: PetChatSettings
  /** Behavior mode. */
  mode: PetMode
  /** Nap deadline (epoch ms); while in the future the whale sleeps regardless of mode. */
  napUntil: number
  /** Pet display name. */
  name: string
  /** Badge metric selection. */
  badgeMetric: PetBadgeMetric
  /** Overview card layout, render order = array order. */
  cards: readonly PetCardConfig[]
  /** Sound effects toggle. */
  sound: boolean
  /** Consecutive-turn count that triggers the rest reminder. */
  restEvery: number
  /** Rest-reminder revision (bumped when a turn boundary hits the reminder grid). */
  restRevision: number
  /** Lifetime feeding count. */
  fedCount: number
  /** Milestone revision (bumped on every crossed 10k grid line). */
  milestoneRevision: number
  /** The crossed grid line's token value. */
  milestoneTotal: number
  /** Yesterday's burn for the first-load digest; null when nothing to report. */
  digestTokens: number | null
  muted: boolean
  position: { x: number; y: number } | null
}

/** Persisted per-session high-water counters. */
interface SessionRecord {
  tokens: number
  turns: number
}

/** One burn-rate sample. */
interface RateSample {
  time: number
  total: number
}

/** Persisted shape under the localStorage key. */
interface PetPersist {
  quota: number
  skin: PetSkin
  color: string
  view: PetView
  roam: PetRoamSettings
  chat: PetChatSettings
  mode: PetMode
  napUntil: number
  name: string
  badgeMetric: PetBadgeMetric
  cards: PetCardConfig[]
  sound: boolean
  restEvery: number
  fedCount: number
  lastMilestone: number
  daily: { date: string; tokens: number }
  position: { x: number; y: number } | null
  perSession: Record<string, SessionRecord>
}

/** Factory default lifetime token budget (1M tokens). */
export const DEFAULT_QUOTA = 1_000_000
/** Default pet name. */
export const DEFAULT_NAME = '小深'
/** Nap duration the rest reminder schedules (ms). */
export const NAP_DURATION_MS = 180_000
/** Burn-rate samples older than this drop out of the window. */
const RATE_WINDOW_MS = 120_000

const STORAGE_KEY = 'dsh.cyber-pet.v3'

/** Overview card roster, default order. */
export const DEFAULT_CARDS: readonly PetCardConfig[] = [
  { id: 'sessionTokens', size: 'm', visible: true },
  { id: 'totalTokens', size: 'm', visible: true },
  { id: 'lastTurn', size: 'm', visible: true },
  { id: 'rate', size: 'm', visible: true },
  { id: 'context', size: 'm', visible: true },
  { id: 'sessionTurns', size: 'm', visible: true },
  { id: 'totalTurns', size: 'm', visible: true },
  { id: 'sessions', size: 'm', visible: true },
]

/** Valid card ids — anything else drops on sanitize. */
const CARD_IDS = new Set(DEFAULT_CARDS.map(card => card.id))

/**
 * Defensive read of one assistant message's usage record (the node keeps it
 * as `unknown`). Missing or malformed fields count as zero.
 * @param usage - the folded `assistant/message` usage payload.
 * @returns disjoint token sum (uncached input + cache read/write + output).
 */
export function usageTokens(usage: unknown): number {
  if (typeof usage !== 'object' || usage === null) return 0
  const record = usage as Record<string, unknown>
  let total = 0
  for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) total += value
  }
  return total
}

/**
 * The latest request's prompt size — the live context occupancy.
 * @param usage - the folded `assistant/message` usage payload.
 * @returns billed input tokens of that request (context as the model saw it).
 */
export function promptTokens(usage: unknown): number {
  if (typeof usage !== 'object' || usage === null) return 0
  const record = usage as Record<string, unknown>
  let total = 0
  for (const key of ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) total += value
  }
  return total
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/** @param time - epoch ms. @returns the local YYYY-MM-DD key. */
function dayKey(time: number): string {
  const d = new Date(time)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${String(d.getFullYear())}-${month}-${day}`
}

function defaultPersist(): PetPersist {
  return {
    quota: DEFAULT_QUOTA,
    skin: 'pixel',
    color: DEFAULT_COLOR,
    view: 'full',
    roam: { enabled: true, speedRatio: 1, range: 80 },
    chat: { mode: 'local', baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' },
    mode: 'active',
    napUntil: 0,
    name: DEFAULT_NAME,
    badgeMetric: 'quota',
    cards: DEFAULT_CARDS.map(card => ({ ...card })),
    sound: true,
    restEvery: 8,
    fedCount: 0,
    lastMilestone: 0,
    daily: { date: dayKey(Date.now()), tokens: 0 },
    position: null,
    perSession: {},
  }
}

/**
 * The bare-observable pet stats aggregator. Constructed once in apply; call
 * {@link start} to attach the feeds and {@link dispose} on plugin teardown.
 */
export class CyberPetTracker {
  private readonly listeners = new Set<() => void>()
  private readonly perSession = new Map<SessionId, SessionRecord>()
  private readonly rateSamples: RateSample[] = []
  private persist: PetPersist
  private snapshot: PetStats
  private disposeList: (() => void) | undefined
  private disposeSession: (() => void) | undefined
  private current: SessionId | undefined
  private sessionTokens = 0
  private sessionTurns = 0
  private contextTokens = 0
  private turnStartTotal = 0
  private wasRunning = false
  private lastTurnTokens: number | null = null
  private lastTurnRevision = 0
  private restRevision = 0
  private milestoneRevision = 0
  private milestoneTotal = 0
  private digestTokens: number | null = null
  private lastLifetimeTotal = 0
  private started = false

  /**
   * @param sessions - the injected sessions service face.
   * @param storage - optional localStorage-compatible store (tests inject an in-memory double; absence disables persistence).
   */
  constructor(
    private readonly sessions: ISessions,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = defaultStorage(),
  ) {
    this.persist = loadPersist(this.storage)
    for (const [id, record] of Object.entries(this.persist.perSession)) {
      this.perSession.set(id as SessionId, { tokens: record.tokens, turns: record.turns })
    }
    this.lastLifetimeTotal = this.lifetimeTotal()
    this.persist.lastMilestone = Math.min(this.persist.lastMilestone, Math.floor(this.lastLifetimeTotal / MILESTONE_STEP))
    this.computeDigest()
    this.snapshot = this.compose()
  }

  /** First-load daily digest: yesterday's burn when the stored day is yesterday. */
  private computeDigest(): void {
    const now = Date.now()
    const today = dayKey(now)
    const yesterday = dayKey(now - 86_400_000)
    if (this.persist.daily.date !== today) {
      if (this.persist.daily.date === yesterday && this.persist.daily.tokens > 0) {
        this.digestTokens = this.persist.daily.tokens
      }
      this.persist.daily = { date: today, tokens: 0 }
      this.save()
    }
  }

  /** Attach the list and session feeds; idempotent within one lifetime. */
  start(): void {
    if (this.started) return
    this.started = true
    this.disposeList = this.sessions.list.subscribe(() => this.syncList())
    this.syncList()
  }

  /** @param listener - change callback. @returns unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** @returns the current immutable stats snapshot (stable reference between changes). */
  getSnapshot(): PetStats {
    return this.snapshot
  }

  /** @param skin - whale skin to persist. */
  setSkin(skin: PetSkin): void {
    this.persist.skin = skin
    this.commitSettings()
  }

  /** @param color - whale body color (normalized hex). */
  setColor(color: string): void {
    this.persist.color = normalizeColor(color)
    this.commitSettings()
  }

  /** @param view - panel density. */
  setView(view: PetView): void {
    this.persist.view = view
    this.commitSettings()
  }

  /** @param mode - behavior mode (活跃 / 静候 / 睡眠). */
  setMode(mode: PetMode): void {
    this.persist.mode = mode
    if (mode !== 'sleep') this.persist.napUntil = 0
    this.commitSettings()
  }

  /** Schedule the rest-reminder nap; the whale sleeps until the deadline. */
  startNap(): void {
    this.persist.napUntil = Date.now() + NAP_DURATION_MS
    this.commitSettings()
  }

  /** Clear an expired nap (component timer calls this at the deadline). */
  wakeUp(): void {
    if (this.persist.napUntil === 0) return
    this.persist.napUntil = 0
    this.commitSettings()
  }

  /** @param name - pet display name (trimmed, 20-char cap, default on empty). */
  setName(name: string): void {
    const trimmed = name.trim().slice(0, 20)
    this.persist.name = trimmed === '' ? DEFAULT_NAME : trimmed
    this.commitSettings()
  }

  /** @param metric - what the under-whale badge shows. */
  setBadgeMetric(metric: PetBadgeMetric): void {
    this.persist.badgeMetric = metric
    this.commitSettings()
  }

  /** Cycle the badge metric quota → context → turns → quota. */
  cycleBadgeMetric(): void {
    const order: PetBadgeMetric[] = ['quota', 'context', 'turns']
    const next = order[(order.indexOf(this.persist.badgeMetric) + 1) % order.length] as PetBadgeMetric
    this.setBadgeMetric(next)
  }

  /** @param cards - the complete overview-card layout (sanitized). */
  setCards(cards: readonly PetCardConfig[]): void {
    this.persist.cards = sanitizeCards(cards)
    this.commitSettings()
  }

  /** @param sound - sound-effects toggle. */
  setSound(sound: boolean): void {
    this.persist.sound = sound
    this.commitSettings()
  }

  /** @param restEvery - consecutive-turn grid for the rest reminder (2 – 50). */
  setRestEvery(restEvery: number): void {
    if (!Number.isFinite(restEvery)) return
    this.persist.restEvery = Math.round(clamp(restEvery, 2, 50))
    this.commitSettings()
  }

  /** Count one feeding; the celebratory bubble rides the returned count. */
  feed(): number {
    this.persist.fedCount += 1
    this.commitSettings()
    return this.persist.fedCount
  }

  /** @param quota - new lifetime token budget (floor 1). */
  setQuota(quota: number): void {
    if (!Number.isFinite(quota) || quota < 1) return
    this.persist.quota = Math.floor(quota)
    this.commitSettings()
  }

  /** @param muted - legacy quiet flag kept for snapshot compatibility. */
  setMuted(muted: boolean): void {
    if (muted) this.persist.mode = 'sleep'
    else if (this.persist.mode === 'sleep') this.persist.mode = 'active'
    this.commitSettings()
  }

  /** @param roam - replacement autonomous-swim settings (clamped). */
  setRoam(roam: Partial<PetRoamSettings>): void {
    const next = { ...this.persist.roam, ...roam }
    this.persist.roam = {
      enabled: next.enabled === true,
      speedRatio: clamp(Number.isFinite(next.speedRatio) ? next.speedRatio : 1, 0.5, 3),
      range: clamp(Number.isFinite(next.range) ? next.range : 80, 20, 100),
    }
    this.commitSettings()
  }

  /** @param chat - replacement chat settings. */
  setChat(chat: Partial<PetChatSettings>): void {
    const next = { ...this.persist.chat, ...chat }
    this.persist.chat = {
      mode: next.mode === 'online' ? 'online' : next.mode === 'harness' ? 'harness' : 'local',
      baseUrl: typeof next.baseUrl === 'string' ? next.baseUrl.trim().replace(/\/+$/, '') : '',
      apiKey: typeof next.apiKey === 'string' ? next.apiKey : '',
      model: typeof next.model === 'string' ? next.model.trim() : '',
    }
    this.commitSettings()
  }

  /** @param position - viewport px of the pet's top-left corner. */
  setPosition(position: { x: number; y: number }): void {
    this.persist.position = { x: Math.round(position.x), y: Math.round(position.y) }
    this.commitSettings()
  }

  /** Forget every lifetime counter (quota and settings stay). */
  resetTotals(): void {
    this.perSession.clear()
    this.persist.perSession = {}
    this.rateSamples.length = 0
    this.lastLifetimeTotal = 0
    this.persist.lastMilestone = 0
    this.lastTurnTokens = null
    this.save()
    this.publish(this.compose())
  }

  /** Detach feeds and listeners. */
  dispose(): void {
    this.disposeList?.()
    this.disposeList = undefined
    this.disposeSession?.()
    this.disposeSession = undefined
    this.started = false
    this.listeners.clear()
  }

  /** Re-read the list snapshot: session count and current-selection rebind. */
  private syncList(): void {
    const list = this.sessions.list.getSnapshot()
    const next = list.current
    if (next !== this.current) {
      this.disposeSession?.()
      this.disposeSession = undefined
      this.current = next
      this.sessionTokens = 0
      this.sessionTurns = 0
      this.contextTokens = 0
      this.wasRunning = false
      this.turnStartTotal = 0
      if (next !== undefined) {
        const binding = this.sessions.binding(next)
        if (binding !== undefined) {
          this.fold(binding.session.getSnapshot())
          this.disposeSession = binding.session.subscribe(() => {
            const bindingNow = this.sessions.binding(next)
            if (bindingNow === undefined) return
            this.fold(bindingNow.session.getSnapshot())
            this.publish(this.compose())
          })
        }
      }
    }
    this.publish(this.compose())
  }

  /** Fold one conversation snapshot into per-session and lifetime counters. */
  private fold(snapshot: ConversationSnapshot): void {
    let tokens = 0
    let turns = 0
    let context = 0
    for (const node of snapshot.nodes) {
      if (node.kind === 'user') turns += 1
      else if (node.kind === 'assistant') {
        tokens += usageTokens(node.usage)
        const prompt = promptTokens(node.usage)
        if (prompt > 0) context = prompt
      }
    }
    this.sessionTokens = tokens
    this.sessionTurns = turns
    this.contextTokens = context
    let recordChanged = false
    if (this.current !== undefined) {
      const record = this.perSession.get(this.current) ?? { tokens: 0, turns: 0 }
      // Monotonic: a shrinking visible window never lowers the lifetime spend.
      const nextTokens = Math.max(record.tokens, tokens)
      const nextTurns = Math.max(record.turns, turns)
      if (nextTokens !== record.tokens || nextTurns !== record.turns) {
        recordChanged = true
        this.perSession.set(this.current, { tokens: nextTokens, turns: nextTurns })
        this.persist.perSession = Object.fromEntries(
          [...this.perSession.entries()].map(([id, value]) => [String(id), value]),
        )
      }
    }
    // Turn boundary: a running→idle transition prices the completed turn and
    // checks the rest-reminder grid.
    if (this.wasRunning && !snapshot.running) {
      const cost = tokens - this.turnStartTotal
      if (cost > 0) {
        this.lastTurnTokens = cost
        this.lastTurnRevision += 1
      }
      if (this.persist.restEvery >= 2 && turns > 0 && turns % this.persist.restEvery === 0) {
        this.restRevision += 1
      }
    }
    if (snapshot.running && !this.wasRunning) this.turnStartTotal = tokens
    this.wasRunning = snapshot.running
    // Burn-rate sampling, milestone grid, and daily accrual: a lifetime
    // increase lands one timestamped sample and moves the day counter.
    const lifetime = this.lifetimeTotal()
    if (lifetime > this.lastLifetimeTotal) {
      const delta = lifetime - this.lastLifetimeTotal
      this.rateSamples.push({ time: Date.now(), total: lifetime })
      this.lastLifetimeTotal = lifetime
      const today = dayKey(Date.now())
      if (this.persist.daily.date !== today) this.persist.daily = { date: today, tokens: 0 }
      this.persist.daily.tokens += delta
      const grid = Math.floor(lifetime / MILESTONE_STEP)
      if (grid > this.persist.lastMilestone) {
        this.persist.lastMilestone = grid
        this.milestoneTotal = grid * MILESTONE_STEP
        this.milestoneRevision += 1
      }
      recordChanged = true
    }
    if (recordChanged) this.save()
  }

  /** Tokens per minute across the rolling sample window. */
  private burnRate(): number {
    const now = Date.now()
    while (this.rateSamples.length > 0 && now - (this.rateSamples[0] as RateSample).time > RATE_WINDOW_MS) {
      this.rateSamples.shift()
    }
    if (this.rateSamples.length < 1) return 0
    const first = this.rateSamples[0] as RateSample
    const last = this.rateSamples[this.rateSamples.length - 1] as RateSample
    const spanMs = Math.max(now - first.time, 5000)
    return Math.max(0, (last.total - first.total) * 60_000 / spanMs)
  }

  /** Sum of every per-session high-water mark. */
  private lifetimeTotal(): number {
    let total = 0
    for (const record of this.perSession.values()) total += record.tokens
    return total
  }

  /** Assemble the immutable snapshot from the live folds and settings. */
  private compose(): PetStats {
    const list = this.sessions.list.getSnapshot()
    const totalTokens = this.lifetimeTotal()
    let totalTurns = 0
    for (const record of this.perSession.values()) totalTurns += record.turns
    let sessionCount = 0
    for (const id of list.ids) {
      if (list.byId[id]?.blank !== true) sessionCount += 1
    }
    const used = Math.min(totalTokens, this.persist.quota)
    return {
      sessionId: this.current ?? null,
      sessionCount,
      running: this.wasRunning,
      sessionTokens: this.sessionTokens,
      sessionTurns: this.sessionTurns,
      lastTurnTokens: this.lastTurnTokens,
      lastTurnRevision: this.lastTurnRevision,
      totalTokens,
      totalTurns,
      tokenRate: Math.round(this.burnRate()),
      contextTokens: this.contextTokens,
      quota: this.persist.quota,
      used,
      remaining: Math.max(0, this.persist.quota - totalTokens),
      skin: this.persist.skin,
      color: this.persist.color,
      view: this.persist.view,
      roam: { ...this.persist.roam },
      chat: { ...this.persist.chat },
      mode: this.persist.mode,
      napUntil: this.persist.napUntil,
      name: this.persist.name,
      badgeMetric: this.persist.badgeMetric,
      cards: this.persist.cards.map(card => ({ ...card })),
      sound: this.persist.sound,
      restEvery: this.persist.restEvery,
      restRevision: this.restRevision,
      fedCount: this.persist.fedCount,
      milestoneRevision: this.milestoneRevision,
      milestoneTotal: this.milestoneTotal,
      digestTokens: this.digestTokens,
      muted: this.persist.mode === 'sleep',
      position: this.persist.position,
    }
  }

  /** Settings mutation tail: persist, publish, notify. */
  private commitSettings(): void {
    this.save()
    this.publish(this.compose())
  }

  /** Swap the snapshot and notify when the fact set actually moved. */
  private publish(next: PetStats): void {
    const prev = this.snapshot
    if (JSON.stringify(prev) === JSON.stringify(next)) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  /** Persist the settings and high-water table; storage faults stay silent. */
  private save(): void {
    if (this.storage === undefined) return
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.persist))
    }
    catch { /* private-mode or quota-exceeded storage: the pet degrades to ephemeral */ }
  }
}

/** Best-effort localStorage handle; undefined where unavailable. */
function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  }
  catch {
    return undefined
  }
}

/** Load and defensively validate the persisted record. */
function loadPersist(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined): PetPersist {
  const base = defaultPersist()
  if (storage === undefined) return base
  let raw: string | null = null
  try {
    raw = storage.getItem(STORAGE_KEY)
  }
  catch {
    return base
  }
  if (raw === null) return base
  try {
    const parsed = JSON.parse(raw) as Partial<PetPersist>
    const roam: Partial<PetRoamSettings> = typeof parsed.roam === 'object' && parsed.roam !== null ? parsed.roam : {}
    const chat: Partial<PetChatSettings> = typeof parsed.chat === 'object' && parsed.chat !== null ? parsed.chat : {}
    const daily = typeof parsed.daily === 'object' && parsed.daily !== null ? parsed.daily : base.daily
    return {
      quota: typeof parsed.quota === 'number' && parsed.quota >= 1 ? Math.floor(parsed.quota) : base.quota,
      skin: parsed.skin === 'skeuo' ? 'skeuo' : 'pixel',
      color: typeof parsed.color === 'string' ? normalizeColor(parsed.color) : base.color,
      view: parsed.view === 'compact' ? 'compact' : 'full',
      roam: {
        enabled: roam.enabled !== false,
        speedRatio: typeof roam.speedRatio === 'number' ? clamp(roam.speedRatio, 0.5, 3) : 1,
        range: typeof roam.range === 'number' ? clamp(roam.range, 20, 100) : 80,
      },
      chat: {
        mode: chat.mode === 'online' ? 'online' : chat.mode === 'harness' ? 'harness' : 'local',
        baseUrl: typeof chat.baseUrl === 'string' ? chat.baseUrl : base.chat.baseUrl,
        apiKey: typeof chat.apiKey === 'string' ? chat.apiKey : '',
        model: typeof chat.model === 'string' ? chat.model : base.chat.model,
      },
      mode: parsed.mode === 'standby' || parsed.mode === 'sleep' ? parsed.mode : 'active',
      napUntil: typeof parsed.napUntil === 'number' ? parsed.napUntil : 0,
      name: typeof parsed.name === 'string' && parsed.name.trim() !== '' ? parsed.name.trim().slice(0, 20) : base.name,
      badgeMetric: parsed.badgeMetric === 'context' || parsed.badgeMetric === 'turns' ? parsed.badgeMetric : 'quota',
      cards: sanitizeCards(parsed.cards),
      sound: parsed.sound !== false,
      restEvery: typeof parsed.restEvery === 'number' ? clamp(Math.round(parsed.restEvery), 2, 50) : 8,
      fedCount: typeof parsed.fedCount === 'number' && parsed.fedCount >= 0 ? parsed.fedCount : 0,
      lastMilestone: typeof parsed.lastMilestone === 'number' && parsed.lastMilestone >= 0 ? parsed.lastMilestone : 0,
      daily: {
        date: typeof daily.date === 'string' ? daily.date : base.daily.date,
        tokens: typeof daily.tokens === 'number' && daily.tokens >= 0 ? daily.tokens : 0,
      },
      position: isFinitePoint(parsed.position) ? { x: parsed.position.x, y: parsed.position.y } : null,
      perSession: sanitizeRecords(parsed.perSession),
    }
  }
  catch {
    return base
  }
}

/** Validate one persisted card layout; malformed lists fall back to default. */
function sanitizeCards(value: unknown): PetCardConfig[] {
  if (!Array.isArray(value)) return DEFAULT_CARDS.map(card => ({ ...card }))
  const seen = new Set<string>()
  const out: PetCardConfig[] = []
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const candidate = item as Record<string, unknown>
    const id = typeof candidate.id === 'string' ? candidate.id : ''
    if (!CARD_IDS.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      size: candidate.size === 's' || candidate.size === 'l' ? candidate.size : 'm',
      visible: candidate.visible !== false,
    })
  }
  // A layout that dropped every card falls back wholesale.
  if (out.length === 0) return DEFAULT_CARDS.map(card => ({ ...card }))
  return out
}

function isFinitePoint(value: unknown): value is { x: number; y: number } {
  return typeof value === 'object' && value !== null
    && Number.isFinite((value as { x: unknown }).x) && Number.isFinite((value as { y: unknown }).y)
}

function sanitizeRecords(value: unknown): Record<string, SessionRecord> {
  if (typeof value !== 'object' || value === null) return {}
  const out: Record<string, SessionRecord> = {}
  for (const [id, record] of Object.entries(value as Record<string, unknown>)) {
    if (typeof record !== 'object' || record === null) continue
    const candidate = record as Record<string, unknown>
    const tokens = typeof candidate.tokens === 'number' && candidate.tokens >= 0 ? candidate.tokens : 0
    const turns = typeof candidate.turns === 'number' && candidate.turns >= 0 ? candidate.turns : 0
    out[id] = { tokens, turns }
  }
  return out
}
