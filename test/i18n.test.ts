/**
 * i18n tests: locale selection, dictionary completeness, parameterized
 * strings.
 */

import { describe, expect, it } from 'vitest'

import { getMessages } from '../src/i18n'

describe('getMessages', () => {
  it('defaults to Chinese for unknown locales', () => {
    expect(getMessages('zh').costTitle).toContain('费用')
    expect(getMessages('fr' as never).costTitle).toContain('费用')
  })

  it('returns English for en', () => {
    expect(getMessages('en').costTitle).toBe('DeepSeek Cost · This Session')
  })

  it('zh and en dictionaries expose the same keys', () => {
    const zh = getMessages('zh')
    const en = getMessages('en')
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('parameterized strings produce locale-appropriate output', () => {
    const zh = getMessages('zh')
    const en = getMessages('en')
    expect(zh.peakState(2)).toBe('高峰 ×2')
    expect(en.peakState(2)).toBe('Peak ×2')
    expect(zh.peakPeriod(2)).toBe('高峰时段 (×2)')
    expect(en.peakPeriod(2)).toBe('Peak (×2)')
    // zh keeps Beijing-time wording; en uses the official UTC window.
    expect(zh.peakNote).toContain('高峰 ×2')
    expect(zh.peakNote).toContain('北京 9-12')
    expect(en.peakNote).toContain('UTC 01-04 / 06-10')
    expect(zh.currencySwitched('eur')).toBe('已切换货币: €')
    expect(en.currencySwitched('cny')).toBe('Currency: ¥')
  })

  it('cost sections and cross-refs follow the display currency', () => {
    const zh = getMessages('zh')
    const en = getMessages('en')
    expect(zh.costSection('cny')).toBe('费用 (官方价, ¥)')
    expect(zh.costSection('usd')).toContain('$')
    expect(zh.costSection('eur')).toContain('EUR')
    expect(en.costSection('eur')).toBe('Cost (EUR, converted from official)')
    expect(zh.crossRef('cny')).toBe('美元对照')
    expect(zh.crossRef('eur')).toBe('美元对照 (官方)')
    expect(en.crossRef('usd')).toBe('CNY (official)')
    expect(en.crossRef('eur')).toBe('USD (official)')
    // The EUR footnote states the conversion base and rate explicitly.
    expect(zh.eurNote(0.92)).toBe('欧元为换算值: 1 USD ≈ 0.92 EUR (deepseekCost.eurRate)')
    expect(en.eurNote(0.92)).toContain('1 USD ≈ 0.92 EUR')
  })

  it('all message values are non-empty', () => {
    for (const locale of ['zh', 'en'] as const) {
      const m = getMessages(locale)
      for (const [key, value] of Object.entries(m)) {
        if (typeof value === 'string') {
          expect(value.length, `${locale}.${key}`).toBeGreaterThan(0)
        } else {
          expect(typeof value, `${locale}.${key}`).toBe('function')
        }
      }
    }
  })
})
