/**
 * Overlay UI: the bordered floating dialog and the content builders for the
 * `/ds-cost` and `/ds-estimate` panels. All user-facing strings come from
 * i18n.ts, selected by the configured locale (settings.json
 * `deepseekCost.locale`).
 *
 * The display currency follows the locale: zh → CNY (¥), en → USD ($). Each
 * model's rates carry both currencies (see pricing.ts), and the same peak
 * multiplier applies to both.
 */

import type { Messages } from './i18n'
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent'

import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'

import { isPeakHour, loadDeepseekCostConfig, peakMultiplierFor } from './config'
import {
  formatCny,
  formatShortTokens,
  formatTokens,
  formatUsd,
  PANEL_CONTENT_W,
  PANEL_VALUE_W,
  row,
} from './format'
import { getMessages } from './i18n'
import {
  computeSessionTotals,
  DEEPSEEK_RATES,
  grandTotals,
  modelCostCny,
  modelCostUsd,
  sessionCostCny,
  sessionCostUsd,
  type ModelRate,
} from './pricing'

/**
 * A floating dialog rendered as an overlay: rounded border, title embedded in
 * the top border, content lines padded inside. Esc / Ctrl+C closes it.
 */
export class OverlayPanel {
  private onClose: (value?: 'toggle-lang' | undefined) => void

  constructor(
    private lines: string[],
    private title: string,
    private theme: Theme,
    onClose: (value?: 'toggle-lang' | undefined) => void,
  ) {
    this.onClose = onClose
  }

  handleInput(data: string): void {
    if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) {
      this.onClose()
    } else if (data === 'l' || data === 'L') {
      // Quick language toggle; the caller reopens the panel in the new locale.
      this.onClose('toggle-lang')
    }
  }

  render(width: number): string[] {
    const th = this.theme
    const innerW = Math.max(1, width - 2)
    const out: string[] = []

    const titleStr = truncateToWidth(` ${this.title} `, innerW)
    const titleW = visibleWidth(titleStr)
    const left = '─'.repeat(Math.floor((innerW - titleW) / 2))
    const right = '─'.repeat(Math.max(0, innerW - titleW - left.length))
    out.push(th.fg('border', `╭${left}`) + th.fg('accent', titleStr) + th.fg('border', `${right}╮`))

    for (const line of this.lines) {
      if (line === '') {
        out.push(th.fg('border', '│') + ' '.repeat(innerW) + th.fg('border', '│'))
        continue
      }
      // Wrap overflowing content instead of truncating; pad each wrapped
      // segment back to full width so the right border stays aligned.
      for (const wrapped of wrapTextWithAnsi(line, innerW)) {
        const padded = wrapped + ' '.repeat(Math.max(0, innerW - visibleWidth(wrapped)))
        out.push(th.fg('border', '│') + padded + th.fg('border', '│'))
      }
    }

    out.push(th.fg('border', `╰${'─'.repeat(innerW)}╯`))
    return out
  }

  invalidate(): void {}
}

/** A separator line spanning the content width. */
function separator(theme: Theme): string {
  return '  ' + theme.fg('dim', '─'.repeat(PANEL_CONTENT_W - 2))
}

/** Model line with the current model and its rate name, if known. */
function modelLine(
  m: Messages,
  theme: Theme,
  modelId: string | undefined,
  rateName: string | undefined,
): string {
  return `  ${theme.fg('muted', m.model)} ${modelId ?? '?'}${rateName ? ` (${rateName})` : ''}`
}

/** Peak/off-peak status line for the current time, or null when disabled. */
function peakStateLine(
  m: Messages,
  theme: Theme,
  config: ReturnType<typeof loadDeepseekCostConfig>,
): string | null {
  if (!config.peakPricing) return null
  const isPeak = isPeakHour(new Date(), config)
  const label = isPeak ? m.peakState(config.peakMultiplier) : m.offpeakState
  return `  ${theme.fg('muted', m.period)} ${theme.fg(isPeak ? 'warning' : 'dim', label)}`
}

/** Currency selection: zh → CNY (¥), en → USD ($). */
interface Money {
  /** Format an amount in the primary currency. */
  fmt: (n: number) => string
  /** Format an amount in the cross-reference currency. */
  crossFmt: (n: number) => string
  in: (r: ModelRate) => number
  read: (r: ModelRate) => number
  out: (r: ModelRate) => number
  /** Session total in the primary currency, or null when no known rate. */
  total: (totals: ReturnType<typeof computeSessionTotals>) => number | null
  /** Per-model cost in the primary currency. */
  modelCost: (
    t: ReturnType<typeof computeSessionTotals>['byModel'] extends Map<string, infer T> ? T : never,
  ) => number
}

