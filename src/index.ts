/**
 * DeepSeek usage & cost tracker for pi.
 *
 * Features:
 *  - Footer status: live cumulative cost for the current session (CNY, USD,
 *    or EUR at the official rates, peak-aware). EUR is a conversion of the
 *    official USD prices at `deepseekCost.eurRate` — not official, and marked
 *    `≈` in the UI.
 *  - `/ds-cost` — floating overlay with per-model token usage, cost breakdown
 *    (peak-aware), and a cross-check in the other *official* currency.
 *
 * Only active when the model runs on the native DeepSeek provider (`provider`
 * === `deepseek`, i.e. billed by DeepSeek itself). DeepSeek models served by
 * any other provider or gateway (e.g. OpenRouter, OpenAI-compatible proxies)
 * keep the extension fully invisible: only DeepSeek's official billing can be
 * priced by this extension.
 *
 * Peak/off-peak pricing is official and intrinsic (see pricing.ts); the UI
 * language and display currency are configurable via the `deepseekCost`
 * section of settings.json — see config.ts for the schema.
 */

import type { Currency } from './i18n'
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'

import { isPeakHour, loadDeepseekCostConfig, writeCurrency } from './config'
import { formatCny, formatEur, formatUsd } from './format'
import { getMessages } from './i18n'
import { buildCostPanelLines, OverlayPanel } from './panel'
import { computeSessionTotals, sessionCostCny, sessionCostEur, sessionCostUsd } from './pricing'

// ---------------------------------------------------------------------------
// Model detection
// ---------------------------------------------------------------------------

/** True when the active model runs on the native DeepSeek provider. */
function isDeepSeekModel(ctx: ExtensionContext): boolean {
  const model = ctx.model
  if (!model) return false
  return model.provider === 'deepseek'
}

// ---------------------------------------------------------------------------
// Footer status
// ---------------------------------------------------------------------------

function updateStatus(ctx: ExtensionContext, now: Date = new Date()): void {
  // Non-DeepSeek models: keep the extension fully invisible.
  if (!isDeepSeekModel(ctx)) {
    ctx.ui.setStatus('ds-cost', undefined)
    return
  }
  // The status bar shows cost only (that's what the user watches). The
  // currency comes from config: cny/usd official, eur is a `≈`-marked
  // conversion of the official USD totals at the user rate.
  // No known-rate usage yet → show 0 rather than "n/a" for a cleaner feel.
  const totals = computeSessionTotals(ctx)
  const theme = ctx.ui.theme
  const config = loadDeepseekCostConfig(ctx)
  const { currency, eurRate } = config
  const fmt =
    currency === 'cny'
      ? formatCny
      : currency === 'usd'
        ? formatUsd
        : (n: number) => `≈${formatEur(n)}`
  const total =
    currency === 'cny'
      ? sessionCostCny(totals)
      : currency === 'usd'
        ? sessionCostUsd(totals)
        : sessionCostEur(totals, eurRate)
  const costText = total !== null ? theme.fg('success', fmt(total)) : theme.fg('dim', fmt(0))
  // Peak indicator: when the current time is inside an official peak window,
  // append a warning-colored lightning bolt so the footer shows peak is live.
  const peakMark = isPeakHour(now) ? theme.fg('warning', ' ⚡') : ''
  ctx.ui.setStatus('ds-cost', costText + peakMark)
}

// ---------------------------------------------------------------------------
// Footer refresh timer
// ---------------------------------------------------------------------------

/** How often to refresh the footer while idle (keeps the ⚡ peak indicator in
 * sync with peak-window boundaries). */
const FOOTER_REFRESH_MS = 30_000

let footerTimer: ReturnType<typeof setInterval> | undefined

/** Start the idle refresh loop for the current session. Idempotent. */
function startFooterTimer(ctx: ExtensionContext): void {
  stopFooterTimer()
  // Only the interactive TUI has a footer worth keeping fresh.
  if (ctx.mode !== 'tui') return
  footerTimer = setInterval(() => updateStatus(ctx), FOOTER_REFRESH_MS)
}

