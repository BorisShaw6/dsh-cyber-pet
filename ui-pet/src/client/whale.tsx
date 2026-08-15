/**
 * The two whale skins. Both render a DeepSeek-style whale at a fixed design
 * size, painted from the user's body color through {@link whalePalette}; the
 * pet shell positions and scales the wrapper. PixelWhale is a hand-placed
 * pixel grid (each character one rect — the skin stays editable as plain
 * text), SkeuoWhale is a gradient-shaded vector whale with a rim light and a
 * soft cast shadow.
 */
import { useId } from 'react'
import { whalePalette } from './color.ts'

/**
 * The whale sprite, left-facing: head and eye on the left, water spout above
 * the head, tail flukes on the right. Editable as plain text. Exported for
 * the canvas report-card painter.
 */
export const PIXEL_FRAME: readonly string[] = [
  '....S....................',
  '...SSS...................',
  '....S....................',
  '..BBBBBBB............BB..',
  '.BBBBBBBBB..........BBBB.',
  'BBBBBBBBBBB........BBBB..',
  'BBBBBBBBBBBB......BBBB...',
  'BWBBBBBBBBBBBBBBBBBBB....',
  'BBBBBBBBBBBBBBBBBBBBB....',
  '.BBBBBBBBBBBBBBBBBBB.....',
  '..BBBBBBBBBBBBBBBBB......',
  '...DDBBBBBBBBBBBB........',
  '.....DDBBBBBBBB..........',
  '.......DDBBBB.............',
  '.........DD...............',
]

/** Shared skin props. */
export interface WhaleProps {
  /** Whale body color (hex). */
  color: string
  /** Optional className for the svg root. */
  className?: string | undefined
}

/**
 * Pixel-art whale (the 像素风 skin).
 * @param props - body color plus optional className.
 */
export function PixelWhale({ color, className }: WhaleProps) {
  const palette = whalePalette(color)
  const legend: { [key: string]: string | undefined } = { B: palette.body, D: palette.shade, W: '#ffffff', S: '#7cc4ff' }
  const cells: { x: number; y: number; fill: string }[] = []
  PIXEL_FRAME.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const fill = legend[row.charAt(x)]
      if (fill !== undefined) cells.push({ x, y, fill })
    }
  })
  return (
    <svg
      className={className}
      viewBox="0 0 25 15"
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {cells.map(cell => <rect key={`${cell.x}:${cell.y}`} x={cell.x} y={cell.y} width={1.02} height={1.02} fill={cell.fill} />)}
    </svg>
  )
}

/**
 * Skeuomorphic whale (the 拟物风 skin): gradient body, rim light, glossy eye,
 * water spout, and a soft cast shadow.
 * @param props - body color plus optional className.
 */
export function SkeuoWhale({ color, className }: WhaleProps) {
  const palette = whalePalette(color)
  const uid = useId()
  const bodyGradient = `pet-body-${uid}`
  const sheenGradient = `pet-sheen-${uid}`
  const spoutGradient = `pet-spout-${uid}`
  const bodyPath = `M 14 48
    C 14 31, 30 20, 54 20
    C 78 20, 94 28, 101 39
    L 113 27
    C 110 35, 110 42, 114 51
    L 100 47
    C 92 58, 76 66, 56 66
    C 32 66, 14 60, 14 48 Z`
  return (
    <svg className={className} viewBox="0 0 120 92" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id={bodyGradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.highlight} />
          <stop offset="42%" stopColor={palette.body} />
          <stop offset="100%" stopColor={palette.deep} />
        </linearGradient>
        <radialGradient id={sheenGradient} cx="30%" cy="24%" r="62%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={spoutGradient} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#4d9fff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#bfe0ff" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* cast shadow */}
      <ellipse cx="58" cy="84" rx="34" ry="5" fill="#000" opacity="0.22" />

      {/* water spout */}
      <path
        d="M 25 20 C 24 14, 22 10, 18 6 M 26 20 C 27 13, 29 9, 33 5 M 25.5 20 C 25.5 15, 25.5 11, 25.5 7"
        fill="none"
        stroke={`url(#${spoutGradient})`}
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      {/* body: head left, tail flukes right */}
      <path d={bodyPath} fill={`url(#${bodyGradient})`} />
      {/* glossy sheen over the back */}
      <path d={bodyPath} fill={`url(#${sheenGradient})`} />
      {/* rim light along the belly edge */}
      <path
        d="M 18 54 C 30 62, 48 65, 62 63 C 78 61, 90 55, 98 47"
        fill="none"
        stroke={palette.glow}
        strokeOpacity="0.5"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* pectoral fin */}
      <path d="M 40 52 C 46 60, 54 62, 60 60 C 54 55, 47 52, 40 52 Z" fill={palette.deep} />
      {/* eye with glint */}
      <circle cx="27" cy="44" r="3" fill="#ffffff" />
      <circle cx="26" cy="43" r="1.1" fill="#1a1f27" />
      {/* smile */}
      <path d="M 20 52 C 23 54.5, 28 55, 32 53.5" fill="none" stroke={palette.deep} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
