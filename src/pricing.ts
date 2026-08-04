/**
 * DeepSeek pricing and session usage aggregation.
 *
 * Token numbers come from the real `usage` blocks pi persists on messages
 * (input = cache-miss input, cacheRead = cache-hit input, output), matching
 * the DeepSeek API's prompt_cache_hit_tokens / prompt_cache_miss_tokens /
 * completion_tokens fields.
 *
 * Each model carries both official CNY rates and USD rates (the USD values are
 * pi's own model cost config for DeepSeek, so the USD display matches the rest
 * of the pi UI). Cost is computed per entry against its own timestamp, so
 * peak-hour pricing (when enabled, see config.ts) applies to the moment each
 * message happened, identically for both currencies.
 */

import type { ExtensionContext } from '@earendil-works/pi-coding-agent'

import { loadDeepseekCostConfig, peakMultiplierFor } from './config'

// ---------------------------------------------------------------------------
// Official pricing
// CNY: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
// USD: pi's built-in deepseek provider cost config (same source values)
// ---------------------------------------------------------------------------

export interface ModelRate {
  name: string
  /** cache-miss input, CNY per 1M tokens */
  input: number
  /** cache-hit input, CNY per 1M tokens */
  cacheRead: number
  /** output, CNY per 1M tokens */
  output: number
  /** cache-miss input, USD per 1M tokens */
  usdInput: number
  /** cache-hit input, USD per 1M tokens */
  usdCacheRead: number
  /** output, USD per 1M tokens */
  usdOutput: number
}

export const DEEPSEEK_RATES: Record<string, ModelRate> = {
  'deepseek-v4-flash': {
    name: 'DeepSeek V4 Flash',
    input: 1,
    cacheRead: 0.02,
    output: 2,
    usdInput: 0.14,
    usdCacheRead: 0.0028,
    usdOutput: 0.28,
  },
  'deepseek-v4-pro': {
    name: 'DeepSeek V4 Pro',
    input: 3,
    cacheRead: 0.025,
    output: 6,
    usdInput: 0.435,
    usdCacheRead: 0.003625,
    usdOutput: 0.87,
  },
}

// ---------------------------------------------------------------------------
// Totals aggregation
// ---------------------------------------------------------------------------

export interface ModelTotals {
  input: number
  cacheRead: number
  output: number
  totalTokens: number
  /** CNY cost, split by peak/off-peak (already multiplier-applied) */
  cny: { peak: number; offpeak: number }
  /** USD cost, split by peak/off-peak (already multiplier-applied) */
  usd: { peak: number; offpeak: number }
}

/** The usage shape pi persists on assistant/toolResult/compaction entries. */
interface UsageLike {
  input?: number
  cacheRead?: number
  cacheWrite?: number
  output?: number
  totalTokens?: number
}

export interface SessionTotals {
  byModel: Map<string, ModelTotals>
}

function emptyModelTotals(): ModelTotals {
  return {
    input: 0,
    cacheRead: 0,
    output: 0,
    totalTokens: 0,
    cny: { peak: 0, offpeak: 0 },
    usd: { peak: 0, offpeak: 0 },
  }
}

function addUsage(totals: ModelTotals, usage: UsageLike): void {
  totals.input += usage.input ?? 0
  totals.cacheRead += usage.cacheRead ?? 0
  // cacheWrite is billed as (untracked) input by DeepSeek; count it with input.
  totals.input += usage.cacheWrite ?? 0
  totals.output += usage.output ?? 0
  totals.totalTokens += usage.totalTokens ?? 0
}

/**
 * Walk every persisted session entry and aggregate usage.
 * This is the source of truth: it rebuilds correctly after /resume,
 * across branches, and includes nested tool LLM calls and compactions.
 */
