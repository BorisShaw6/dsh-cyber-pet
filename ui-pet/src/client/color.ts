/**
 * Whale color theme helpers: hex parsing, lighten/darken mixing, and the
 * shipped preset palette. Both skins derive every body shade from the single
 * user-picked base color, so one hex drives the whole whale.
 */

/** One selectable preset swatch. */
export interface ColorPreset {
  /** Persisted hex value. */
  hex: string
  /** Locale key naming the swatch. */
  key: 'color.yellow' | 'color.blue' | 'color.pink' | 'color.mint' | 'color.purple' | 'color.orange' | 'color.black'
}

/** The default 小黄鲸 body color. */
export const DEFAULT_COLOR = '#ffc53d'

/** Shipped swatches, display order. */
export const COLOR_PRESETS: readonly ColorPreset[] = [
  { hex: '#ffc53d', key: 'color.yellow' },
  { hex: '#4d9fff', key: 'color.blue' },
  { hex: '#ff7eb6', key: 'color.pink' },
  { hex: '#3ddc97', key: 'color.mint' },
  { hex: '#9d7bff', key: 'color.purple' },
  { hex: '#ff8a3d', key: 'color.orange' },
  { hex: '#252b36', key: 'color.black' },
]

/**
 * Validate one user-supplied hex color.
 * @param value - candidate `#rgb` or `#rrggbb` string.
 * @returns normalized `#rrggbb`, or the default color when malformed.
 */
export function normalizeColor(value: string): string {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim())
  if (match === null) return DEFAULT_COLOR
  const body = match[1] as string
  if (body.length === 3) {
    return `#${body.split('').map(ch => ch + ch).join('')}`.toLowerCase()
  }
  return `#${body.toLowerCase()}`
}

function channels(hex: string): [number, number, number] {
  const clean = normalizeColor(hex).slice(1)
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ]
}

function toHex([r, g, b]: [number, number, number]): string {
  const part = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/**
 * Mix one color toward another.
 * @param base - start hex.
 * @param toward - target hex.
 * @param amount - 0 keeps base, 1 reaches target.
 * @returns blended hex.
 */
export function mix(base: string, toward: string, amount: number): string {
  const a = channels(base)
  const b = channels(toward)
  const t = Math.min(1, Math.max(0, amount))
  return toHex([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ])
}

/** @param hex - base color. @param amount - 0..1 toward white. @returns lightened hex. */
export function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount)
}

/** @param hex - base color. @param amount - 0..1 toward black. @returns darkened hex. */
export function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount)
}

/**
 * The full derived shade set one whale skin paints with.
 * @param base - the user's body color.
 * @returns every shade both skins consume.
 */
export function whalePalette(base: string) {
  const body = normalizeColor(base)
  return {
    body,
    /** Pixel-art belly shade / skeuo deep stop. */
    shade: darken(body, 0.42),
    /** Skeuo top-of-back highlight stop. */
    highlight: lighten(body, 0.32),
    /** Rim light and water-spout tint. */
    glow: lighten(body, 0.62),
    /** Fin and deep crevice fill. */
    deep: darken(body, 0.68),
  }
}
