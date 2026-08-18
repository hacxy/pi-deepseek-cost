/**
 * Bilingual UI strings (Chinese default, English optional) and the display
 * currency vocabulary. The active locale and currency are configured via
 * settings.json `deepseekCost` (`locale`: "zh" default | "en"; `currency`:
 * defaults from locale — zh → cny, en → usd — or "eur") — see config.ts.
 */

export type Locale = 'zh' | 'en'

/**
 * Display currency for costs. `cny` and `usd` are DeepSeek official prices;
 * `eur` is a conversion of the official USD prices at the user-configured
 * `deepseekCost.eurRate` — NOT an official DeepSeek currency.
 */
export type Currency = 'cny' | 'usd' | 'eur'

/** Currency symbol for notifications and the status bar. */
export function currencySymbol(cur: Currency): string {
  return cur === 'cny' ? '¥' : cur === 'usd' ? '$' : '€'
}

export interface Messages {
  costTitle: string

  model: string
  period: string
  peakState: (mult: number) => string
  offpeakState: string

  tokenUsage: string
  inputCacheHit: string
  inputCacheMiss: string
  output: string
  total: string
  cacheHitRate: string
  perModel: string

  /** Cost section title for the primary display currency. */
  costSection: (cur: Currency) => string
  offpeakPeriod: string
  peakPeriod: (mult: number) => string
  sessionTotal: string
  /** Cross-reference row label (the other *official* currency's total). */
  crossRef: (cur: Currency) => string
  noKnownRate: string
  /** Static note: official peak pricing is always in effect. */
  peakNote: string
  /** Honesty footnote shown when the primary currency is EUR (a conversion). */
  eurNote: (rate: number) => string

  escClose: string
  /** Short hint shown in panels: "L <hint>". */
  currencyToggleHint: string

  /** Rejection when the active provider is not native DeepSeek. */
  notNativeDeepSeek: (provider: string) => string
  costRequiresTui: string
  currencySwitched: (cur: Currency) => string
  writeFailed: string
}

const zh: Messages = {
  costTitle: 'DeepSeek 费用 · 本会话',

  model: '模型',
  period: '时段',
  peakState: (mult) => `高峰 ×${mult}`,
  offpeakState: '平时',

  tokenUsage: 'Token 用量',
  inputCacheHit: '输入 · 缓存命中',
  inputCacheMiss: '输入 · 缓存未命中',
  output: '输出',
  total: '合计',
  cacheHitRate: '缓存命中率',
  perModel: '分模型',

  costSection: (cur) =>
    cur === 'cny'
      ? '费用 (官方价, ¥)'
      : cur === 'usd'
        ? '费用 (官方价, $)'
        : '费用 (EUR, 官方价换算)',
  offpeakPeriod: '平时时段',
  peakPeriod: (mult) => `高峰时段 (×${mult})`,
  sessionTotal: '会话总费用',
  crossRef: (cur) => {
    if (cur === 'cny') return '美元对照'
    if (cur === 'usd') return '人民币对照'
    return '美元对照 (官方)'
  },
  noKnownRate: '无已知费率（非 DeepSeek 模型？）',
  peakNote: '官方峰谷计价: 高峰 ×2 (北京 9-12 / 14-18 点)',
  eurNote: (rate) => `欧元为换算值: 1 USD ≈ ${rate} EUR (deepseekCost.eurRate)`,

  escClose: 'Esc 关闭',
  currencyToggleHint: '切换货币',

  notNativeDeepSeek: (provider) => `deepseek-cost: 仅 DeepSeek 原生供应商启用（当前: ${provider}）`,
  costRequiresTui: 'cost requires interactive mode',
  currencySwitched: (cur) => `已切换货币: ${currencySymbol(cur)}`,
  writeFailed: '写入 settings.json 失败',
}

const en: Messages = {
  costTitle: 'DeepSeek Cost · This Session',

  model: 'Model',
  period: 'Period',
  peakState: (mult) => `Peak ×${mult}`,
  offpeakState: 'Off-peak',

  tokenUsage: 'Token Usage',
  inputCacheHit: 'Input · Cache Hit',
  inputCacheMiss: 'Input · Cache Miss',
  output: 'Output',
  total: 'Total',
  cacheHitRate: 'Cache Hit Rate',
  perModel: 'By Model',

  costSection: (cur) =>
    cur === 'cny'
      ? 'Cost (official, CNY)'
      : cur === 'usd'
        ? 'Cost (official, USD)'
        : 'Cost (EUR, converted from official)',
  offpeakPeriod: 'Off-peak',
  peakPeriod: (mult) => `Peak (×${mult})`,
  sessionTotal: 'Session Total',
  crossRef: (cur) => (cur === 'usd' ? 'CNY (official)' : 'USD (official)'),
  noKnownRate: 'No known rate (not a DeepSeek model?)',
  peakNote: 'Official peak pricing: ×2 (UTC 01-04 / 06-10)',
  eurNote: (rate) => `EUR is a conversion: 1 USD ≈ ${rate} EUR (deepseekCost.eurRate)`,

  escClose: 'Esc to close',
  currencyToggleHint: 'toggle currency',

  notNativeDeepSeek: (provider) =>
    `deepseek-cost: enabled only for the native DeepSeek provider (current: ${provider})`,
  costRequiresTui: 'cost requires interactive mode',
  currencySwitched: (cur) => `Currency: ${currencySymbol(cur)}`,
  writeFailed: 'failed to write settings.json',
}

export function getMessages(locale: Locale): Messages {
  return locale === 'en' ? en : zh
}
