/**
 * DeepSeek cost configuration.
 *
 * Only the UI locale is user-configurable, via the `deepseekCost` section of
 * settings.json (global `~/.pi/agent/settings.json` first, then project
 * `.pi/settings.json` which overrides). Read fresh on every call so config
 * edits apply without a reload.
 *
 *   {
 *     "deepseekCost": {
 *       "locale": "zh"
 *     }
 *   }
 *
 * Peak/off-peak pricing is NOT configurable: since 2026-08-17 DeepSeek bills
 * peak ×2 during UTC 01:00–04:00 and 06:00–10:00 (off-peak is exactly half
 * of peak). The official rates are baked into pricing.ts. Legacy
 * `peakPricing` / `peakMultiplier` / `peakHours` keys in settings.json are
 * silently ignored.
 */

import type { Locale } from './i18n'
import type { ExtensionContext } from '@earendil-works/pi-coding-agent'

import { CONFIG_DIR_NAME, getAgentDir } from '@earendil-works/pi-coding-agent'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface DeepseekCostConfig {
  /** UI language: "zh" (default) or "en". */
  locale: Locale
}

/** Official peak-hour price multiplier (DeepSeek: peak = 2 × off-peak). */
export const PEAK_MULTIPLIER = 2

/**
 * Official peak-hour UTC windows, as printed on the DeepSeek pricing page
 * (https://api-docs.deepseek.com/quick_start/pricing): "Peak hours are UTC
 * 01:00–04:00 and 06:00–10:00." Half-open [start, end) — the same instants
 * as Beijing (UTC+8) 09:00–12:00 and 14:00–18:00.
 */
export const PEAK_HOURS_UTC: [number, number][] = [
  [1, 4],
  [6, 10],
]

const DEFAULT_CONFIG: DeepseekCostConfig = {
  locale: 'zh',
}

/**
 * Load the `deepseekCost` config from settings.json. Global settings first,
 * then project settings (`.pi/settings.json`) which override. Invalid values
 * fall back to the default. Unknown keys (e.g. legacy `peakPricing`,
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
  return {
    locale: c.locale === 'en' || c.locale === 'zh' ? c.locale : DEFAULT_CONFIG.locale,
  }
}

/** True when `date` falls inside an official peak-hour UTC window. */
export function isPeakHour(date: Date): boolean {
  const h = date.getUTCHours()
  return PEAK_HOURS_UTC.some(([start, end]) => h >= start && h < end)
}

/**
 * Persist the UI locale to the global settings.json (`deepseekCost.locale`),
 * preserving all other settings. Returns false when the file can't be written.
 */
export function writeLocale(locale: Locale): boolean {
  try {
    const path = join(getAgentDir(), 'settings.json')
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    } catch {
      // Missing or unparsable settings.json: start fresh.
    }
    const deepseekCost = (data.deepseekCost as Record<string, unknown>) ?? {}
    deepseekCost.locale = locale
    data.deepseekCost = deepseekCost
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
    return true
  } catch {
    return false
  }
}
