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
    expect(zh.unencodable(3)).toBe('3 个符号无法编码')
    expect(en.unencodable(3)).toBe('3 unencodable symbol(s)')
    expect(zh.langSwitched('zh')).toBe('已切换为中文')
    expect(en.langSwitched('en')).toBe('Switched to English')
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
