/**
 * Panel tests: content builders (zh/en currency, peak rows, estimate), and
 * the OverlayPanel component (L key, escape, wrapping, border alignment).
 */

import { visibleWidth } from '@earendil-works/pi-tui'
import { afterEach, describe, expect, it } from 'vitest'

import { buildCostPanelLines, buildEstimatePanelLines, OverlayPanel } from '../src/panel'
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
    // CNY: (1000*1 + 500*0.02 + 300*2)/1e6 = 0.00161
    expect(lines.join('\n')).toContain('¥0.0016')
    // USD cross-ref: 0.0002254
    expect(lines.join('\n')).toContain('$0.0002')
    expect(lines.join('\n')).toContain('L 切换语言 · Esc 关闭')
  })

  it('renders an English panel in USD with CNY cross-reference', () => {
    env({ deepseekCost: { locale: 'en' } })
    const h = makeHarness(FLASH_ENTRY())
    const lines = buildCostPanelLines(h.ctx, mockTheme()).join('\n')

    expect(lines).toContain('Cost (official, USD)')
    expect(lines).toContain('Session Total')
    expect(lines).toContain('$0.0002')
    expect(lines).toContain('CNY (official)')
    expect(lines).toContain('¥0.0016')
    expect(lines).toContain('L toggle language · Esc to close')
    expect(lines).not.toContain('合计')
  })

  it('shows peak/off-peak split when peak pricing is enabled', () => {
    env({
      deepseekCost: {
        locale: 'zh',
        peakPricing: true,
        peakMultiplier: 2,
      },
    })
    const entries = [
      usageEntry(
        'assistant',
        'deepseek-v4-flash',
        { input: 1000, output: 300 },
        '2025-01-01T02:00:00.000Z', // Beijing 10:00 → peak
      ),
    ]
    const h = makeHarness(entries)
    const lines = buildCostPanelLines(h.ctx, mockTheme()).join('\n')
    expect(lines).toContain('平时时段')
    expect(lines).toContain('高峰时段 (×2)')
    expect(lines).toContain('¥0.0032') // peak cost
    // Current-period label depends on the real clock; just check it renders.
    expect(lines).toMatch(/时段 (高峰|平时)/)
  })

  it('hides peak rows when peak pricing is disabled', () => {
    env({ deepseekCost: { locale: 'zh', peakPricing: false } })
    const h = makeHarness(FLASH_ENTRY())
    const lines = buildCostPanelLines(h.ctx, mockTheme()).join('\n')
    expect(lines).not.toContain('高峰时段')
    expect(lines).toContain('峰谷计价未启用')
  })

  it('warns when no known rate exists', () => {
    env({ deepseekCost: { locale: 'zh' } })
    const h = makeHarness([usageEntry('assistant', 'gpt-4o', { input: 100, output: 100 })])
    const lines = buildCostPanelLines(h.ctx, mockTheme()).join('\n')
    expect(lines).toContain('无已知费率')
  })
})

describe('buildEstimatePanelLines', () => {
  it('renders estimate with currency-following rates', () => {
    env({ deepseekCost: { locale: 'zh' } })
    const h = makeHarness([])
    const lines = buildEstimatePanelLines(h.ctx, mockTheme(), {
      text: 'hello world 你好',
      tokens: 10,
      unencodable: 0,
    }).join('\n')
    expect(lines).toContain('Token 数')
    expect(lines).toContain('10')
    expect(lines).toContain('¥1.00/M')
  })

  it('reports unencodable symbols', () => {
    env({ deepseekCost: { locale: 'zh' } })
    const h = makeHarness([])
    const lines = buildEstimatePanelLines(h.ctx, mockTheme(), {
      text: 'x',
      tokens: 1,
      unencodable: 2,
    }).join('\n')
    expect(lines).toContain('2 个符号无法编码')
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