export function computeSessionTotals(ctx: ExtensionContext): SessionTotals {
  const totals: SessionTotals = { byModel: new Map() }
  const config = loadDeepseekCostConfig(ctx)
  let lastModelId: string | undefined

  const getModelTotals = (modelId: string | undefined): ModelTotals => {
    const key = modelId ?? lastModelId ?? 'unknown'
    if (modelId) lastModelId = modelId
    let m = totals.byModel.get(key)
    if (!m) {
      m = emptyModelTotals()
      totals.byModel.set(key, m)
    }
    return m
  }

  for (const entry of ctx.sessionManager.getEntries()) {
    let usage: UsageLike
    let modelId: string | undefined

    if (entry.type === 'message') {
      const msg = entry.message
      // Only assistant and toolResult messages carry usage.
      const u = msg.role === 'assistant' || msg.role === 'toolResult' ? msg.usage : undefined
      if (!u) continue
      usage = u
      modelId = msg.role === 'assistant' ? (msg.model as string | undefined) : undefined
    } else if ((entry.type === 'compaction' || entry.type === 'branch_summary') && entry.usage) {
      // Compaction / branch summaries are LLM work too.
      usage = entry.usage
      modelId = undefined
    } else {
      continue
    }

    const m = getModelTotals(modelId)
    addUsage(m, usage)

    // Cost per entry in both currencies, peak-aware. cacheWrite is billed
    // as input.
    const rateKey = modelId ?? lastModelId ?? 'unknown'
    const rate = DEEPSEEK_RATES[rateKey]
    if (rate) {
      const inputTokens = (usage.input ?? 0) + (usage.cacheWrite ?? 0)
      const baseCny =
        (inputTokens * rate.input +
          (usage.cacheRead ?? 0) * rate.cacheRead +
          (usage.output ?? 0) * rate.output) /
        1_000_000
      const baseUsd =
        (inputTokens * rate.usdInput +
          (usage.cacheRead ?? 0) * rate.usdCacheRead +
          (usage.output ?? 0) * rate.usdOutput) /
        1_000_000
      const mult = peakMultiplierFor(new Date(entry.timestamp), config)
      if (mult > 1) {
        m.cny.peak += baseCny * mult
        m.usd.peak += baseUsd * mult
      } else {
        m.cny.offpeak += baseCny
        m.usd.offpeak += baseUsd
      }
    }
  }
  return totals
}

/** Aggregate every model's totals into one. */
export function grandTotals(session: SessionTotals): ModelTotals {
  const g = emptyModelTotals()
  for (const m of session.byModel.values()) {
    g.input += m.input
    g.cacheRead += m.cacheRead
    g.output += m.output
    g.totalTokens += m.totalTokens
    g.cny.peak += m.cny.peak
    g.cny.offpeak += m.cny.offpeak
    g.usd.peak += m.usd.peak
    g.usd.offpeak += m.usd.offpeak
  }
  return g
}

/** CNY cost for one model's usage (peak + off-peak, already applied). */
export function modelCostCny(m: ModelTotals): number {
  return m.cny.peak + m.cny.offpeak
}

/** USD cost for one model's usage (peak + off-peak, already applied). */
export function modelCostUsd(m: ModelTotals): number {
  return m.usd.peak + m.usd.offpeak
}

/**
 * Total CNY for the session, or null when no model had a known rate.
 */
export function sessionCostCny(session: SessionTotals): number | null {
  let total = 0
  let hasKnownRate = false
  for (const m of session.byModel.values()) {
    if (m.cny.peak > 0 || m.cny.offpeak > 0) hasKnownRate = true
    total += modelCostCny(m)
  }
  return hasKnownRate ? total : null
}

/** Total USD for the session, or null when no model had a known rate. */
export function sessionCostUsd(session: SessionTotals): number | null {
  let total = 0
  let hasKnownRate = false
  for (const m of session.byModel.values()) {
    if (m.usd.peak > 0 || m.usd.offpeak > 0) hasKnownRate = true
    total += modelCostUsd(m)
  }
  return hasKnownRate ? total : null
}
