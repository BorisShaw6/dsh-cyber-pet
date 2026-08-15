/**
 * CyberPet: the shell.overlay entry — a floating whale embedded in the page.
 * Behavior modes (活跃 / 静候 / 睡眠) switch through a right-click quick menu;
 * the whale swims autonomously in active mode (speed follows the live burn
 * rate × the user's ratio), naps when the rest reminder fires, celebrates
 * milestone grid lines, greets with yesterday's digest on first load, and can
 * be fed by dragging the token snack onto it. The under-whale badge shows the
 * user's chosen metric (quota / context / turns) and cycles on click. Live
 * stats arrive through the bound `usePetStats` hook; the mutation verbs are
 * the injected face; copy rides the standard locale seat.
 */
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { PropsLocale, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetActions } from './slots.ts'
import type { PetMode, PetStats } from './tracker.ts'
import { formatTokens } from './display.ts'
import { levelOf, MOOD_EMOJI, moodOf } from './pet-life.ts'
import { ensureAudio, playBlip, playChime, playMunch } from './pet-sound.ts'
import { PetPanel } from './PetPanel.tsx'
import { PixelWhale, SkeuoWhale } from './whale.tsx'
import css from './CyberPet.module.css'

/** Design size of the whale seat in viewport px. */
const PET_SIZE = 96
/** Pointer travel below this stays a click, beyond it becomes a drag. */
const DRAG_THRESHOLD = 4
/** Bubble auto-hide delay (ms). */
const BUBBLE_TTL = 6000
/** Idle swim base speed in px/s before ratio and burn-rate scaling. */
const BASE_SWIM_SPEED = 14
/** Burn rate (tokens/min) that doubles the swim speed. */
const RATE_FULL_BOOST = 600
/** How often a roaming position lands in storage (ms). */
const ROAM_PERSIST_MS = 4000

/** Full composed props: the injected verbs + the bound stats hook + the locale seat. */
export type CyberPetProps = PetActions & {
  /** Bound tracker snapshot selector (the inject `hooks` compartment). */
  usePetStats: SnapshotSelectorHook<PetStats>
}

