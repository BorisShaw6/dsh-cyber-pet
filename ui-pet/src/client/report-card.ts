/**
 * Usage report card exporter: paints a shareable PNG (dark gradient card,
 * pixel whale, counters, quota bar) onto an offscreen canvas and triggers a
 * browser download. Pure DOM/canvas work — the caller supplies translated
 * labels, so no locale dependency lives here.
 */
import { normalizeColor, whalePalette } from './color.ts'
import { PIXEL_FRAME } from './whale.tsx'
import type { PetStats } from './tracker.ts'

/** Translated labels the card prints. */
export interface ReportLabels {
  subtitle: string
  level: string
  used: string
  remaining: string
  totalTokens: string
  totalTurns: string
  sessions: string
}

/**
 * Paint and download the report card.
 * @param stats - current tracker snapshot.
 * @param name - the pet's display name.
 * @param levelName - translated growth-stage name.
 * @param labels - translated row labels.
 */
export function exportReportCard(stats: PetStats, name: string, levelName: string, labels: ReportLabels): void {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 360
  const ctx = canvas.getContext('2d')
  if (ctx === null) return

  // Background.
  const bg = ctx.createLinearGradient(0, 0, 640, 360)
  bg.addColorStop(0, '#1a2030')
  bg.addColorStop(1, '#0a0d12')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 640, 360)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, 638, 358)

  // Pixel whale (8x cells) on the left.
  const palette = whalePalette(stats.color)
  const legend: { [key: string]: string | undefined } = { B: palette.body, D: palette.shade, W: '#ffffff', S: '#7cc4ff' }
  const cell = 8
  const ox = 40
  const oy = 90
  PIXEL_FRAME.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const fill = legend[row.charAt(x)]
      if (fill === undefined) continue
      ctx.fillStyle = fill
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell)
    }
  })

  // Header.
  ctx.fillStyle = normalizeColor(stats.color)
  ctx.font = '700 26px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(name, 300, 70)
  ctx.fillStyle = 'rgba(240,243,248,0.55)'
  ctx.font = '400 13px system-ui, sans-serif'
  ctx.fillText(`${labels.subtitle} · ${levelName} · ${new Date().toLocaleDateString()}`, 300, 94)

  // Quota bar.
  const ratio = stats.quota > 0 ? Math.min(1, stats.used / stats.quota) : 1
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(300, 116, 300, 10)
  const bar = ctx.createLinearGradient(300, 0, 600, 0)
  bar.addColorStop(0, normalizeColor(stats.color))
  bar.addColorStop(1, '#7cc4ff')
  ctx.fillStyle = bar
  ctx.fillRect(300, 116, 300 * ratio, 10)

  // Counter rows.
  const rows: [string, string][] = [
    [labels.used, `${String(stats.used)} / ${String(stats.quota)}`],
    [labels.remaining, String(stats.remaining)],
    [labels.totalTokens, String(stats.totalTokens)],
    [labels.totalTurns, String(stats.totalTurns)],
    [labels.sessions, String(stats.sessionCount)],
  ]
  let y = 160
  for (const [label, value] of rows) {
    ctx.fillStyle = 'rgba(240,243,248,0.55)'
    ctx.font = '400 14px system-ui, sans-serif'
    ctx.fillText(label, 300, y)
    ctx.fillStyle = '#f0f3f8'
    ctx.font = '700 14px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(value, 600, y)
    ctx.textAlign = 'left'
    y += 30
  }

  // Footer.
  ctx.fillStyle = 'rgba(240,243,248,0.35)'
  ctx.font = '400 11px system-ui, sans-serif'
  ctx.fillText('DeepSeek Harness · Cyber Whale', 40, 336)

  const anchor = document.createElement('a')
  anchor.href = canvas.toDataURL('image/png')
  anchor.download = `cyber-whale-report-${new Date().toISOString().slice(0, 10)}.png`
  anchor.click()
}
