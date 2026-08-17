/**
 * Config tests: settings.json loading (global + project override), locale
 * handling, official peak-hour helpers, and writeLocale persistence. Legacy
 * peakPricing/peakMultiplier/peakHours keys are ignored.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { isPeakHour, loadDeepseekCostConfig, PEAK_MULTIPLIER, writeLocale } from '../src/config'
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
    // Legacy peak keys are silently ignored (peak pricing is intrinsic).
    expect(Object.keys(config).sort()).toEqual(['locale'])
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

  it('isPeakHour checks UTC hours directly against official windows', () => {
    // UTC 02:00 → peak (window [1,4))
    expect(isPeakHour(new Date('2025-01-01T02:00:00Z'))).toBe(true)
    // UTC 04:00 → off-peak (half-open [1,4))
    expect(isPeakHour(new Date('2025-01-01T04:00:00Z'))).toBe(false)
    // UTC 07:00 → peak (window [6,10))
    expect(isPeakHour(new Date('2025-01-01T07:00:00Z'))).toBe(true)
    // UTC 10:00 → off-peak (half-open [6,10))
    expect(isPeakHour(new Date('2025-01-01T10:00:00Z'))).toBe(false)
    // UTC 00:00 → off-peak
    expect(isPeakHour(new Date('2025-01-01T00:00:00Z'))).toBe(false)
  })

  it('treats window boundaries as half-open [start, end)', () => {
    // Window starts are peak: UTC 01:00 (start of [1,4)) and 06:00 (start of [6,10))
    expect(isPeakHour(new Date('2025-01-01T01:00:00Z'))).toBe(true)
    expect(isPeakHour(new Date('2025-01-01T06:00:00Z'))).toBe(true)
    // Window ends are off-peak: UTC 04:00 (end of [1,4)) and 10:00 (end of [6,10))
    expect(isPeakHour(new Date('2025-01-01T04:00:00Z'))).toBe(false)
    expect(isPeakHour(new Date('2025-01-01T10:00:00Z'))).toBe(false)
  })
})

describe('writeLocale', () => {
  it('persists locale and preserves other settings (incl. legacy keys)', () => {
    const e = env({ theme: 'dark', deepseekCost: { peakPricing: true }, packages: ['npm:x'] })
    expect(writeLocale('en')).toBe(true)
    const data = JSON.parse(readFileSync(join(e.dir, 'settings.json'), 'utf8'))
    expect(data.deepseekCost.locale).toBe('en')
    expect(data.deepseekCost.peakPricing).toBe(true)
    expect(data.theme).toBe('dark')
    expect(data.packages).toEqual(['npm:x'])
  })
})
