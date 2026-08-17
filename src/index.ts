/**
 * DeepSeek usage & cost tracker for pi.
 *
 * Features:
 *  - Footer status: live cumulative cost for the current session (CNY and
 *    USD at DeepSeek official rates, peak-aware).
 *  - `/ds-cost` — floating overlay with per-model token usage, CNY breakdown
 *    (peak-aware), USD cross-check.
 *
 * Only active when the model runs on the native DeepSeek provider (`provider`
 * === `deepseek`, i.e. billed by DeepSeek itself). DeepSeek models served by
 * any other provider or gateway (e.g. OpenRouter, OpenAI-compatible proxies)
 * keep the extension fully invisible: only DeepSeek's official billing can be
 * priced by this extension.
 *
 * Peak/off-peak pricing is official and intrinsic (see pricing.ts); only the
 * UI language is configurable via the `deepseekCost` section of settings.json
 * — see config.ts for the schema.
 */

import type { Locale } from './i18n'
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'

import { loadDeepseekCostConfig, writeLocale } from './config'
import { formatCny, formatUsd } from './format'
import { getMessages } from './i18n'
import { buildCostPanelLines, OverlayPanel } from './panel'
import { computeSessionTotals, sessionCostCny, sessionCostUsd } from './pricing'

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

function updateStatus(ctx: ExtensionContext): void {
  // Non-DeepSeek models: keep the extension fully invisible.
  if (!isDeepSeekModel(ctx)) {
    ctx.ui.setStatus('ds-cost', undefined)
    return
  }
  // The status bar shows cost only (that's what the user watches). The
  // currency follows the locale: zh → ¥ (CNY), en → $ (USD).
  // No known-rate usage yet → show 0 rather than "n/a" for a cleaner feel.
  const totals = computeSessionTotals(ctx)
  const theme = ctx.ui.theme
  const config = loadDeepseekCostConfig(ctx)
  const isCny = config.locale === 'zh'
  const fmt = isCny ? formatCny : formatUsd
  const total = isCny ? sessionCostCny(totals) : sessionCostUsd(totals)
  const costText = total !== null ? theme.fg('success', fmt(total)) : theme.fg('dim', fmt(0))
  ctx.ui.setStatus('ds-cost', costText)
}

// ---------------------------------------------------------------------------
// Language switching
// ---------------------------------------------------------------------------

/** Toggle zh ↔ en based on the current config. */
function nextLocale(ctx: ExtensionContext): Locale {
  return loadDeepseekCostConfig(ctx).locale === 'zh' ? 'en' : 'zh'
}

/** Persist `locale` and refresh the status bar. Returns success. */
function applyLocale(ctx: ExtensionContext, locale: Locale): boolean {
  const ok = writeLocale(locale)
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

  // Quick toggle via keyboard: ctrl+shift+L (customizable in keybindings).
  pi.registerShortcut('ctrl+shift+l', {
    description: 'Toggle DeepSeek cost UI language',
    handler: (ctx) => {
      const locale = nextLocale(ctx)
      const m = getMessages(locale)
      if (!applyLocale(ctx, locale)) {
        ctx.ui.notify(m.langWriteFailed, 'error')
        return
      }
      ctx.ui.notify(m.langSwitched(locale), 'info')
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
        if (result !== 'toggle-lang') return
        const locale = nextLocale(ctx)
        if (!applyLocale(ctx, locale)) {
          ctx.ui.notify(getMessages(locale).langWriteFailed, 'error')
          return
        }
        // Reopen the panel in the new language.
      }
    },
  })
}
