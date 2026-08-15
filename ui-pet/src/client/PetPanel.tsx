/**
 * PetPanel: the whale's dashboard — a modern glass card with three tabs.
 * Overview shows the user-composed card grid (visibility / size / order are
 * user settings) plus the quota bar and the PNG report export. Chat offers
 * three backends: the local rule brain, a browser-direct OpenAI-compatible
 * endpoint, and the host-side petChat Remote. Settings collects the pet
 * name, behavior mode, badge metric, skin and colors, roaming, rest
 * reminder, sounds, quota, language, and the card manager. Pure
 * presentation: the stats snapshot arrives as a plain prop, the mutation
 * verbs are the injected face, copy rides the locale seat.
 */
import { useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetActions } from './slots.ts'
import type { PetCardConfig, PetStats } from './tracker.ts'
import { COLOR_PRESETS } from './color.ts'
import { formatTokens, quotaRatio } from './display.ts'
import { levelOf } from './pet-life.ts'
import { localReply } from './pet-brain.ts'
import { onlineReply, type ChatTurn } from './pet-chat.ts'
import { exportReportCard } from './report-card.ts'
import css from './PetPanel.module.css'

/** Dashboard props: the live stats fact plus the mutation verbs. */
export interface PetPanelProps extends PetActions {
  /** The whole tracker snapshot at render time. */
  stats: PetStats
  /** Locale key of the current growth stage. */
  levelKey: 'life.lvl0' | 'life.lvl1' | 'life.lvl2' | 'life.lvl3'
  /** Mood emoji for the header. */
  moodEmoji: string
}

/** One rendered chat message. */
interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

type Tab = 'overview' | 'chat' | 'settings'

/** One labeled counter cell. */
function StatCell({ label, value, hint, size }: {
  label: string
  value: string
  hint?: string | undefined
  size: 's' | 'm' | 'l'
}) {
  const sizeClass = size === 's' ? css.statCellS : size === 'l' ? css.statCellL : ''
  return (
    <div className={sizeClass === '' ? css.statCell : `${css.statCell} ${sizeClass}`}>
      <div className={css.statValue}>{value}</div>
      <div className={css.statLabel}>{label}</div>
      {hint !== undefined && <div className={css.statHint}>{hint}</div>}
    </div>
  )
}