/** One speech bubble occurrence; the key re-triggers equal consecutive texts. */
interface Bubble {
  text: string
  key: number
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

function viewport(): { width: number; height: number } {
  return {
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
  }
}

/** Bottom-right default seat with a comfortable viewport margin. */
function defaultPosition(): { x: number; y: number } {
  const { width, height } = viewport()
  return { x: Math.max(8, width - PET_SIZE - 32), y: Math.max(8, height - PET_SIZE - 48) }
}

/** The three behavior modes, quick-menu order. */
const MODES: readonly PetMode[] = ['active', 'standby', 'sleep']

/**
 * Render the floating whale, its badge, the quick menu, and the dashboard.
 * @param props - injected verbs, bound stats hook, and the `t` seat.
 */
export function CyberPet({
  usePetStats, setSkin, setColor, setView, setQuota, setMode, setName, setBadgeMetric,
  setCards, setSound, setRestEvery, startNap, wakeUp, cycleBadgeMetric, feed, askHarness,
  setMuted, setRoam, setChat, setPosition, resetTotals, activeLocale, setLocale, t,
}: CyberPetProps & PropsLocale<'pet'>) {
  const stats = usePetStats(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const [celebrating, setCelebrating] = useState(false)
  const [pos, setPos] = useState(() => stats.position ?? defaultPosition())
  const [facing, setFacing] = useState<'left' | 'right'>('left')
  const [feedDrag, setFeedDrag] = useState<{ x: number; y: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const posRef = useRef(pos)
  const dragRef = useRef<{ dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const greetedRef = useRef(false)
  const roamStateRef = useRef({ dirX: -1, dirY: 0, lastPersist: 0 })
  const prevNapRef = useRef(stats.napUntil)

  /** Single position writer: keeps the roam-loop ref and React state aligned. */
  const movePos = (next: { x: number; y: number }) => {
    posRef.current = next
    setPos(next)
  }

  const say = (text: string) => {
    setBubble(prev => ({ text, key: (prev?.key ?? 0) + 1 }))
  }

  const effectiveMode: PetMode = stats.napUntil > Date.now() ? 'sleep' : stats.mode
  const level = levelOf(stats.totalTokens)
  const mood = moodOf(stats, effectiveMode)

  // First-load bubble: yesterday's digest wins over the greeting.
  useEffect(() => {
    if (greetedRef.current) return
    greetedRef.current = true
    if (effectiveMode === 'sleep') return
    if (stats.digestTokens !== null) {
      say(t('bubble.digest').replace('{tokens}', formatTokens(stats.digestTokens)))
    }
    else {
      say(t('bubble.greeting').replace('{name}', stats.name))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bubble
  }, [])

  // Turn completion: price the finished turn, report remaining, play the blip.
  const lastTurnRevision = stats.lastTurnRevision
  useEffect(() => {
    if (lastTurnRevision === 0 || stats.lastTurnTokens === null) return
    let text = `${t('bubble.turnPrefix')}${formatTokens(stats.lastTurnTokens)}${t('bubble.tokenUnit')}`
      + `${t('bubble.remainingPrefix')}${formatTokens(stats.remaining)}`
    if (stats.remaining <= stats.quota * 0.1) text += ` ${t('bubble.quotaLow')}`
    if (effectiveMode !== 'sleep') {
      say(text)
      if (stats.sound) playBlip()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision is the retrigger axis
  }, [lastTurnRevision])

  // Milestone crossed: celebrate with a spout burst and a chime.
  const milestoneRevision = stats.milestoneRevision
  useEffect(() => {
    if (milestoneRevision === 0) return
    if (effectiveMode !== 'sleep') {
      say(t('bubble.milestone').replace('{total}', formatTokens(stats.milestoneTotal)))
      if (stats.sound) playChime()
    }
    setCelebrating(true)
    const timer = setTimeout(() => setCelebrating(false), 1800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision is the retrigger axis
  }, [milestoneRevision])

  // Rest reminder: suggest a break and nap for a few minutes.
  const restRevision = stats.restRevision
  useEffect(() => {
    if (restRevision === 0) return
    if (effectiveMode !== 'sleep') {
      say(t('bubble.rest').replace('{turns}', String(stats.sessionTurns)))
      startNap()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision is the retrigger axis
  }, [restRevision])

  // Nap lifecycle: wake at the deadline and announce it.
  useEffect(() => {
    const prev = prevNapRef.current
    prevNapRef.current = stats.napUntil
    if (prev > 0 && stats.napUntil === 0) {
      say(t('bubble.napEnd'))
      return undefined
    }
    if (stats.napUntil > Date.now()) {
      const timer = setTimeout(() => wakeUp(), Math.max(0, stats.napUntil - Date.now()))
      return () => clearTimeout(timer)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nap edges only
  }, [stats.napUntil])

  // Bubble auto-hide.
  useEffect(() => {
    if (bubble === null) return undefined
    const timer = setTimeout(() => setBubble(null), BUBBLE_TTL)
    return () => clearTimeout(timer)
  }, [bubble])

  // Outside pointer-down closes the dashboard and the quick menu.
  useEffect(() => {
    if (!open && !menuOpen) return undefined
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, menuOpen])

  // Autonomous roam: active mode only, paused while dragged, open, or asleep.
  const roamEnabled = stats.roam.enabled && effectiveMode === 'active' && !open
  const speedRatio = stats.roam.speedRatio
  const roamRange = stats.roam.range
  const tokenRate = stats.tokenRate
  useEffect(() => {
    if (!roamEnabled) return undefined
    let raf = 0
    let last = performance.now()
    let frame = 0
    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      frame += 1
      if (frame % 2 === 1) return // ~30fps keeps the wiggle cheap
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const boost = 1 + Math.min(tokenRate / RATE_FULL_BOOST, 2)
      const speed = BASE_SWIM_SPEED * speedRatio * boost
      const { width, height } = viewport()
      const insetX = width * (100 - roamRange) / 200
      const insetY = height * (100 - roamRange) / 200
      const state = roamStateRef.current
      // Gentle wander: occasionally nudge the heading.
      if (Math.random() < 0.008) {
        state.dirY = Math.random() * 2 - 1
        state.dirX = (state.dirX >= 0 ? 1 : -1) * (0.6 + Math.random() * 0.4)
      }
      let x = posRef.current.x + state.dirX * speed * dt
      let y = posRef.current.y + state.dirY * speed * dt * 0.6
      const minX = Math.max(8, insetX)
      const maxX = Math.max(minX, width - PET_SIZE - insetX)
      const minY = Math.max(8, insetY)
      const maxY = Math.max(minY, height - PET_SIZE - insetY)
      if (x <= minX || x >= maxX) state.dirX = -state.dirX
      if (y <= minY || y >= maxY) state.dirY = -state.dirY
      x = clamp(x, minX, maxX)
      y = clamp(y, minY, maxY)
      if (state.dirX > 0) setFacing('right')
      else if (state.dirX < 0) setFacing('left')
      movePos({ x, y })
      if (now - state.lastPersist > ROAM_PERSIST_MS) {
        state.lastPersist = now
        setPosition({ x, y })
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- position rides posRef inside the loop
  }, [roamEnabled, speedRatio, roamRange, tokenRate])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    ensureAudio()
    setMenuOpen(false)
    // Pointer capture is unavailable in some embeds (jsdom); dragging still works mouse-only.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      dx: event.clientX - pos.x, dy: event.clientY - pos.y,
      startX: event.clientX, startY: event.clientY, moved: false,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null) return
    if (Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD || Math.abs(event.clientY - drag.startY) > DRAG_THRESHOLD) {
      drag.moved = true
    }
    if (!drag.moved) return
    const { width, height } = viewport()
    movePos({
      x: clamp(event.clientX - drag.dx, 8, Math.max(8, width - PET_SIZE)),
      y: clamp(event.clientY - drag.dy, 8, Math.max(8, height - PET_SIZE)),
    })
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag === null) return
    if (drag.moved) {
      setPosition(pos)
      // The pointerup's synthetic click must not also toggle the panel.
      suppressClickRef.current = true
    }
  }

  const onClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setOpen(value => !value)
    setMenuOpen(false)
  }

  const onContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault()
    setMenuOpen(value => !value)
  }

  // Feeding: drag the snack chip; release over the whale to feed it.
  const onFeedPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    ensureAudio()
    event.preventDefault()
    setFeedDrag({ x: event.clientX, y: event.clientY })
    const move = (moveEvent: PointerEvent) => {
      setFeedDrag({ x: moveEvent.clientX, y: moveEvent.clientY })
    }
    const up = (upEvent: PointerEvent) => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      setFeedDrag(null)
      const root = rootRef.current
      if (root === null) return
      const rect = root.getBoundingClientRect()
      if (upEvent.clientX >= rect.left && upEvent.clientX <= rect.right
        && upEvent.clientY >= rect.top && upEvent.clientY <= rect.bottom) {
        const count = feed()
        if (effectiveMode !== 'sleep') {
          say(t('bubble.fed').replace('{count}', String(count)))
          if (stats.sound) playMunch()
        }
      }
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  const panelSide = pos.x > viewport().width / 2 ? css.panelRight : css.panelLeft
  // Bubble anchor: centered over the whale unless that would spill off a viewport edge.
  const bubbleAnchor = pos.x < 140
    ? css.bubbleLeft
    : pos.x > viewport().width - 280
      ? css.bubbleRight
      : css.bubbleCenter
  const whaleFace = facing === 'right' ? `${css.whaleFace} ${css.whaleFaceRight}` : css.whaleFace
  const swimming = (stats.running || roamEnabled) && effectiveMode === 'active'
  const sleeping = effectiveMode === 'sleep'

  // Badge content follows the user's metric choice.
  const badgeValue = stats.badgeMetric === 'context'
    ? formatTokens(stats.contextTokens)
    : stats.badgeMetric === 'turns'
      ? String(stats.sessionTurns)
      : formatTokens(stats.remaining)
  const badgeLabel = t(`badge.${stats.badgeMetric}`)

  return (
    <div ref={rootRef} className={css.root} style={{ left: pos.x, top: pos.y }}>
      {bubble !== null && (
        <div className={`${css.bubble} ${bubbleAnchor}`} key={bubble.key} role="status">{bubble.text}</div>
      )}

      {menuOpen && (
        <div className={css.modeMenu} role="menu">
          {MODES.map(mode => (
            <button
              key={mode}
              type="button"
              role="menuitem"
              className={effectiveMode === mode ? `${css.modeItem} ${css.modeItemActive}` : css.modeItem}
              onClick={() => {
                setMode(mode)
                setMenuOpen(false)
              }}
            >
              {t(`mode.${mode}`)}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className={`${css.panelAnchor} ${panelSide}`}>
          <PetPanel
            stats={stats}
            levelKey={level.level.key}
            moodEmoji={MOOD_EMOJI[mood]}
            setSkin={setSkin}
            setColor={setColor}
            setView={setView}
            setQuota={setQuota}
            setMode={setMode}
            setName={setName}
            setBadgeMetric={setBadgeMetric}
            setCards={setCards}
            setSound={setSound}
            setRestEvery={setRestEvery}
            startNap={startNap}
            wakeUp={wakeUp}
            cycleBadgeMetric={cycleBadgeMetric}
            feed={feed}
            askHarness={askHarness}
            setMuted={setMuted}
            setRoam={setRoam}
            setChat={setChat}
            setPosition={setPosition}
            resetTotals={resetTotals}
            activeLocale={activeLocale}
            setLocale={setLocale}
            t={t}
          />
          <div className={css.feedRow}>
            <span className={css.feedHint}>{t('feed.hint')}</span>
            <button type="button" className={css.feedChip} onPointerDown={onFeedPointerDown}>
              {`🪙 ${t('feed.chip')}`}
            </button>
          </div>
        </div>
      )}

      <div
        className={swimming ? `${css.whale} ${css.swimming}` : css.whale}
        style={{ transform: `scale(${String(level.level.scale)})` }}
        role="button"
        tabIndex={0}
        aria-label={open ? t('aria.close') : t('aria.open')}
        title={`${stats.name} · ${t(`mode.${effectiveMode}`)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') setOpen(value => !value)
        }}
      >
        {level.level.crown && <span className={css.crown}>👑</span>}
        {sleeping && <span className={css.zzz}>💤</span>}
        {celebrating && <span className={css.spoutBurst}>💦</span>}
        <div className={sleeping ? `${whaleFace} ${css.whaleFaceSleep}` : whaleFace}>
          {stats.skin === 'pixel'
            ? <PixelWhale color={stats.color} className={css.skin} />
            : <SkeuoWhale color={stats.color} className={css.skin} />}
        </div>
      </div>

      <button
        type="button"
        className={css.badge}
        title={`${badgeLabel} · ${t('badge.label')}`}
        onClick={cycleBadgeMetric}
      >
        {stats.view === 'full' && <span className={css.badgeLabel}>{badgeLabel}</span>}
        {stats.view === 'full' && stats.badgeMetric === 'quota' && (
          <span className={css.badgeTrack}>
            <span
              className={stats.remaining <= stats.quota * 0.1 ? `${css.badgeFill} ${css.badgeFillLow}` : css.badgeFill}
              style={{ width: `${Math.round(Math.min(1, stats.quota <= 0 ? 1 : stats.used / stats.quota) * 100)}%` }}
            />
          </span>
        )}
        <span className={css.badgeText}>{badgeValue}</span>
      </button>

      {feedDrag !== null && rootRef.current !== null && (
        <div
          className={css.feedGhost}
          style={{
            left: feedDrag.x - rootRef.current.getBoundingClientRect().left,
            top: feedDrag.y - rootRef.current.getBoundingClientRect().top,
          }}
        >
          🪙
        </div>
      )}
    </div>
  )
}
