/**
 * DeepSeek pricing and session usage aggregation.
 *
 * Token numbers come from the real `usage` blocks pi persists on messages
 * (input = cache-miss input, cacheRead = cache-hit input, output), matching
 * the DeepSeek API's prompt_cache_hit_tokens / prompt_cache_miss_tokens /
 * completion_tokens fields.
 *
 * Each model carries both official CNY rates and the USD rates printed on the
 * DeepSeek pricing page. Since 2026-08-17 DeepSeek bills peak/off-peak (peak =
 * 2 × off-peak; peak hours are UTC 01:00–04:00 and 06:00–10:00 per the
 * official pricing page), each model stores both rate sets. Cost is computed
 * per entry against its own timestamp, so the peak/off-peak period at the
 * moment each message happened applies, identically for both currencies.
 */

import type { ExtensionContext } from '@earendil-works/pi-coding-agent'

import { isPeakHour } from './config'

// ---------------------------------------------------------------------------
// Official pricing
// CNY + USD: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
// (off-peak prices as printed on the page; peak = 2 × off-peak, official
// hours: UTC 01:00–04:00 and 06:00–10:00)
// ---------------------------------------------------------------------------

export interface ModelRate {
  name: string
  /** cache-miss input, CNY per 1M tokens (off-peak) */
  input: number
  /** cache-hit input, CNY per 1M tokens (off-peak) */
  cacheRead: number
  /** output, CNY per 1M tokens (off-peak) */
  output: number
  /** cache-miss input, USD per 1M tokens (off-peak) */
  usdInput: number
  /** cache-hit input, USD per 1M tokens (off-peak) */
  usdCacheRead: number
  /** output, USD per 1M tokens (off-peak) */
  usdOutput: number
  /** cache-miss input, CNY per 1M tokens (peak = 2 × off-peak) */
  peakInput: number
  /** cache-hit input, CNY per 1M tokens (peak) */
  peakCacheRead: number
  /** output, CNY per 1M tokens (peak) */
  peakOutput: number
  /** cache-miss input, USD per 1M tokens (peak) */
  peakUsdInput: number
  /** cache-hit input, USD per 1M tokens (peak) */
  peakUsdCacheRead: number
  /** output, USD per 1M tokens (peak) */
  peakUsdOutput: number
}

const FLASH_RATE: ModelRate = {
  name: 'DeepSeek V4 Flash',
  input: 1.5,
  cacheRead: 0.05,
  output: 4.5,
  usdInput: 0.22,
  usdCacheRead: 0.007,
  usdOutput: 0.66,
  peakInput: 3,
  peakCacheRead: 0.1,
  peakOutput: 9,
  peakUsdInput: 0.44,
  peakUsdCacheRead: 0.014,
  peakUsdOutput: 1.32,
}

const PRO_RATE: ModelRate = {
  name: 'DeepSeek V4 Pro',
  input: 4.5,
  cacheRead: 0.15,
  output: 13.5,
  usdInput: 0.66,
  usdCacheRead: 0.022,
  usdOutput: 1.98,
  peakInput: 9,
  peakCacheRead: 0.3,
  peakOutput: 27,
  peakUsdInput: 1.32,
  peakUsdCacheRead: 0.044,
  peakUsdOutput: 3.96,
}

export const DEEPSEEK_RATES: Record<string, ModelRate> = {
  'deepseek-v4-flash': FLASH_RATE,
  'deepseek-v4-pro': PRO_RATE,
  // Deprecated aliases (requests with these ids fail since 2026-07-24), kept
  // so usage persisted in older sessions still prices correctly. Both map to
  // the V4 Flash rates (chat = non-thinking, reasoner = thinking).
  'deepseek-chat': FLASH_RATE,
  'deepseek-reasoner': FLASH_RATE,
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

    // Cost per entry in both currencies, peak-aware. cacheWrite is billed as
    // input. Peak/off-peak pricing is official and intrinsic: pick the rate
    // set by the entry's own timestamp.
    const rateKey = modelId ?? lastModelId ?? 'unknown'
    const rate = DEEPSEEK_RATES[rateKey]
    if (rate) {
      const inputTokens = (usage.input ?? 0) + (usage.cacheWrite ?? 0)
      const peak = isPeakHour(new Date(entry.timestamp))
      const r = peak
        ? {
            in: rate.peakInput,
            read: rate.peakCacheRead,
            out: rate.peakOutput,
            usdIn: rate.peakUsdInput,
            usdRead: rate.peakUsdCacheRead,
            usdOut: rate.peakUsdOutput,
          }
        : {
            in: rate.input,
            read: rate.cacheRead,
            out: rate.output,
            usdIn: rate.usdInput,
            usdRead: rate.usdCacheRead,
            usdOut: rate.usdOutput,
          }
      const baseCny =
        (inputTokens * r.in + (usage.cacheRead ?? 0) * r.read + (usage.output ?? 0) * r.out) /
        1_000_000
      const baseUsd =
        (inputTokens * r.usdIn +
          (usage.cacheRead ?? 0) * r.usdRead +
          (usage.output ?? 0) * r.usdOut) /
        1_000_000
      if (peak) {
        m.cny.peak += baseCny
        m.usd.peak += baseUsd
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
