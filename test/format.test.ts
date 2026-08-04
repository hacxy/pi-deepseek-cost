/**
 * Formatting helper tests: token counts, money formatting, visible-width
 * alignment (CJK-aware).
 */

import { visibleWidth } from '@earendil-works/pi-tui'
import { describe, expect, it } from 'vitest'

import {
  alignRight,
  formatCny,
  formatShortTokens,
  formatTokens,
  formatUsd,
  padVisible,
  row,
} from '../src/format'

describe('formatTokens', () => {
  it('formats with thousands separators', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(1234)).toBe('1,234')
    expect(formatTokens(7200)).toBe('7,200')
    expect(formatTokens(1234567)).toBe('1,234,567')
  })
})

describe('formatShortTokens', () => {
  it('abbreviates large counts', () => {
    expect(formatShortTokens(999)).toBe('999')
    expect(formatShortTokens(1200)).toBe('1.2K')
    expect(formatShortTokens(26300000)).toBe('26.30M')
  })
})

describe('money formatting', () => {
  it('formats zero compactly', () => {
    expect(formatCny(0)).toBe('¥0')
    expect(formatUsd(0)).toBe('$0')
  })

  it('picks decimal precision by magnitude', () => {
    expect(formatCny(1.5)).toBe('¥1.50')
    expect(formatCny(0.019135)).toBe('¥0.019')
    expect(formatCny(0.00161)).toBe('¥0.0016')
    expect(formatCny(0.0000014)).toBe('¥0.000001')
    expect(formatUsd(0.14)).toBe('$0.140')
    expect(formatUsd(0.002764525)).toBe('$0.0028')
    expect(formatUsd(0.0000001)).toBe('$0.000000')
  })
})

describe('visible-width helpers', () => {
  it('pads by visible width (CJK counts as 2)', () => {
    expect(visibleWidth('模型')).toBe(4)
    expect(padVisible('模型', 6)).toBe('模型  ')
    expect(padVisible('ab', 6)).toBe('ab    ')
  })

  it('right-aligns by visible width', () => {
    expect(alignRight('¥1.5', 8)).toBe('    ¥1.5')
    expect(alignRight('中文', 6)).toBe('  中文')
  })

  it('row builds a two-column line', () => {
    const line = row('输入 · 缓存命中', '1,500')
    // label padded to 18 visible cols + 2 leading spaces + value right-aligned
    expect(line.startsWith('  输入 · 缓存命中')).toBe(true)
    expect(line.endsWith('1,500')).toBe(true)
    expect(visibleWidth(line)).toBe(20 + 34)
  })
})
