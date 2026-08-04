/**
 * Peak/off-peak pricing configuration for DeepSeek.
 *
 * Loaded from the `deepseekCost` section of settings.json (global
 * `~/.pi/agent/settings.json` first, then project `.pi/settings.json` which
 * overrides). Read fresh on every call so config edits apply without a reload.
 *
 *   {
 *     "deepseekCost": {
 *       "peakPricing": true,               // apply peak multiplier during peak hours
 *       "peakMultiplier": 2,               // official: 2
 *       "peakHours": [[9, 12], [14, 18]]   // Beijing time (Asia/Shanghai)
 *     }
 *   }
 */

import type { Locale } from './i18n'
import type { ExtensionContext } from '@earendil-works/pi-coding-agent'

import { CONFIG_DIR_NAME, getAgentDir } from '@earendil-works/pi-coding-agent'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface DeepseekCostConfig {
  /** Apply the peak multiplier during peak hours. */
  peakPricing: boolean
  /** Price multiplier applied during peak hours (official: 2). */
  peakMultiplier: number
  /** Peak hour ranges in Asia/Shanghai time, [start, end) inclusive-start. */
  peakHours: [number, number][]
  /** UI language: "zh" (default) or "en". */
  locale: Locale
}

const DEFAULT_CONFIG: DeepseekCostConfig = {
  peakPricing: false,
  peakMultiplier: 2,
  peakHours: [
    [9, 12],
    [14, 18],
  ],
  locale: 'zh',
}

/**
 * Load the `deepseekCost` config from settings.json. Global settings first,
 * then project settings (`.pi/settings.json`) which override. Invalid values
 * fall back to the defaults (official DeepSeek rules).
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
  const validHours =
    Array.isArray(c.peakHours) &&
    c.peakHours.length > 0 &&
    c.peakHours.every(
      (p) =>
        Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number',
    )
  return {
    peakPricing: typeof c.peakPricing === 'boolean' ? c.peakPricing : DEFAULT_CONFIG.peakPricing,
    peakMultiplier:
      typeof c.peakMultiplier === 'number' && c.peakMultiplier > 0
        ? c.peakMultiplier
        : DEFAULT_CONFIG.peakMultiplier,
    peakHours: validHours ? (c.peakHours as [number, number][]) : DEFAULT_CONFIG.peakHours,
    locale: c.locale === 'en' || c.locale === 'zh' ? c.locale : DEFAULT_CONFIG.locale,
  }
}

/** Asia/Shanghai hour (UTC+8, no DST) of a date. */
function shanghaiHour(date: Date): number {
  return (date.getUTCHours() + 8) % 24
}

/** True when `date` falls inside a configured peak hour range. */
export function isPeakHour(date: Date, config: DeepseekCostConfig): boolean {
  const h = shanghaiHour(date)
  return config.peakHours.some(([start, end]) => h >= start && h < end)
}

/** Price multiplier for a timestamp (1 when peak pricing is disabled). */
export function peakMultiplierFor(date: Date, config: DeepseekCostConfig): number {
  return config.peakPricing && isPeakHour(date, config) ? config.peakMultiplier : 1
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