/** Segmented control (skin, view, chat mode, language, sizes). */
function Segment<T extends string>(props: {
  value: T
  options: readonly { value: T; label: string }[]
  onSelect: (value: T) => void
}) {
  return (
    <div className={css.segment}>
      {props.options.map(option => (
        <button
          key={option.value}
          type="button"
          className={option.value === props.value ? `${css.segmentBtn} ${css.segmentBtnActive}` : css.segmentBtn}
          onClick={() => props.onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Render the dashboard card.
 * @param props - stats snapshot, mutation verbs, and the `t` seat.
 */
export function PetPanel(props: PetPanelProps & PropsLocale<'pet'>) {
  const { stats, t } = props
  const [tab, setTab] = useState<Tab>('overview')
  const [draft, setDraft] = useState(String(stats.quota))
  const [nameDraft, setNameDraft] = useState(stats.name)
  const [restDraft, setRestDraft] = useState(String(stats.restEvery))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [pending, setPending] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // External setting changes re-seat the drafts.
  useEffect(() => {
    setDraft(String(stats.quota))
  }, [stats.quota])
  useEffect(() => {
    setNameDraft(stats.name)
  }, [stats.name])
  useEffect(() => {
    setRestDraft(String(stats.restEvery))
  }, [stats.restEvery])

  // Keep the newest chat line visible (scrollTop works in jsdom too).
  useEffect(() => {
    const list = chatScrollRef.current
    if (list !== null) list.scrollTop = list.scrollHeight
  }, [messages, pending])

  const ratio = quotaRatio(stats.used, stats.quota)
  const level = levelOf(stats.totalTokens)
  const commitQuota = () => {
    const parsed = Number(draft)
    if (Number.isFinite(parsed) && parsed >= 1) props.setQuota(parsed)
  }
  const commitRest = () => {
    const parsed = Number(restDraft)
    if (Number.isFinite(parsed)) props.setRestEvery(parsed)
  }

  /** The overview card roster: id → translated label + rendered value. */
  const cardDefs: Record<string, { label: string; value: string; hint?: string | undefined }> = {
    sessionTokens: { label: t('stats.sessionTokens'), value: formatTokens(stats.sessionTokens) },
    totalTokens: { label: t('stats.totalTokens'), value: formatTokens(stats.totalTokens) },
    lastTurn: { label: t('stats.lastTurn'), value: stats.lastTurnTokens === null ? '—' : formatTokens(stats.lastTurnTokens) },
    rate: { label: t('stats.rate'), value: String(stats.tokenRate), hint: t('stats.rateUnit').trim() },
    context: { label: t('stats.context'), value: formatTokens(stats.contextTokens) },
    sessionTurns: { label: t('stats.sessionTurns'), value: String(stats.sessionTurns) },
    totalTurns: { label: t('stats.totalTurns'), value: String(stats.totalTurns) },
    sessions: { label: t('stats.sessions'), value: String(stats.sessionCount) },
  }

  const moveCard = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= stats.cards.length) return
    const next = [...stats.cards]
    const [card] = next.splice(index, 1)
    next.splice(target, 0, card as PetCardConfig)
    props.setCards(next)
  }

  const sendChat = async () => {
    const text = chatInput.trim()
    if (text === '' || pending) return
    const history: ChatTurn[] = [
      ...messages.map(message => ({ role: message.role, content: message.text })),
      { role: 'user', content: text },
    ]
    setMessages([...messages, { role: 'user', text }])
    setChatInput('')
    setPending(true)
    try {
      let reply: string
      if (stats.chat.mode === 'online') {
        reply = await onlineReply({ baseUrl: stats.chat.baseUrl, apiKey: stats.chat.apiKey, model: stats.chat.model }, history)
      }
      else if (stats.chat.mode === 'harness') {
        reply = await props.askHarness(history)
      }
      else {
        reply = localReply(text, stats, t)
      }
      setMessages(current => [...current, { role: 'assistant', text: reply }])
    }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setMessages(current => [...current, { role: 'assistant', text: `${t('chat.error')}${detail}` }])
    }
    finally {
      setPending(false)
    }
  }

  const onExport = () => {
    exportReportCard(stats, stats.name, t(props.levelKey), {
      subtitle: t('panel.subtitle'),
      level: t(props.levelKey),
      used: t('stats.used'),
      remaining: t('stats.remaining'),
      totalTokens: t('stats.totalTokens'),
      totalTurns: t('stats.totalTurns'),
      sessions: t('stats.sessions'),
    })
  }

  return (
    <div className={css.panel} role="dialog" aria-label={stats.name} style={{ ['--pet-accent' as never]: stats.color }}>
      <div className={css.header}>
        <div className={css.headerText}>
          <div className={css.title}>
            <span>{props.moodEmoji}</span>
            <span>{stats.name}</span>
            <span className={css.levelChip}>
              {t(props.levelKey)}
              {level.toNext === null ? ` · ${t('life.max')}` : ` · ${t('life.next')} ${formatTokens(level.toNext)}`}
            </span>
          </div>
          <div className={css.subtitle}>
            {t('panel.subtitle')}
            <span className={stats.running ? `${css.statusDot} ${css.statusDotBusy}` : css.statusDot} />
            {stats.running ? t('stats.running') : t('stats.idle')}
          </div>
        </div>
        <div className={css.tabs}>
          {(['overview', 'chat', 'settings'] as const).map(name => (
            <button
              key={name}
              type="button"
              className={tab === name ? `${css.tab} ${css.tabActive}` : css.tab}
              onClick={() => setTab(name)}
            >
              {t(`panel.tabs.${name}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div className={css.body}>
          <div className={css.quotaBlock}>
            <div className={css.quotaMeta}>
              <span>{`${t('stats.used')} ${formatTokens(stats.used)} / ${formatTokens(stats.quota)}`}</span>
              <span className={css.remaining}>{`${t('stats.remaining')} ${formatTokens(stats.remaining)}`}</span>
            </div>
            <div className={css.quotaTrack}>
              <div
                className={ratio >= 1 ? `${css.quotaFill} ${css.quotaFillFull}` : css.quotaFill}
                style={{ width: `${Math.round(ratio * 1000) / 10}%` }}
              />
            </div>
          </div>
          <div className={css.statGrid}>
            {stats.cards.filter(card => card.visible).map(card => {
              const def = cardDefs[card.id]
              if (def === undefined) return null
              return <StatCell key={card.id} label={def.label} value={def.value} hint={def.hint} size={card.size} />
            })}
          </div>
          <button type="button" className={css.exportBtn} onClick={onExport}>📸 {t('report.export')}</button>
        </div>
      )}

      {tab === 'chat' && (
        <div className={css.body}>
          <div className={css.chatModeRow}>
            <Segment
              value={stats.chat.mode}
              options={[
                { value: 'local', label: t('chat.mode.local') },
                { value: 'online', label: t('chat.mode.online') },
                { value: 'harness', label: t('chat.mode.harness') },
              ] as const}
              onSelect={mode => props.setChat({ mode })}
            />
          </div>
          {stats.chat.mode === 'online' && (
            <div className={css.onlineForm}>
              <input
                className={css.field}
                placeholder={t('chat.online.base')}
                value={stats.chat.baseUrl}
                onChange={event => props.setChat({ baseUrl: event.target.value })}
              />
              <input
                className={css.field}
                type="password"
                placeholder={t('chat.online.key')}
                value={stats.chat.apiKey}
                onChange={event => props.setChat({ apiKey: event.target.value })}
              />
              <input
                className={css.field}
                placeholder={t('chat.online.model')}
                value={stats.chat.model}
                onChange={event => props.setChat({ model: event.target.value })}
              />
              <div className={css.onlineHint}>{t('chat.online.hint')}</div>
            </div>
          )}
          {stats.chat.mode === 'harness' && (
            <div className={css.onlineHint}>{t('chat.harness.hint')}</div>
          )}
          <div className={css.chatList} ref={chatScrollRef}>
            {messages.map((message, index) => (
              // Chat lines never reorder; positional identity is stable.
              // eslint-disable-next-line react/no-array-index-key
              <div key={index} className={message.role === 'user' ? `${css.chatLine} ${css.chatLineUser}` : css.chatLine}>
                {message.text}
              </div>
            ))}
            {pending && <div className={css.chatLine}>{`${t('chat.thinking')} 🐳`}</div>}
          </div>
          <div className={css.chatInputRow}>
            <input
              className={css.chatInput}
              placeholder={t('chat.placeholder')}
              value={chatInput}
              onChange={event => setChatInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void sendChat()
              }}
            />
            <button type="button" className={css.sendBtn} onClick={() => void sendChat()}>{t('chat.send')}</button>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className={css.body}>
          <div className={css.settingRow}>
            <span className={css.settingLabel}>{t('name.label')}</span>
            <div className={css.quotaEdit}>
              <input
                className={css.field}
                maxLength={20}
                value={nameDraft}
                onChange={event => setNameDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') props.setName(nameDraft)
                }}
              />
              <button type="button" className={css.miniBtn} onClick={() => props.setName(nameDraft)}>{t('action.save')}</button>
            </div>
          </div>

          <div className={css.settingRow}>
            <span className={css.settingLabel}>{t('mode.label')}</span>
            <Segment
              value={stats.mode}
              options={[
                { value: 'active', label: t('mode.active') },
                { value: 'standby', label: t('mode.standby') },
                { value: 'sleep', label: t('mode.sleep') },
              ] as const}
              onSelect={mode => props.setMode(mode)}
            />
          </div>

          <div className={css.settingRow}>
            <span className={css.settingLabel}>{t('badge.label')}</span>
            <Segment
              value={stats.badgeMetric}
              options={[
                { value: 'quota', label: t('badge.quota') },
                { value: 'context', label: t('badge.context') },
                { value: 'turns', label: t('badge.turns') },
              ] as const}
              onSelect={metric => props.setBadgeMetric(metric)}
            />
          </div>

          <div className={css.settingRow}>
            <span className={css.settingLabel}>{t('skin.label')}</span>
            <Segment
              value={stats.skin}
              options={[
                { value: 'pixel', label: t('skin.pixel') },
                { value: 'skeuo', label: t('skin.skeuo') },
              ] as const}
              onSelect={skin => props.setSkin(skin)}
            />
          </div>

          <div className={css.settingRow}>
            <span className={css.settingLabel}>{t('color.label')}</span>
            <div className={css.swatches}>
              {COLOR_PRESETS.map(preset => (
                <button
                  key={preset.hex}
                  type="button"
                  title={t(preset.key)}
                  className={stats.color === preset.hex ? `${css.swatch} ${css.swatchActive}` : css.swatch}
                  style={{ background: preset.hex }}
                  onClick={() => props.setColor(preset.hex)}
                />
              ))}
              <input
                type="color"
                className={css.colorInput}
                title={t('color.custom')}
                value={stats.color}
                onChange={event => props.setColor(event.target.value)}
              />
            </div>
          </div>

          <div className={css.settingRow}>
            <span className={css.settingLabel}>{t('view.label')}</span>
            <Segment
              value={stats.view}
              options={[
                { value: 'compact', label: t('view.compact') },
                { value: 'full', label: t('view.full') },
              ] as const}
              onSelect={view => props.setView(view)}
            />
          </div>

          <div className={css.settingRow}>
            <span className={css.settingLabel}>{t('lang.label')}</span>
            <Segment
              value={props.activeLocale()}
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
              ]}
              onSelect={id => props.setLocale(id)}
            />
          </div>

          <div className={css.settingBlock}>
            <label className={css.checkRow}>
              <input
                type="checkbox"
                className={css.checkbox}
                checked={stats.roam.enabled}
                onChange={event => props.setRoam({ enabled: event.target.checked })}
              />
              <span>{t('roam.enable')}</span>
            </label>
            <div className={css.sliderRow}>
              <span className={css.settingLabel}>{t('roam.speed')}</span>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.5"
                value={stats.roam.speedRatio}
                onChange={event => props.setRoam({ speedRatio: Number(event.target.value) })}
              />
              <span className={css.sliderValue}>{`×${stats.roam.speedRatio}`}</span>
            </div>
            <div className={css.sliderRow}>
              <span className={css.settingLabel}>{t('roam.range')}</span>
              <input
                type="range"
                min="20"
                max="100"
                step="10"
                value={stats.roam.range}
                onChange={event => props.setRoam({ range: Number(event.target.value) })}
              />
              <span className={css.sliderValue}>{`${stats.roam.range}%`}</span>
            </div>
            <div className={css.onlineHint}>{t('roam.hint')}</div>
          </div>

          <div className={css.settingBlock}>
            <div className={css.settingRow}>
              <span className={css.settingLabel}>{t('rest.every')}</span>
              <div className={css.quotaEdit}>
                <input
                  type="number"
                  min="2"
                  max="50"
                  className={css.field}
                  value={restDraft}
                  onChange={event => setRestDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') commitRest()
                  }}
                />
                <button type="button" className={css.miniBtn} onClick={commitRest}>{t('action.save')}</button>
              </div>
            </div>
            <label className={css.checkRow}>
              <input
                type="checkbox"
                className={css.checkbox}
                checked={stats.sound}
                onChange={event => props.setSound(event.target.checked)}
              />
              <span>{t('sound.label')}</span>
            </label>
          </div>

          <div className={css.settingBlock}>
            <div className={css.settingLabel}>{t('cards.label')}</div>
            {stats.cards.map((card, index) => {
              const def = cardDefs[card.id]
              if (def === undefined) return null
              return (
                <div key={card.id} className={css.cardRow}>
                  <input
                    type="checkbox"
                    className={css.checkbox}
                    checked={card.visible}
                    onChange={event => {
                      const next = [...stats.cards]
                      next[index] = { ...card, visible: event.target.checked }
                      props.setCards(next)
                    }}
                  />
                  <span className={css.cardLabel}>{def.label}</span>
                  <Segment
                    value={card.size}
                    options={[
                      { value: 's', label: t('cards.size.s') },
                      { value: 'm', label: t('cards.size.m') },
                      { value: 'l', label: t('cards.size.l') },
                    ] as const}
                    onSelect={size => {
                      const next = [...stats.cards]
                      next[index] = { ...card, size }
                      props.setCards(next)
                    }}
                  />
                  <button type="button" className={css.miniBtn} title={t('cards.up')} onClick={() => moveCard(index, -1)}>↑</button>
                  <button type="button" className={css.miniBtn} title={t('cards.down')} onClick={() => moveCard(index, 1)}>↓</button>
                </div>
              )
            })}
          </div>

          <div className={css.settingRow}>
            <span className={css.settingLabel}>{t('action.quotaLabel')}</span>
            <div className={css.quotaEdit}>
              <input
                type="number"
                min="1"
                className={css.field}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') commitQuota()
                }}
              />
              <button type="button" className={css.miniBtn} onClick={commitQuota}>{t('action.save')}</button>
            </div>
          </div>

          <button type="button" className={css.resetBtn} onClick={props.resetTotals}>{t('action.reset')}</button>
        </div>
      )}
    </div>
  )
}
