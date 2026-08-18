/**
 * Overlay UI: the bordered floating dialog and the content builder for the
 * `/ds-cost` panel. All user-facing strings come from i18n.ts, selected by the
 * configured locale (settings.json `deepseekCost.locale`).
 *
 * The display currency comes from config: cny/usd are official, eur is the
 * official USD totals × the user rate (see pricing.ts). Peak pricing is
 * official and always in effect; the panel always keeps one cross-reference
 * row in the other *official* currency so converted amounts stay verifiable.
 */

import type { Currency, Messages } from './i18n'
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent'

import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'

import { isPeakHour, loadDeepseekCostConfig, PEAK_MULTIPLIER } from './config'
import {
  formatCny,
  formatEur,
  formatShortTokens,
  formatTokens,
  formatUsd,
  PANEL_CONTENT_W,
  row,
} from './format'
import { getMessages } from './i18n'
import {
  computeSessionTotals,
  DEEPSEEK_RATES,
  grandTotals,
  modelCostCny,
  modelCostEur,
  modelCostUsd,
  sessionCostCny,
  sessionCostEur,
  sessionCostUsd,
  type ModelRate,
  type ModelTotals,
} from './pricing'

/**
 * A floating dialog rendered as an overlay: rounded border, title embedded in
 * the top border, content lines padded inside. Esc / Ctrl+C closes it.
 */
export class OverlayPanel {
  private onClose: (value?: 'toggle-currency' | undefined) => void

  constructor(
    private lines: string[],
    private title: string,
    private theme: Theme,
    onClose: (value?: 'toggle-currency' | undefined) => void,
  ) {
    this.onClose = onClose
  }

  handleInput(data: string): void {
    if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) {
      this.onClose()
    } else if (data === 'l' || data === 'L') {
      // Quick currency toggle; the caller reopens the panel in the new currency.
      this.onClose('toggle-currency')
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

/** Peak/off-peak status line for the current time (official, always shown). */
function peakStateLine(m: Messages, theme: Theme): string {
  const isPeak = isPeakHour(new Date())
  const label = isPeak ? m.peakState(PEAK_MULTIPLIER) : m.offpeakState
  return `  ${theme.fg('muted', m.period)} ${theme.fg(isPeak ? 'warning' : 'dim', label)}`
}

/** Currency selection: official CNY/USD, or EUR converted at the user rate. */
interface Money {
  /** Format an amount in the primary currency (EUR amounts carry `≈`). */
  fmt: (n: number) => string
  /** Format an amount in the cross-reference (other official) currency. */
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
  /** Grand-total off-peak cost in the primary currency. */
  offpeak: (g: ModelTotals) => number
  /** Grand-total peak cost in the primary currency. */
  peak: (g: ModelTotals) => number
  /** The other *official* currency's grand total (cross-reference). */
  crossTotal: (g: ModelTotals) => number
}

function moneyFor(currency: Currency, eurPerUsd: number): Money {
  if (currency === 'cny') {
    return {
      fmt: formatCny,
      crossFmt: formatUsd,
      in: (r) => r.input,
      read: (r) => r.cacheRead,
      out: (r) => r.output,
      total: sessionCostCny,
      modelCost: modelCostCny,
      offpeak: (g) => g.cny.offpeak,
      peak: (g) => g.cny.peak,
      crossTotal: (g) => g.usd.peak + g.usd.offpeak,
    }
  }
  if (currency === 'usd') {
    return {
      fmt: formatUsd,
      crossFmt: formatCny,
      in: (r) => r.usdInput,
      read: (r) => r.usdCacheRead,
      out: (r) => r.usdOutput,
      total: sessionCostUsd,
      modelCost: modelCostUsd,
      offpeak: (g) => g.usd.offpeak,
      peak: (g) => g.usd.peak,
      crossTotal: (g) => g.cny.peak + g.cny.offpeak,
    }
  }
  // EUR: official USD totals × user rate. `≈` marks it as a conversion.
  return {
    fmt: (n) => `≈${formatEur(n)}`,
    crossFmt: formatUsd,
    in: (r) => r.usdInput * eurPerUsd,
    read: (r) => r.usdCacheRead * eurPerUsd,
    out: (r) => r.usdOutput * eurPerUsd,
    total: (totals) => sessionCostEur(totals, eurPerUsd),
    modelCost: (t) => modelCostEur(t, eurPerUsd),
    offpeak: (g) => g.usd.offpeak * eurPerUsd,
    peak: (g) => g.usd.peak * eurPerUsd,
    crossTotal: (g) => g.usd.peak + g.usd.offpeak,
  }
}

/** Build the `/ds-cost` panel content lines. */
export function buildCostPanelLines(ctx: ExtensionContext, theme: Theme): string[] {
  const totals = computeSessionTotals(ctx)
  const g = grandTotals(totals)
  const config = loadDeepseekCostConfig(ctx)
  const m = getMessages(config.locale)
  const money = moneyFor(config.currency, config.eurRate)
  const sessionTotal = money.total(totals)
  const currentModelId = ctx.model?.id
  const currentRate = currentModelId ? DEEPSEEK_RATES[currentModelId] : undefined

  const lines: string[] = []
  lines.push(modelLine(m, theme, currentModelId, currentRate?.name))
  lines.push(peakStateLine(m, theme))
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
  lines.push(`  ${theme.fg('muted', theme.bold(m.costSection(config.currency)))}`)
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
    // Peak/off-peak split (official peak pricing, always shown).
    const offpeak = money.offpeak(g)
    const peak = money.peak(g)
    lines.push(row(theme.fg('dim', m.offpeakPeriod), theme.fg('muted', money.fmt(offpeak))))
    lines.push(
      row(theme.fg('dim', m.peakPeriod(PEAK_MULTIPLIER)), theme.fg('warning', money.fmt(peak))),
    )
    lines.push(separator(theme))
    lines.push(
      row(
        theme.fg('success', theme.bold(m.sessionTotal)),
        theme.fg('success', theme.bold(money.fmt(sessionTotal))),
      ),
    )
    // Cross-currency reference: the other *official* currency's total.
    const crossTotal = money.crossTotal(g)
    lines.push(
      row(
        theme.fg('dim', m.crossRef(config.currency)),
        theme.fg('muted', money.crossFmt(crossTotal)),
      ),
    )
  } else {
    lines.push(`  ${theme.fg('warning', m.noKnownRate)}`)
  }

  lines.push('')
  lines.push(`  ${theme.fg('dim', m.peakNote)}`)
  // EUR is a user-rate conversion, never an official price: say so in the panel.
  if (config.currency === 'eur') {
    lines.push(`  ${theme.fg('dim', m.eurNote(config.eurRate))}`)
  }
  lines.push(`  ${theme.fg('dim', `L ${m.currencyToggleHint} · ${m.escClose}`)}`)
  return lines
}

// PANEL_VALUE_W is exported from format.ts; panel content rows use it via
// `row` (see format.ts).
