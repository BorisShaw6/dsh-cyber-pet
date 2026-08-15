// @vitest-environment jsdom
/**
 * CyberPet and PetPanel presentation behavior with realistic props: the
 * greeting bubble, the turn-cost bubble, quiet-mode suppression, the panel
 * tabs (overview counters, local chat round-trip, settings mutations), and
 * the compact pill. Live data rides a scripted `usePetStats` double;
 * mutations record through verb doubles.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { CyberPet, type CyberPetProps } from '../src/client/CyberPet.tsx'
import { PetPanel } from '../src/client/PetPanel.tsx'
import { zh } from '../src/client/locales.ts'
import { localReply } from '../src/client/pet-brain.ts'
import { DEFAULT_CARDS, type PetStats } from '../src/client/tracker.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh)

function makeStats(overrides: Partial<PetStats> = {}): PetStats {
  return {
    sessionId: null,
    sessionCount: 3,
    running: false,
    sessionTokens: 1234,
    sessionTurns: 4,
    lastTurnTokens: null,
    lastTurnRevision: 0,
    totalTokens: 5000,
    totalTurns: 12,
    tokenRate: 0,
    contextTokens: 0,
    quota: 10000,
    used: 5000,
    remaining: 5000,
    skin: 'pixel',
    color: '#ffc53d',
    view: 'full',
    roam: { enabled: false, speedRatio: 1, range: 80 },
    chat: { mode: 'local', baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' },
    mode: 'active',
    napUntil: 0,
    name: '小深',
    badgeMetric: 'quota',
    cards: DEFAULT_CARDS.map(card => ({ ...card })),
    sound: true,
    restEvery: 8,
    restRevision: 0,
    fedCount: 0,
    milestoneRevision: 0,
    milestoneTotal: 0,
    digestTokens: null,
    muted: false,
    position: null,
    ...overrides,
  }
}

/** Scripted usePetStats double: selectors run over the supplied snapshot. */
function useStatsOf(stats: PetStats) {
  return ((selector?: (snapshot: PetStats) => unknown) =>
    selector === undefined ? stats : selector(stats)) as unknown as CyberPetProps['usePetStats']
}

function makeVerbs() {
  return {
    setSkin: vi.fn(),
    setColor: vi.fn(),
    setView: vi.fn(),
    setQuota: vi.fn(),
    setMode: vi.fn(),
    setName: vi.fn(),
    setBadgeMetric: vi.fn(),
    setCards: vi.fn(),
    setSound: vi.fn(),
    setRestEvery: vi.fn(),
    startNap: vi.fn(),
    wakeUp: vi.fn(),
    cycleBadgeMetric: vi.fn(),
    feed: vi.fn(() => 1),
    askHarness: vi.fn(async () => 'blub'),
    setMuted: vi.fn(),
    setRoam: vi.fn(),
    setChat: vi.fn(),
    setPosition: vi.fn(),
    resetTotals: vi.fn(),
    activeLocale: vi.fn(() => 'zh'),
    setLocale: vi.fn(),
  }
}

/** Shared panel header props (growth stage + mood). */
const panelLife = { levelKey: 'life.lvl0', moodEmoji: '😊' } as const

function openSettings(shown: ReturnType<typeof render>) {
  fireEvent.click(shown.getByText(zh['panel.tabs.settings']))
}

describe('CyberPet', () => {
  it('greets once on mount and shows the remaining-quota badge', () => {
    const verbs = makeVerbs()
    const shown = render(<CyberPet {...verbs} usePetStats={useStatsOf(makeStats())} t={t} />)
    expect(shown.getByText(zh['bubble.greeting'].replace('{name}', '小深'))).toBeTruthy()
    expect(shown.getByText('5k')).toBeTruthy()
  })

  it('suppresses the greeting in sleep mode', () => {
    const verbs = makeVerbs()
    const shown = render(<CyberPet {...verbs} usePetStats={useStatsOf(makeStats({ mode: 'sleep' }))} t={t} />)
    expect(shown.queryByText(zh['bubble.greeting'].replace('{name}', '小深'))).toBeNull()
  })

  it('reports a completed turn cost with the remaining budget', () => {
    const verbs = makeVerbs()
    const stats = makeStats({ lastTurnTokens: 321, lastTurnRevision: 2, remaining: 4679 })
    const shown = render(<CyberPet {...verbs} usePetStats={useStatsOf(stats)} t={t} />)
    expect(shown.getByText(/这轮对话花了 321 tokens/)).toBeTruthy()
    expect(shown.getByText(/还剩 4.7k/)).toBeTruthy()
  })

  it('warns when the remaining budget drops under ten percent', () => {
    const verbs = makeVerbs()
    const stats = makeStats({ lastTurnTokens: 900, lastTurnRevision: 1, remaining: 500 })
    const shown = render(<CyberPet {...verbs} usePetStats={useStatsOf(stats)} t={t} />)
    expect(shown.getByText(new RegExp(zh['bubble.quotaLow']))).toBeTruthy()
  })

  it('opens the usage panel on click and renders the compact pill in compact view', () => {
    const verbs = makeVerbs()
    const shown = render(<CyberPet {...verbs} usePetStats={useStatsOf(makeStats())} t={t} />)
    expect(shown.queryByRole('dialog')).toBeNull()
    fireEvent.click(shown.getByRole('button', { name: zh['aria.open'] }))
    expect(shown.getByRole('dialog')).toBeTruthy()
    cleanup()

    const compact = render(<CyberPet {...verbs} usePetStats={useStatsOf(makeStats({ view: 'compact' }))} t={t} />)
    expect(compact.getByText('5k')).toBeTruthy()
  })

  it('toggles the panel from the keyboard', () => {
    const verbs = makeVerbs()
    const shown = render(<CyberPet {...verbs} usePetStats={useStatsOf(makeStats())} t={t} />)
    fireEvent.keyDown(shown.getByRole('button', { name: zh['aria.open'] }), { key: 'Enter' })
    expect(shown.getByRole('dialog')).toBeTruthy()
  })
})

