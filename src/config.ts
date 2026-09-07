/**
 * DeepSeek cost configuration.
 *
 * UI locale and display currency are user-configurable via the
 * `deepseekCost` section of settings.json (global `~/.pi/agent/settings.json`
 * first, then project `.pi/settings.json` which overrides). Read fresh on
 * every call so config edits apply without a reload.
 *
 *   {
 *     "deepseekCost": {
 *       "locale": "zh",
 *       "currency": "eur",
 *       "eurRate": 0.92
 *     }
 *   }
 *
 * Peak/off-peak pricing is NOT configurable: since 2026-08-17 DeepSeek bills
 * peak ×2 during the official UTC peak windows 01:00–04:00 and 06:00–10:00
 * (= Beijing 09:00–12:00 and 14:00–18:00; off-peak is exactly half of peak).
 * The official rates are baked into pricing.ts. Legacy `peakPricing` /
 * `peakMultiplier` / `peakHours` keys in settings.json are silently ignored.
 */

import type { Currency, Locale } from './i18n'
import type { ExtensionContext } from '@earendil-works/pi-coding-agent'

import { CONFIG_DIR_NAME, getAgentDir } from '@earendil-works/pi-coding-agent'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface DeepseekCostConfig {
  /** UI language: "zh" (default) or "en". */
  locale: Locale
  /**
   * Display currency: explicit "cny" | "usd" | "eur", or derived from the
   * locale when unset (zh → cny, en → usd). "eur" is a conversion of the
   * official USD prices at `eurRate` — NOT an official DeepSeek currency.
   */
  currency: Currency
  /** EUR per 1 USD, used only when currency === "eur". Reference, not official. */
  eurRate: number
}

/**
 * Reference-only EUR-per-USD rate used when the user did not set
 * `deepseekCost.eurRate`. DeepSeek publishes no EUR prices — this default is
 * a rough placeholder; verify against your own source before relying on it.
 */
export const DEFAULT_EUR_RATE = 0.92

/** Currency when `deepseekCost.currency` is unset: follows the locale. */
export function resolveDefaultCurrency(locale: Locale): Currency {
  return locale === 'zh' ? 'cny' : 'usd'
}

/** Official peak-hour price multiplier (DeepSeek: peak = 2 × off-peak). */
export const PEAK_MULTIPLIER = 2

/**
 * Official peak-hour ranges in UTC, half-open [start, end), verbatim from the
 * official English pricing page — "Peak Hours: 01:00-04:00 and 06:00-10:00
 * (UTC)" (https://api-docs.deepseek.com/quick_start/pricing).
 */
export const PEAK_HOURS_UTC: [number, number][] = [
  [1, 4],
  [6, 10],
]

const DEFAULT_CONFIG: DeepseekCostConfig = {
  locale: 'zh',
  currency: 'cny',
  eurRate: DEFAULT_EUR_RATE,
}

/**
 * Load the `deepseekCost` config from settings.json. Global settings first,
 * then project settings (`.pi/settings.json`) which override. Invalid values
 * fall back to the defaults. Unknown keys (e.g. legacy `peakPricing`,
 * `peakMultiplier`, `peakHours`) are ignored.
 */
export function loadDeepseekCostConfig(ctx: ExtensionContext): DeepseekCostConfig {
  const merged: Record<string, unknown> = {}
  for (const path of [
    join(getAgentDir(), 'settings.json'),
    join(ctx.cwd, CONFIG_DIR_NAME, 'settings.json'),
  ]) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
        deepseekCost?: unknown
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.deepseekCost &&
        typeof parsed.deepseekCost === 'object'
      ) {
        Object.assign(merged, parsed.deepseekCost as Record<string, unknown>)
      }
    } catch {
      // Missing or unparsable settings.json: fall through to defaults.
    }
  }
  const c = merged as Partial<DeepseekCostConfig>
  const locale = c.locale === 'en' || c.locale === 'zh' ? c.locale : DEFAULT_CONFIG.locale
  const currency =
    c.currency === 'cny' || c.currency === 'usd' || c.currency === 'eur'
      ? c.currency
      : resolveDefaultCurrency(locale)
  const eurRate =
    typeof c.eurRate === 'number' && Number.isFinite(c.eurRate) && c.eurRate > 0
      ? c.eurRate
      : DEFAULT_EUR_RATE
  return { locale, currency, eurRate }
}

/** True when `date` falls inside an official peak-hour UTC window. */
export function isPeakHour(date: Date): boolean {
  const h = date.getUTCHours()
  return PEAK_HOURS_UTC.some(([start, end]) => h >= start && h < end)
}

/**
 * Persist a single `deepseekCost` field to the global settings.json,
 * preserving all other settings. Returns false when the file can't be written.
 */
function persistField(key: 'locale' | 'currency', value: string): boolean {
  try {
    const path = join(getAgentDir(), 'settings.json')
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    } catch {
      // Missing or unparsable settings.json: start fresh.
    }
    const deepseekCost = (data.deepseekCost as Record<string, unknown>) ?? {}
    deepseekCost[key] = value
    data.deepseekCost = deepseekCost
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
    return true
  } catch {
    return false
  }
}

/** Persist the display currency to the global settings.json (`currency`). */
export function writeCurrency(currency: Currency): boolean {
  return persistField('currency', currency)
}
