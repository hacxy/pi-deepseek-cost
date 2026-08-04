/**
 * Config tests: settings.json loading (global + project override), validation
 * fallbacks, locale handling, and writeLocale persistence.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { isPeakHour, loadDeepseekCostConfig, peakMultiplierFor, writeLocale } from '../src/config'
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
  it('uses defaults when settings.json has no deepseekCost', () => {
    const e = env({})
    const h = makeHarness([])
    const config = loadDeepseekCostConfig(h.ctx)
    expect(config.peakPricing).toBe(false)
    expect(config.peakMultiplier).toBe(2)
    expect(config.peakHours).toEqual([
      [9, 12],
      [14, 18],
    ])
    expect(config.locale).toBe('zh')
    expect(e.dir).toBeTruthy()
  })

  it('reads the global deepseekCost section', () => {
    env({
      deepseekCost: { peakPricing: true, peakMultiplier: 3, locale: 'en' },
    })
    const h = makeHarness([])
    const config = loadDeepseekCostConfig(h.ctx)
    expect(config.peakPricing).toBe(true)
    expect(config.peakMultiplier).toBe(3)
    expect(config.locale).toBe('en')
  })

  it('project settings override global settings', () => {
    const e = env({ deepseekCost: { peakPricing: true, locale: 'zh' } })
    // ctx.cwd points at a directory with .pi/settings.json that overrides.
    const proj = join(e.dir, 'proj')
    const fake = createSettingsEnv({})
    restores.push(fake.restore)
    mkdirSync(join(proj, '.pi'), { recursive: true })
    writeFileSync(
      join(proj, '.pi', 'settings.json'),
      JSON.stringify({ deepseekCost: { peakPricing: false } }),
    )
    const h = makeHarness([])
    h.ctx.cwd = proj
    const config = loadDeepseekCostConfig(h.ctx)
    expect(config.peakPricing).toBe(false)
  })

  it('falls back to defaults for invalid values', () => {
    env({
      deepseekCost: {
        peakPricing: 'yes' as unknown as boolean,
        peakMultiplier: -1,
        peakHours: 'bad' as unknown as [number, number][],
        locale: 'fr',
      },
    })
    const h = makeHarness([])
    const config = loadDeepseekCostConfig(h.ctx)
    expect(config.peakPricing).toBe(false)
    expect(config.peakMultiplier).toBe(2)
    expect(config.peakHours).toEqual([
      [9, 12],
      [14, 18],
    ])
    expect(config.locale).toBe('zh')
  })
})

describe('peak hour helpers', () => {
  const config = {
    peakPricing: true,
    peakMultiplier: 2,
    peakHours: [
      [9, 12],
      [14, 18],
    ] as [number, number][],
    locale: 'zh' as const,
  }

  it('isPeakHour checks Asia/Shanghai time (UTC+8)', () => {
    // Beijing 10:00 = UTC 02:00 → peak
    expect(isPeakHour(new Date('2025-01-01T02:00:00Z'), config)).toBe(true)
    // Beijing 12:00 = UTC 04:00 → off-peak (half-open [9,12))
    expect(isPeakHour(new Date('2025-01-01T04:00:00Z'), config)).toBe(false)
    // Beijing 15:00 = UTC 07:00 → peak
    expect(isPeakHour(new Date('2025-01-01T07:00:00Z'), config)).toBe(true)
    // Beijing 18:00 = UTC 10:00 → off-peak
    expect(isPeakHour(new Date('2025-01-01T10:00:00Z'), config)).toBe(false)
    // Beijing 08:00 = UTC 00:00 → off-peak
    expect(isPeakHour(new Date('2025-01-01T00:00:00Z'), config)).toBe(false)
  })

  it('peakMultiplierFor returns 1 when peak pricing is disabled', () => {
    const off = { ...config, peakPricing: false }
    expect(peakMultiplierFor(new Date('2025-01-01T02:00:00Z'), off)).toBe(1)
    expect(peakMultiplierFor(new Date('2025-01-01T02:00:00Z'), config)).toBe(2)
  })
})

describe('writeLocale', () => {
  it('persists locale and preserves other settings', () => {
    const e = env({ theme: 'dark', deepseekCost: { peakPricing: true }, packages: ['npm:x'] })
    expect(writeLocale('en')).toBe(true)
    const data = JSON.parse(readFileSync(join(e.dir, 'settings.json'), 'utf8'))
    expect(data.deepseekCost.locale).toBe('en')
    expect(data.deepseekCost.peakPricing).toBe(true)
    expect(data.theme).toBe('dark')
    expect(data.packages).toEqual(['npm:x'])
  })
})
