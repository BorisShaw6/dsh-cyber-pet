/**
 * The cyber pet's injected face. Live stats never ride this face — they
 * arrive through the registrant-private `hooks` compartment as the bound
 * `usePetStats` selector hook; inject carries only the mutation verbs.
 */
import type {
  PetBadgeMetric, PetBalanceDisplay, PetCardConfig, PetChatSettings, PetMode, PetPanelSize,
  PetQuotaSource, PetRoamSettings, PetSkin, PetThresholds, PetView,
} from './tracker.ts'
import type { ChatTurn } from './pet-chat.ts'

/** Injected business face of the pet entry: the settings mutation verbs. */
export interface PetActions {
  /** @param skin - switch the whale skin (pixel art or skeuomorphic). */
  setSkin: (skin: PetSkin) => void
  /** @param color - repaint the whale body (normalized hex). */
  setColor: (color: string) => void
  /** @param view - switch panel density (compact or full). */
  setView: (view: PetView) => void
  /** @param quota - replace the lifetime token budget. */
  setQuota: (quota: number) => void
  /** @param source - where the quota comes from (manual input or balance sync). */
  setQuotaSource: (source: PetQuotaSource) => void
  /** @param tokensPerUnit - tokens one currency unit buys in balance mode. */
  setTokensPerUnit: (tokensPerUnit: number) => void
  /**
   * Sync the account balance through the host-side petChat Remote; on
   * success the tracker stores the reading (balance mode recomputes the
   * quota). Rejects with a displayable error when the service or the host
   * credential is absent. Throttled while the last reading is fresh.
   */
  fetchBalance: () => Promise<{ amount: number; currency: string }>
  /** @param display - how the account balance shows in the overview. */
  setBalanceDisplay: (display: PetBalanceDisplay) => void
  /** @param patch - partial behavior-threshold update (milestone / levels / anxious). */
  setThresholds: (patch: Partial<PetThresholds>) => void
  /** @param size - user-resized panel footprint; null restores the factory size. */
  setPanelSize: (size: PetPanelSize | null) => void
  /** @param mode - behavior mode (active / standby / sleep). */
  setMode: (mode: PetMode) => void
  /** @param name - pet display name. */
  setName: (name: string) => void
  /** @param metric - what the under-whale badge shows. */
  setBadgeMetric: (metric: PetBadgeMetric) => void
  /** @param cards - complete overview-card layout replacement. */
  setCards: (cards: readonly PetCardConfig[]) => void
  /** @param sound - sound-effects toggle. */
  setSound: (sound: boolean) => void
  /** @param restEvery - consecutive-turn grid for the rest reminder. */
  setRestEvery: (restEvery: number) => void
  /** Schedule the rest-reminder nap. */
  startNap: () => void
  /** Clear an expired nap. */
  wakeUp: () => void
  /** Cycle the badge metric. */
  cycleBadgeMetric: () => void
  /** Count one feeding; returns the lifetime count. */
  feed: () => number
  /**
   * Ask the host-side petChat Remote for one whale reply (harness chat
   * mode). Rejects with a displayable error when the service is absent.
   * @param history - recent turns, oldest first.
   */
  askHarness: (history: readonly ChatTurn[]) => Promise<string>
  /** @param muted - legacy quiet toggle (maps onto the sleep mode). */
  setMuted: (muted: boolean) => void
  /** @param roam - partial autonomous-swim settings update. */
  setRoam: (roam: Partial<PetRoamSettings>) => void
  /** @param chat - partial chat settings update. */
  setChat: (chat: Partial<PetChatSettings>) => void
  /** @param position - persist the pet's viewport px after a drag. */
  setPosition: (position: { x: number; y: number }) => void
  /** Forget every lifetime counter (quota and settings stay). */
  resetTotals: () => void
  /** @returns the app's active locale id ('zh' | 'en'). */
  activeLocale: () => string
  /** @param id - switch the app locale. */
  setLocale: (id: string) => void
}