function moneyFor(isCny: boolean): Money {
  return isCny
    ? {
        fmt: formatCny,
        crossFmt: formatUsd,
        in: (r) => r.input,
        read: (r) => r.cacheRead,
        out: (r) => r.output,
        total: sessionCostCny,
        modelCost: modelCostCny,
      }
    : {
        fmt: formatUsd,
        crossFmt: formatCny,
        in: (r) => r.usdInput,
        read: (r) => r.usdCacheRead,
        out: (r) => r.usdOutput,
        total: sessionCostUsd,
        modelCost: modelCostUsd,
      }
}

/** Build the `/ds-cost` panel content lines. */
export function buildCostPanelLines(ctx: ExtensionContext, theme: Theme): string[] {
  const totals = computeSessionTotals(ctx)
  const g = grandTotals(totals)
  const config = loadDeepseekCostConfig(ctx)
  const m = getMessages(config.locale)
  const money = moneyFor(config.locale === 'zh')
  const sessionTotal = money.total(totals)
  const currentModelId = ctx.model?.id
  const currentRate = currentModelId ? DEEPSEEK_RATES[currentModelId] : undefined

  const lines: string[] = []
  lines.push(modelLine(m, theme, currentModelId, currentRate?.name))
  const peakLine = peakStateLine(m, theme, config)
  if (peakLine !== null) lines.push(peakLine)
  lines.push(separator(theme))

  lines.push('')
  lines.push(`  ${theme.fg('muted', theme.bold(m.tokenUsage))}`)
  lines.push(row(theme.fg('dim', m.inputCacheHit), formatTokens(g.cacheRead)))
  lines.push(row(theme.fg('dim', m.inputCacheMiss), formatTokens(g.input)))
  lines.push(row(theme.fg('dim', m.output), formatTokens(g.output)))
  lines.push(row(theme.bold(m.total), theme.bold(formatTokens(g.totalTokens))))
  // Cache hit rate: cache-hit input / total input (cacheRead + cache-miss input).
  const totalInput = g.cacheRead + g.input
  const hitRate = totalInput > 0 ? (g.cacheRead / totalInput) * 100 : null
  lines.push(
    row(
      theme.fg('dim', m.cacheHitRate),
      hitRate !== null ? theme.fg('muted', `${hitRate.toFixed(1)}%`) : theme.fg('dim', '—'),
    ),
  )

  if (totals.byModel.size > 1) {
    lines.push('')
    lines.push(`  ${theme.fg('muted', theme.bold(m.perModel))}`)
    for (const [modelId, t] of totals.byModel) {
      if (modelId === 'unknown') continue
      lines.push(
        row(theme.fg('dim', modelId), theme.fg('muted', `${formatShortTokens(t.totalTokens)} tok`)),
      )
    }
  }

  lines.push('')
  lines.push(`  ${theme.fg('muted', theme.bold(m.costSection))}`)
  if (sessionTotal !== null) {
    if (totals.byModel.size === 1) {
      const first = [...totals.byModel.entries()][0]
      if (first) {
        const [modelId, t] = first
        const rate = DEEPSEEK_RATES[modelId]
        if (rate) {
          // Base (non-peak) rates, for reference.
          lines.push(
            row(
              theme.fg('dim', m.inputCacheHit),
              money.fmt((t.cacheRead * money.read(rate)) / 1_000_000),
            ),
          )
          lines.push(
            row(
              theme.fg('dim', m.inputCacheMiss),
              money.fmt((t.input * money.in(rate)) / 1_000_000),
            ),
          )
          lines.push(
            row(theme.fg('dim', m.output), money.fmt((t.output * money.out(rate)) / 1_000_000)),
          )
        }
      }
    } else {
      for (const [modelId, t] of totals.byModel) {
        const cost = money.modelCost(t)
        if (cost > 0 || t.totalTokens > 0) {
          lines.push(
            row(
              theme.fg('dim', modelId),
              `${money.fmt(cost)}  ${theme.fg('dim', formatShortTokens(t.totalTokens) + ' tok')}`,
            ),
          )
        }
      }
    }
    // Peak/off-peak split (only meaningful when peak pricing is enabled).
    if (config.peakPricing) {
      const offpeak = config.locale === 'zh' ? g.cny.offpeak : g.usd.offpeak
      const peak = config.locale === 'zh' ? g.cny.peak : g.usd.peak
      lines.push(row(theme.fg('dim', m.offpeakPeriod), theme.fg('muted', money.fmt(offpeak))))
      lines.push(
        row(
          theme.fg('dim', m.peakPeriod(config.peakMultiplier)),
          theme.fg('warning', money.fmt(peak)),
        ),
      )
    }
    lines.push(separator(theme))
    lines.push(
      row(
        theme.fg('success', theme.bold(m.sessionTotal)),
        theme.fg('success', theme.bold(money.fmt(sessionTotal))),
      ),
    )
    // Cross-currency reference: the other currency's session total.
    const crossTotal =
      config.locale === 'zh' ? g.usd.peak + g.usd.offpeak : g.cny.peak + g.cny.offpeak
    lines.push(row(theme.fg('dim', m.crossRef), theme.fg('muted', money.crossFmt(crossTotal))))
  } else {
    lines.push(`  ${theme.fg('warning', m.noKnownRate)}`)
  }

  lines.push('')
  if (config.peakPricing) {
    const hours = config.peakHours.map(([s, e]) => `${s}-${e}`).join(' / ')
    lines.push(`  ${theme.fg('dim', m.peakEnabled(config.peakMultiplier, hours))}`)
  } else {
    lines.push(`  ${theme.fg('dim', m.peakDisabled)}`)
  }
  lines.push(`  ${theme.fg('dim', `L ${m.langToggleHint} · ${m.escClose}`)}`)
  return lines
}