/** Stop the idle refresh loop. Safe to call when no timer is running. */
function stopFooterTimer(): void {
  if (footerTimer) {
    clearInterval(footerTimer)
    footerTimer = undefined
  }
}

// ---------------------------------------------------------------------------
// Currency switching
// ---------------------------------------------------------------------------

/** Cycle order for the display currency. */
const CURRENCIES: readonly Currency[] = ['cny', 'usd', 'eur']

/** Cycle cny → usd → eur → cny based on the current config. */
function nextCurrency(ctx: ExtensionContext): Currency {
  const cur = loadDeepseekCostConfig(ctx).currency
  return CURRENCIES[(CURRENCIES.indexOf(cur) + 1) % CURRENCIES.length] ?? 'cny'
}

/** Persist `currency` and refresh the status bar. Returns success. */
function applyCurrency(ctx: ExtensionContext, currency: Currency): boolean {
  const ok = writeCurrency(currency)
  if (ok) updateStatus(ctx)
  return ok
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Live footer status: refresh after each turn settles, and react to model
  // switches (hide when the active model is not DeepSeek).
  pi.on('session_start', (_event, ctx) => {
    updateStatus(ctx)
    startFooterTimer(ctx)
  })
  pi.on('session_shutdown', () => {
    stopFooterTimer()
  })
  pi.on('model_select', (_event, ctx) => {
    updateStatus(ctx)
  })
  pi.on('turn_end', (_event, ctx) => {
    updateStatus(ctx)
  })
  pi.on('agent_settled', (_event, ctx) => {
    updateStatus(ctx)
  })

  // Quick cycle via keyboard: ctrl+shift+L (customizable in keybindings).
  // Cycles the display currency ¥ → $ → €; the UI *language* is set only via
  // settings.json (`deepseekCost.locale`) — language and currency are separate.
  pi.registerShortcut('ctrl+shift+l', {
    description: 'Cycle DeepSeek cost display currency (¥ / $ / €)',
    handler: (ctx) => {
      const currency = nextCurrency(ctx)
      const m = getMessages(loadDeepseekCostConfig(ctx).locale)
      if (!applyCurrency(ctx, currency)) {
        ctx.ui.notify(m.writeFailed, 'error')
        return
      }
      ctx.ui.notify(m.currencySwitched(currency), 'info')
    },
  })

  // `/ds-cost` — detailed session cost panel, shown as a floating overlay.
  // Press L inside the panel to toggle the UI language (reopens in place).
  pi.registerCommand('ds-cost', {
    description: 'Show DeepSeek usage & cost for the current session',
    handler: async (_args, ctx) => {
      const m = getMessages(loadDeepseekCostConfig(ctx).locale)
      if (!isDeepSeekModel(ctx)) {
        ctx.ui.notify(m.notNativeDeepSeek(ctx.model?.provider ?? 'unknown'), 'info')
        return
      }
      if (ctx.mode !== 'tui') {
        ctx.ui.notify(m.costRequiresTui, 'error')
        return
      }
      for (;;) {
        const m = getMessages(loadDeepseekCostConfig(ctx).locale)
        const result = await ctx.ui.custom(
          (_tui, theme, _keybindings, done) =>
            new OverlayPanel(buildCostPanelLines(ctx, theme), m.costTitle, theme, done),
          {
            overlay: true,
            overlayOptions: {
              anchor: 'center',
              width: 60,
              maxHeight: '80%',
              visible: (termWidth) => termWidth >= 72,
            },
          },
        )
        if (result !== 'toggle-currency') return
        const currency = nextCurrency(ctx)
        if (!applyCurrency(ctx, currency)) {
          ctx.ui.notify(m.writeFailed, 'error')
          return
        }
        // Reopen the panel with the new currency (language unchanged).
      }
    },
  })
}
