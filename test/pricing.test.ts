/**
 * Pricing / aggregation tests: multi-model totals, dual-currency cost,
 * peak-hour multiplier, unknown-rate fallback, cacheWrite handling.
 */

import { afterEach, describe, expect, it } from 'vitest'

import {
  computeSessionTotals,
  grandTotals,
  modelCostCny,
  modelCostUsd,
  sessionCostCny,
  sessionCostUsd,
} from '../src/pricing'
import { compactionEntry, createSettingsEnv, makeHarness, usageEntry } from './helpers'

const restores: Array<() => void> = []
afterEach(() => {
  while (restores.length > 0) restores.pop()?.()
})

function env(settings: Record<string, unknown> = {}) {
  const e = createSettingsEnv(settings)
  restores.push(e.restore)
  return e
}

describe('computeSessionTotals', () => {
  it('aggregates a single-model session with dual-currency cost', () => {
    env()
    const entries = [
      usageEntry('assistant', 'deepseek-v4-flash', {
        input: 1000,
        cacheRead: 500,
        output: 300,
        totalTokens: 1800,
      }),
    ]
    const h = makeHarness(entries)
    const totals = computeSessionTotals(h.ctx)
    const m = totals.byModel.get('deepseek-v4-flash')!

    expect(m.input).toBe(1000)
    expect(m.cacheRead).toBe(500)
    expect(m.output).toBe(300)
    expect(m.totalTokens).toBe(1800)
    // CNY: (1000*1 + 500*0.02 + 300*2)/1e6 = 0.00161
    expect(modelCostCny(m)).toBeCloseTo(0.00161, 10)
    // USD: (1000*0.14 + 500*0.0028 + 300*0.28)/1e6 = 0.0002254
    expect(modelCostUsd(m)).toBeCloseTo(0.0002254, 10)
  })

  it('attributes toolResult usage to the last assistant model', () => {
    env()
    const entries = [
      usageEntry('assistant', 'deepseek-v4-flash', { input: 100, output: 50 }),
      usageEntry('toolResult', undefined, { input: 200, output: 100 }),
    ]
    const h = makeHarness(entries)
    const totals = computeSessionTotals(h.ctx)
    const m = totals.byModel.get('deepseek-v4-flash')!
    expect(m.input).toBe(300)
    expect(m.output).toBe(150)
  })

  it('includes compaction usage under the last known model', () => {
    env()
    const entries = [
      usageEntry('assistant', 'deepseek-v4-pro', { input: 1000, output: 100 }),
      compactionEntry({ input: 500, output: 100 }),
    ]
    const h = makeHarness(entries)
    const totals = computeSessionTotals(h.ctx)
    const m = totals.byModel.get('deepseek-v4-pro')!
    expect(m.input).toBe(1500)
    expect(m.output).toBe(200)
  })

  it('counts cacheWrite as input (DeepSeek bills it with input)', () => {
    env()
    const entries = [
      usageEntry('assistant', 'deepseek-v4-flash', {
        input: 100,
        cacheWrite: 400,
      }),
    ]
    const h = makeHarness(entries)
    const totals = computeSessionTotals(h.ctx)
    const m = totals.byModel.get('deepseek-v4-flash')!
    expect(m.input).toBe(500)
    // CNY input portion: 500 * 1 / 1e6 = 0.0005
    expect(modelCostCny(m)).toBeCloseTo(0.0005, 10)
  })

  it('splits per-model totals across model switches', () => {
    env()
    const entries = [
      usageEntry('assistant', 'deepseek-v4-flash', { input: 1000, output: 100 }),
      usageEntry('assistant', 'deepseek-v4-pro', { input: 2000, output: 200 }),
    ]
    const h = makeHarness(entries)
    const totals = computeSessionTotals(h.ctx)
    expect(totals.byModel.size).toBe(2)
    const flash = totals.byModel.get('deepseek-v4-flash')!
    const pro = totals.byModel.get('deepseek-v4-pro')!
    expect(flash.input).toBe(1000)
    expect(pro.input).toBe(2000)
    // flash: (1000*1 + 100*2)/1e6 = 0.0012 ; pro: (2000*3 + 200*6)/1e6 = 0.0072
    expect(modelCostCny(flash)).toBeCloseTo(0.0012, 10)
    expect(modelCostCny(pro)).toBeCloseTo(0.0072, 10)
    expect(sessionCostCny(totals)).toBeCloseTo(0.0084, 10)
  })

  it('returns null cost when no model has a known rate', () => {
    env()
    const entries = [usageEntry('assistant', 'gpt-4o', { input: 100, output: 100 })]
    const h = makeHarness(entries)
    const totals = computeSessionTotals(h.ctx)
    expect(sessionCostCny(totals)).toBeNull()
    expect(sessionCostUsd(totals)).toBeNull()
  })

  it('applies the peak multiplier to peak-hour messages only', () => {
    env({ deepseekCost: { peakPricing: true, peakMultiplier: 2 } })
    const entries = [
      // Beijing 10:00 (UTC 02:00) → peak
      usageEntry(
        'assistant',
        'deepseek-v4-flash',
        { input: 1000, output: 300 },
        '2025-01-01T02:00:00.000Z',
      ),
      // Beijing 13:00 (UTC 05:00) → off-peak
      usageEntry(
        'assistant',
        'deepseek-v4-flash',
        { input: 500, output: 100 },
        '2025-01-01T05:00:00.000Z',
      ),
    ]
    const h = makeHarness(entries)
    const totals = computeSessionTotals(h.ctx)
    const m = totals.byModel.get('deepseek-v4-flash')!
    // peak: (1000*1 + 300*2)/1e6 * 2 = 0.0032
    // off:  (500*1 + 100*2)/1e6 * 1 = 0.0007
    expect(m.cny.peak).toBeCloseTo(0.0032, 10)
    expect(m.cny.offpeak).toBeCloseTo(0.0007, 10)
    expect(modelCostCny(m)).toBeCloseTo(0.0039, 10)
    // USD mirror: peak (1000*0.14 + 300*0.28)/1e6 * 2 = 0.000448
    expect(m.usd.peak).toBeCloseTo(0.000448, 10)
  })

  it('grandTotals merges all models', () => {
    env()
    const entries = [
      usageEntry('assistant', 'deepseek-v4-flash', {
        input: 100,
        output: 10,
        totalTokens: 110,
      }),
      usageEntry('assistant', 'deepseek-v4-pro', {
        input: 200,
        output: 20,
        totalTokens: 220,
      }),
    ]
    const h = makeHarness(entries)
    const g = grandTotals(computeSessionTotals(h.ctx))
    expect(g.input).toBe(300)
    expect(g.output).toBe(30)
    expect(g.totalTokens).toBe(330)
  })
})
