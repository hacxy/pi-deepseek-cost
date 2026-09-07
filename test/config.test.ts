/**
 * Config tests: settings.json loading (global + project override), locale and
 * currency handling, eurRate validation, official peak-hour helpers, and
 * writeCurrency persistence. Legacy peakPricing/peakMultiplier/peakHours keys
 * are ignored.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_EUR_RATE,
  isPeakHour,
  loadDeepseekCostConfig,
  PEAK_HOURS_UTC,
  PEAK_MULTIPLIER,
  writeCurrency,
} from '../src/config'
import { createSettingsEnv, makeHarness } from './helpers'

const restores: Array<() => void> = []
afterEach(() => {
  while (restores.length > 0) restores.pop()?.()
})

function env(settings: Record<string, unknown> = {}) {
  const e = createSettingsEnv(settings)
  restores.push(e.restore)
  return e
}

describe('loadDeepseekCostConfig', () => {
  it('defaults to zh when settings.json has no deepseekCost', () => {
    const e = env({})
    const h = makeHarness([])
    const config = loadDeepseekCostConfig(h.ctx)
    expect(config.locale).toBe('zh')
    expect(e.dir).toBeTruthy()
  })

  it('reads the locale from the global deepseekCost section', () => {
    env({
      deepseekCost: { locale: 'en', peakPricing: true, peakMultiplier: 3 },
    })
    const h = makeHarness([])
    const config = loadDeepseekCostConfig(h.ctx)
    expect(config.locale).toBe('en')
    // Legacy peak keys are silently ignored (peak pricing is intrinsic);
    // currency and eurRate are always resolved from the remaining settings.
    expect(Object.keys(config).sort()).toEqual(['currency', 'eurRate', 'locale'])
  })

  it('project settings override global settings', () => {
    const e = env({ deepseekCost: { locale: 'zh' } })
    const proj = join(e.dir, 'proj')
    const fake = createSettingsEnv({})
    restores.push(fake.restore)
    mkdirSync(join(proj, '.pi'), { recursive: true })
    writeFileSync(
      join(proj, '.pi', 'settings.json'),
      JSON.stringify({ deepseekCost: { locale: 'en' } }),
    )
    const h = makeHarness([])
    h.ctx.cwd = proj
    const config = loadDeepseekCostConfig(h.ctx)
    expect(config.locale).toBe('en')
  })

  it('falls back to zh for an invalid locale', () => {
    env({ deepseekCost: { locale: 'fr' } })
    const h = makeHarness([])
    const config = loadDeepseekCostConfig(h.ctx)
    expect(config.locale).toBe('zh')
  })
})

describe('peak hour helpers', () => {
  it('PEAK_MULTIPLIER is the official 2x', () => {
    expect(PEAK_MULTIPLIER).toBe(2)
  })

  it('PEAK_HOURS_UTC matches the official English pricing page (UTC 01:00-04:00 & 06:00-10:00)', () => {
    expect(PEAK_HOURS_UTC).toEqual([
      [1, 4],
      [6, 10],
    ])
  })

  it('isPeakHour reads the official UTC windows directly (no +8 conversion)', () => {
    // Window boundaries (half-open [start, end)):
    // UTC 01:00 → peak (start of the first window)
    expect(isPeakHour(new Date('2025-01-01T01:00:00Z'))).toBe(true)
    // UTC 04:00 → off-peak (first window ends; [1,4) is half-open)
    expect(isPeakHour(new Date('2025-01-01T04:00:00Z'))).toBe(false)
    // UTC 06:00 → peak (start of the second window)
    expect(isPeakHour(new Date('2025-01-01T06:00:00Z'))).toBe(true)
    // UTC 10:00 → off-peak (second window ends; [6,10) is half-open)
    expect(isPeakHour(new Date('2025-01-01T10:00:00Z'))).toBe(false)
    // Inside the windows (same instants as the previous Beijing-based checks):
    // UTC 02:00 → peak (= Beijing 10:00)
    expect(isPeakHour(new Date('2025-01-01T02:00:00Z'))).toBe(true)
    // UTC 07:00 → peak (= Beijing 15:00)
    expect(isPeakHour(new Date('2025-01-01T07:00:00Z'))).toBe(true)
    // UTC 00:00 → off-peak (= Beijing 08:00)
    expect(isPeakHour(new Date('2025-01-01T00:00:00Z'))).toBe(false)
  })
})

describe('currency & eurRate resolution', () => {
  it('defaults currency from the locale: zh → cny, en → usd', () => {
    const h = makeHarness([])
    env({ deepseekCost: { locale: 'zh' } })
    expect(loadDeepseekCostConfig(h.ctx).currency).toBe('cny')
  })

  it('honors an explicit currency override (eur)', () => {
    env({ deepseekCost: { currency: 'eur' } })
    const h = makeHarness([])
    expect(loadDeepseekCostConfig(h.ctx).currency).toBe('eur')
  })

  it('falls back to the locale default for an invalid currency', () => {
    env({ deepseekCost: { locale: 'en', currency: 'gbp' } })
    const h = makeHarness([])
    expect(loadDeepseekCostConfig(h.ctx).currency).toBe('usd')
  })

  it('defaults eurRate to the reference constant when unset', () => {
    env({ deepseekCost: { currency: 'eur' } })
    const h = makeHarness([])
    expect(loadDeepseekCostConfig(h.ctx).eurRate).toBe(DEFAULT_EUR_RATE)
  })

  it('accepts a positive finite eurRate from settings', () => {
    env({ deepseekCost: { eurRate: 1.06 } })
    const h = makeHarness([])
    expect(loadDeepseekCostConfig(h.ctx).eurRate).toBe(1.06)
  })

  it('rejects non-positive or non-numeric eurRate values', () => {
    const h = makeHarness([])
    env({ deepseekCost: { eurRate: 0 } })
    expect(loadDeepseekCostConfig(h.ctx).eurRate).toBe(DEFAULT_EUR_RATE)
    env({ deepseekCost: { eurRate: -0.5 } })
    expect(loadDeepseekCostConfig(h.ctx).eurRate).toBe(DEFAULT_EUR_RATE)
    env({ deepseekCost: { eurRate: 'x' } })
    expect(loadDeepseekCostConfig(h.ctx).eurRate).toBe(DEFAULT_EUR_RATE)
  })
})

describe('writeCurrency', () => {
  it('persists currency and preserves other settings (incl. legacy keys)', () => {
    const e = env({ theme: 'dark', deepseekCost: { peakPricing: true }, packages: ['npm:x'] })
    expect(writeCurrency('eur')).toBe(true)
    const data = JSON.parse(readFileSync(join(e.dir, 'settings.json'), 'utf8'))
    expect(data.deepseekCost.currency).toBe('eur')
    expect(data.deepseekCost.peakPricing).toBe(true)
    expect(data.theme).toBe('dark')
    expect(data.packages).toEqual(['npm:x'])
  })
})
