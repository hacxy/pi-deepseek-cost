/**
 * Bilingual UI strings (Chinese default, English optional).
 * The active locale is configured via settings.json `deepseekCost.locale`
 * ("zh" default | "en") — see config.ts.
 */

export type Locale = 'zh' | 'en'

export interface Messages {
  costTitle: string
  estimateTitle: string

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
  peakEnabled: (mult: number, hours: string) => string
  peakDisabled: string

  escClose: string
  /** Short hint shown in panels: "L <hint>". */
  langToggleHint: string

  textLength: string
  tokenCount: string
  unencodable: (n: number) => string
  inputCostSection: string
  cacheMiss: string
  cacheHit: string
  noRate: string
  estimateNote: string

  notDeepSeek: string
  usageEstimate: string
  costRequiresTui: string
  estimateRequiresTui: string
  tokenizerFailed: (err: string) => string
  langSwitched: (locale: Locale) => string
  langWriteFailed: string
}

const zh: Messages = {
  costTitle: 'DeepSeek 费用 · 本会话',
  estimateTitle: 'Token 估算 · 官方 tokenizer',

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
  peakEnabled: (mult, hours) => `提示: 峰谷计价已启用 (高峰 ×${mult}, 北京 ${hours} 点)`,
  peakDisabled:
    '提示: 峰谷计价未启用 — settings.json 中配置 deepseekCost.peakPricing 可启用 (高峰 ×2, 北京 9-12 / 14-18)',

  escClose: 'Esc 关闭',
  langToggleHint: '切换语言',

  textLength: '文本长度',
  tokenCount: 'Token 数',
  unencodable: (n) => `${n} 个符号无法编码`,
  inputCostSection: '输入费用 (按当前模型)',
  cacheMiss: '缓存未命中',
  cacheHit: '缓存命中',
  noRate: '当前模型无费率表',
  estimateNote: '注: 估算基于官方 deepseek_v3_tokenizer (V3 版), 实际计费以 API usage 为准',

  notDeepSeek: 'deepseek-cost: 当前模型不是 DeepSeek',
  usageEstimate: 'Usage: /ds-estimate <text>',
  costRequiresTui: 'cost requires interactive mode',
  estimateRequiresTui: 'estimate requires interactive mode',
  tokenizerFailed: (err) => `tokenizer failed: ${err}`,
  langSwitched: (locale) => (locale === 'zh' ? '已切换为中文' : 'Switched to English'),
  langWriteFailed: '写入 settings.json 失败',
}

const en: Messages = {
  costTitle: 'DeepSeek Cost · This Session',
  estimateTitle: 'Token Estimate · Official Tokenizer',

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
  peakEnabled: (mult, hours) => `Note: peak pricing enabled (peak ×${mult}, Beijing ${hours})`,
  peakDisabled:
    'Note: peak pricing disabled — enable via deepseekCost.peakPricing in settings.json (peak ×2, Beijing 9-12 / 14-18)',

  escClose: 'Esc to close',
  langToggleHint: 'toggle language',

  textLength: 'Text Length',
  tokenCount: 'Tokens',
  unencodable: (n) => `${n} unencodable symbol(s)`,
  inputCostSection: 'Input Cost (current model)',
  cacheMiss: 'Cache Miss',
  cacheHit: 'Cache Hit',
  noRate: 'No rate table for the current model',
  estimateNote:
    'Note: estimate uses the official deepseek_v3_tokenizer (V3); actual billing follows API usage',

  notDeepSeek: 'deepseek-cost: current model is not DeepSeek',
  usageEstimate: 'Usage: /ds-estimate <text>',
  costRequiresTui: 'cost requires interactive mode',
  estimateRequiresTui: 'estimate requires interactive mode',
  tokenizerFailed: (err) => `tokenizer failed: ${err}`,
  langSwitched: (locale) => (locale === 'zh' ? '已切换为中文' : 'Switched to English'),
  langWriteFailed: 'failed to write settings.json',
}

export function getMessages(locale: Locale): Messages {
  return locale === 'en' ? en : zh
}