/** Result of an offline token estimate (from tokenizer.ts). */
export interface EstimateResult {
  text: string
  tokens: number
  unencodable: number
}

/** Build the `/ds-estimate` panel content lines. */
export function buildEstimatePanelLines(
  ctx: ExtensionContext,
  theme: Theme,
  estimate: EstimateResult,
): string[] {
  const { text, tokens, unencodable } = estimate
  const modelId = ctx.model?.id ?? 'unknown'
  const rate = DEEPSEEK_RATES[modelId]
  const config = loadDeepseekCostConfig(ctx)
  const m = getMessages(config.locale)
  const money = moneyFor(config.locale === 'zh')
  const nowMultiplier = peakMultiplierFor(new Date(), config)

  const out: string[] = []
  out.push(modelLine(m, theme, modelId, rate?.name))
  const peakLine = peakStateLine(m, theme, config)
  if (peakLine !== null) out.push(peakLine)
  out.push(separator(theme))
  out.push('')
  out.push(row(theme.fg('muted', m.textLength), `${formatTokens([...text].length)} 字符`))
  out.push(row(theme.fg('muted', m.tokenCount), theme.bold(formatTokens(tokens))))
  if (unencodable > 0) {
    out.push(`  ${theme.fg('warning', m.unencodable(unencodable))}`)
  }
  if (rate) {
    out.push('')
    out.push(`  ${theme.fg('muted', theme.bold(m.inputCostSection))}`)
    const miss = ((tokens * money.in(rate)) / 1_000_000) * nowMultiplier
    const hit = ((tokens * money.read(rate)) / 1_000_000) * nowMultiplier
    out.push(
      row(
        theme.fg('dim', m.cacheMiss),
        `${money.fmt(miss)}  ${theme.fg('dim', `(${money.fmt(money.in(rate))}/M${nowMultiplier > 1 ? ` ×${nowMultiplier}` : ''})`)}`,
      ),
    )
    out.push(
      row(
        theme.fg('dim', m.cacheHit),
        `${money.fmt(hit)}  ${theme.fg('dim', `(${money.fmt(money.read(rate))}/M${nowMultiplier > 1 ? ` ×${nowMultiplier}` : ''})`)}`,
      ),
    )
  } else {
    out.push('')
    out.push(`  ${theme.fg('warning', m.noRate)}`)
  }
  out.push('')
  out.push(`  ${theme.fg('dim', m.estimateNote)}`)
  out.push(`  ${theme.fg('dim', `L ${m.langToggleHint} · ${m.escClose}`)}`)
  return out
}

// PANEL_VALUE_W is referenced here only to keep the import graph obvious;
// actual usage lives in format.ts `row`. This re-export keeps panel imports tidy.
export { PANEL_VALUE_W }
