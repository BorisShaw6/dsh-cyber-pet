/**
 * Pet life helpers: the growth ladder (calf → junior → adult → golden crown),
 * the mood engine (derived from burn state and remaining quota), and the
 * milestone grid. Pure functions over the tracker snapshot — components apply
 * them to the `usePetStats` delivery.
 */
import type { PetStats } from './tracker.ts'

/** One growth stage. */
export interface PetLevel {
  /** Lifetime tokens needed to reach the stage. */
  threshold: number
  /** Locale key naming the stage. */
  key: 'life.lvl0' | 'life.lvl1' | 'life.lvl2' | 'life.lvl3'
  /** Whale render scale. */
  scale: number
  /** Whether the crown accessory shows. */
  crown: boolean
}

/** The growth ladder, ascending. */
export const LEVELS: readonly PetLevel[] = [
  { threshold: 0, key: 'life.lvl0', scale: 1, crown: false },
  { threshold: 50_000, key: 'life.lvl1', scale: 1.06, crown: false },
  { threshold: 200_000, key: 'life.lvl2', scale: 1.12, crown: false },
  { threshold: 1_000_000, key: 'life.lvl3', scale: 1.18, crown: true },
]

/** One milestone step (tokens). */
export const MILESTONE_STEP = 10_000

/** Derived level position. */
export interface LevelInfo {
  /** Index into LEVELS. */
  index: number
  /** The stage itself. */
  level: PetLevel
  /** Tokens still needed for the next stage; null at max. */
  toNext: number | null
}

/** @param totalTokens - lifetime tokens. @returns the stage the whale stands on. */
export function levelOf(totalTokens: number): LevelInfo {
  let index = 0
  for (let i = LEVELS.length - 1; i >= 0; i -= 1) {
    if (totalTokens >= (LEVELS[i] as PetLevel).threshold) {
      index = i
      break
    }
  }
  const next = LEVELS[index + 1] as PetLevel | undefined
  return {
    index,
    level: LEVELS[index] as PetLevel,
    toNext: next === undefined ? null : next.threshold - totalTokens,
  }
}

/** Whale mood vocabulary. */
export type PetMood = 'happy' | 'focused' | 'anxious' | 'sleepy'

/** Emoji shown beside the panel subtitle for each mood. */
export const MOOD_EMOJI: Record<PetMood, string> = {
  happy: '😊',
  focused: '🤓',
  anxious: '😰',
  sleepy: '😴',
}

/**
 * Derive the whale's mood.
 * @param stats - current tracker snapshot.
 * @param effectiveMode - mode after nap override ('active' | 'standby' | 'sleep').
 * @returns the mood key.
 */
export function moodOf(stats: PetStats, effectiveMode: 'active' | 'standby' | 'sleep'): PetMood {
  if (effectiveMode === 'sleep') return 'sleepy'
  if (stats.remaining <= stats.quota * 0.1) return 'anxious'
  if (stats.running) return 'focused'
  return 'happy'
}
