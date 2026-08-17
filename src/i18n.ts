/**
 * Bilingual UI strings (Chinese default, English optional).
 * The active locale is configured via settings.json `deepseekCost.locale`
 * ("zh" default | "en") — see config.ts.
 */

export type Locale = 'zh' | 'en'

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

  costSection: string
  offpeakPeriod: string
  peakPeriod: (mult: number) => string
  sessionTotal: string
  /** Cross-currency reference row label (the other currency's total). */
  crossRef: string
  noKnownRate: string
  /** Static note: official peak pricing is always in effect. */
  peakNote: string

  escClose: string
  /** Short hint shown in panels: "L <hint>". */
  langToggleHint: string

  notDeepSeek: string
  costRequiresTui: string
  langSwitched: (locale: Locale) => string
  langWriteFailed: string
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

  costSection: '费用 (官方价, ¥)',
  offpeakPeriod: '平时时段',
  peakPeriod: (mult) => `高峰时段 (×${mult})`,
  sessionTotal: '会话总费用',
  crossRef: '美元对照',
  noKnownRate: '无已知费率（非 DeepSeek 模型？）',
  peakNote: '官方峰谷计价: 高峰 ×2 (北京 9-12 / 14-18 点)',

  escClose: 'Esc 关闭',
  langToggleHint: '切换语言',

  notDeepSeek: 'deepseek-cost: 当前模型不是 DeepSeek',
  costRequiresTui: 'cost requires interactive mode',
  langSwitched: (locale) => (locale === 'zh' ? '已切换为中文' : 'Switched to English'),
  langWriteFailed: '写入 settings.json 失败',
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

  costSection: 'Cost (official, USD)',
  offpeakPeriod: 'Off-peak',
  peakPeriod: (mult) => `Peak (×${mult})`,
  sessionTotal: 'Session Total',
  crossRef: 'CNY (official)',
  noKnownRate: 'No known rate (not a DeepSeek model?)',
  peakNote: 'Official peak pricing: ×2 (UTC 01-04 / 06-10)',

  escClose: 'Esc to close',
  langToggleHint: 'toggle language',

  notDeepSeek: 'deepseek-cost: current model is not DeepSeek',
  costRequiresTui: 'cost requires interactive mode',
  langSwitched: (locale) => (locale === 'zh' ? '已切换为中文' : 'Switched to English'),
  langWriteFailed: 'failed to write settings.json',
}

export function getMessages(locale: Locale): Messages {
  return locale === 'en' ? en : zh
}