describe('PetPanel overview', () => {
  it('renders the quota bar and the counter grid', () => {
    const verbs = makeVerbs()
    const shown = render(<PetPanel {...verbs} {...panelLife} stats={makeStats()} t={t} />)
    expect(shown.getByText('小深')).toBeTruthy()
    expect(shown.getByText(`${zh['stats.used']} 5k / 10k`)).toBeTruthy()
    expect(shown.getByText(`${zh['stats.remaining']} 5k`)).toBeTruthy()
    expect(shown.getByText('1.2k')).toBeTruthy()
    expect(shown.getByText('—')).toBeTruthy()
    expect(shown.getByText('12')).toBeTruthy()
    expect(shown.getByText(String(3))).toBeTruthy()
  })
})

describe('PetPanel chat', () => {
  it('answers a greeting through the local brain', async () => {
    const verbs = makeVerbs()
    const shown = render(<PetPanel {...verbs} {...panelLife} stats={makeStats()} t={t} />)
    fireEvent.click(shown.getByText(zh['panel.tabs.chat']))
    const input = shown.getByPlaceholderText(zh['chat.placeholder'])
    fireEvent.change(input, { target: { value: '你好呀' } })
    fireEvent.click(shown.getByText(zh['chat.send']))
    // The reply lands on a microtask; findByText waits for it.
    expect(await shown.findByText(localReply('你好呀', makeStats(), t))).toBeTruthy()
  })

  it('switches the chat mode and shows the online endpoint fields', () => {
    const verbs = makeVerbs()
    const shown = render(<PetPanel {...verbs} {...panelLife} stats={makeStats()} t={t} />)
    fireEvent.click(shown.getByText(zh['panel.tabs.chat']))
    fireEvent.click(shown.getByText(zh['chat.mode.online']))
    expect(verbs.setChat).toHaveBeenCalledWith({ mode: 'online' })
    cleanup()

    // The verb double never mutates the snapshot, so render the online mode
    // straight from stats to cover the endpoint fields.
    const online = render(
      <PetPanel {...verbs} {...panelLife} stats={makeStats({ chat: { mode: 'online', baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' } })} t={t} />,
    )
    fireEvent.click(online.getByText(zh['panel.tabs.chat']))
    expect(online.getByPlaceholderText(zh['chat.online.base'])).toBeTruthy()
    expect(online.getByPlaceholderText(zh['chat.online.model'])).toBeTruthy()
  })
})

describe('PetPanel settings', () => {
  it('switches skins, colors, and the app language', () => {
    const verbs = makeVerbs()
    const shown = render(<PetPanel {...verbs} {...panelLife} stats={makeStats()} t={t} />)
    openSettings(shown)
    fireEvent.click(shown.getByText(zh['skin.skeuo']))
    expect(verbs.setSkin).toHaveBeenCalledWith('skeuo')
    fireEvent.click(shown.getByTitle(zh['color.blue']))
    expect(verbs.setColor).toHaveBeenCalledWith('#4d9fff')
    fireEvent.click(shown.getByText('English'))
    expect(verbs.setLocale).toHaveBeenCalledWith('en')
  })

  it('toggles roaming and forwards the sliders', () => {
    const verbs = makeVerbs()
    const shown = render(<PetPanel {...verbs} {...panelLife} stats={makeStats()} t={t} />)
    openSettings(shown)
    fireEvent.click(shown.getByText(zh['roam.enable']))
    expect(verbs.setRoam).toHaveBeenCalledWith({ enabled: true })
    const sliders = shown.getAllByRole('slider')
    fireEvent.change(sliders[0] as HTMLElement, { target: { value: '2' } })
    expect(verbs.setRoam).toHaveBeenCalledWith({ speedRatio: 2 })
  })

  it('commits a valid quota draft on save and ignores invalid input', () => {
    const verbs = makeVerbs()
    const shown = render(<PetPanel {...verbs} {...panelLife} stats={makeStats()} t={t} />)
    openSettings(shown)
    const input = shown.getByDisplayValue('10000')
    fireEvent.change(input, { target: { value: '20000' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(verbs.setQuota).toHaveBeenCalledWith(20000)

    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(verbs.setQuota).toHaveBeenCalledTimes(1)
  })

  it('switches the behavior mode and resets totals', () => {
    const verbs = makeVerbs()
    const shown = render(<PetPanel {...verbs} {...panelLife} stats={makeStats()} t={t} />)
    openSettings(shown)
    fireEvent.click(shown.getByText(zh['mode.sleep']))
    expect(verbs.setMode).toHaveBeenCalledWith('sleep')
    fireEvent.click(shown.getByText(zh['action.reset']))
    expect(verbs.resetTotals).toHaveBeenCalledTimes(1)
  })
})
