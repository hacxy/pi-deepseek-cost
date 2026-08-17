/**
 * Panel tests: content builder (zh/en currency, official peak rows), and
 * the OverlayPanel component (L key, escape, wrapping, border alignment).
 */

import { visibleWidth } from '@earendil-works/pi-tui'
import { afterEach, describe, expect, it } from 'vitest'

import { buildCostPanelLines, OverlayPanel } from '../src/panel'
import { createSettingsEnv, makeHarness, mockTheme, usageEntry } from './helpers'

const restores: Array<() => void> = []
afterEach(() => {
  while (restores.length > 0) restores.pop()?.()
})

function env(settings: Record<string, unknown> = {}) {
  const e = createSettingsEnv(settings)
  restores.push(e.restore)
  return e
}

const FLASH_ENTRY = () => [
  usageEntry('assistant', 'deepseek-v4-flash', {
    input: 1000,
    cacheRead: 500,
    output: 300,
    totalTokens: 1800,
  }),
]

describe('buildCostPanelLines', () => {
  it('renders a Chinese cost panel with token usage and currency', () => {
    env({ deepseekCost: { locale: 'zh' } })
    const h = makeHarness(FLASH_ENTRY())
    const lines = buildCostPanelLines(h.ctx, mockTheme())

    expect(lines.join('\n')).toContain('Token 用量')
    expect(lines.join('\n')).toContain('输入 · 缓存命中')
    expect(lines.join('\n')).toContain('1,800')
    // CNY off-peak: (1000*1.5 + 500*0.05 + 300*4.5)/1e6 = 0.002875
    expect(lines.join('\n')).toContain('¥0.0029')
    // USD cross-ref: 0.0004215
    expect(lines.join('\n')).toContain('$0.0004')
    expect(lines.join('\n')).toContain('L 切换语言 · Esc 关闭')
  })

  it('renders an English panel in USD with CNY cross-reference', () => {
    env({ deepseekCost: { locale: 'en' } })
    const h = makeHarness(FLASH_ENTRY())
    const lines = buildCostPanelLines(h.ctx, mockTheme()).join('\n')

    expect(lines).toContain('Cost (official, USD)')
    expect(lines).toContain('Session Total')
    expect(lines).toContain('$0.0004')
    expect(lines).toContain('CNY (official)')
    expect(lines).toContain('¥0.0029')
    expect(lines).toContain('L toggle language · Esc to close')
    expect(lines).not.toContain('合计')
  })

  it('always shows the peak/off-peak split (official pricing)', () => {
    env({ deepseekCost: { locale: 'zh' } })
    const entries = [
      usageEntry(
        'assistant',
        'deepseek-v4-flash',
        { input: 1000, output: 300 },
        '2025-01-01T02:00:00.000Z', // UTC 02:00 → peak
      ),
    ]
    const h = makeHarness(entries)
    const lines = buildCostPanelLines(h.ctx, mockTheme()).join('\n')
    expect(lines).toContain('平时时段')
    expect(lines).toContain('高峰时段 (×2)')
    expect(lines).toContain('¥0.0057') // (1000*3 + 300*9)/1e6, flash peak
    // Current-period label depends on the real clock; just check it renders.
    expect(lines).toMatch(/时段 (高峰|平时)/)
    expect(lines).toContain('官方峰谷计价')
  })

  it('renders a zero-cost off-peak/peak split when peak pricing is intrinsic', () => {
    env({ deepseekCost: { locale: 'zh' } })
    const h = makeHarness(FLASH_ENTRY()) // off-peak timestamp → all off-peak
    const lines = buildCostPanelLines(h.ctx, mockTheme()).join('\n')
    expect(lines).toContain('高峰时段 (×2)')
    expect(lines).toContain('平时时段')
    expect(lines).toContain('官方峰谷计价')
  })

  it('warns when no known rate exists', () => {
    env({ deepseekCost: { locale: 'zh' } })
    const h = makeHarness([usageEntry('assistant', 'gpt-4o', { input: 100, output: 100 })])
    const lines = buildCostPanelLines(h.ctx, mockTheme()).join('\n')
    expect(lines).toContain('无已知费率')
  })
})

describe('OverlayPanel component', () => {
  const theme = mockTheme()

  function makePanel(done: (v?: 'toggle-lang' | undefined) => void) {
    return new OverlayPanel(
      ['  line one', '', '  line two with some content'],
      'Title',
      theme,
      done,
    )
  }

  it('closes with undefined on escape', () => {
    let result: 'toggle-lang' | undefined = 'toggle-lang'
    const panel = makePanel((v) => (result = v))
    panel.handleInput('\u001b') // raw ESC byte
    expect(result).toBeUndefined()
  })

  it('signals language toggle on L', () => {
    let result: 'toggle-lang' | undefined
    const panel = makePanel((v) => (result = v))
    panel.handleInput('l')
    expect(result).toBe('toggle-lang')
  })

  it('signals language toggle on uppercase L', () => {
    let result: 'toggle-lang' | undefined
    const panel = makePanel((v) => (result = v))
    panel.handleInput('L')
    expect(result).toBe('toggle-lang')
  })

  it('ignores other keys', () => {
    let result: 'toggle-lang' | undefined = 'toggle-lang'
    const panel = makePanel((v) => (result = v))
    panel.handleInput('x')
    expect(result).toBe('toggle-lang')
  })

  it('renders a bordered box with aligned widths', () => {
    const panel = makePanel(() => {})
    const lines = panel.render(40)
    const first = lines[0]!
    const last = lines.at(-1)!
    expect(first.startsWith('╭')).toBe(true)
    expect(first.endsWith('╮')).toBe(true)
    expect(last.startsWith('╰')).toBe(true)
    expect(last.endsWith('╯')).toBe(true)
    // All rendered lines have identical visible width.
    const widths = lines.map((l) => visibleWidth(l))
    expect(new Set(widths).size).toBe(1)
    expect(widths[0]).toBe(40)
  })

  it('wraps overflowing content instead of truncating', () => {
    const panel = new OverlayPanel(
      ['this line is definitely much too long for the width'],
      'T',
      theme,
      () => {},
    )
    const lines = panel.render(20)
    // Content line is split into at least 2 wrapped rows.
    const contentRows = lines.slice(1, -1)
    expect(contentRows.length).toBeGreaterThan(1)
    for (const row of contentRows) {
      expect(visibleWidth(row)).toBe(20)
    }
  })
})
