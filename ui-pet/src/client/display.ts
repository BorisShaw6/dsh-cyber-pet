/**
 * Display-only pure helpers for the cyber pet: compact token formatting and
 * quota-ratio clamping. No live data here — components apply these to the
 * tracker snapshot delivered through the `usePetStats` hook.
 */

/**
 * Compact token count for tight pet surfaces.
 * @param count - raw token count (assumed non-negative).
 * @returns `999`, `12.3k`, or `1.5M` style text.
 */
export function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count < 1000) return String(Math.max(0, Math.round(count)))
  if (count < 1_000_000) return `${trimTrailingZero((count / 1000).toFixed(1))}k`
  return `${trimTrailingZero((count / 1_000_000).toFixed(1))}M`
}

function trimTrailingZero(text: string): string {
  return text.endsWith('.0') ? text.slice(0, -2) : text
}

/**
 * Usage ratio clamped into [0, 1] for the progress bar.
 * @param used - consumed tokens.
 * @param quota - configured budget (non-positive yields a full bar).
 * @returns ratio between 0 and 1.
 */
export function quotaRatio(used: number, quota: number): number {
  if (quota <= 0) return 1
  return Math.min(1, Math.max(0, used / quota))
}
