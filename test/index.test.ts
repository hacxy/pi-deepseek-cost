/**
 * Extension entry tests: event wiring, status bar behavior (model-aware),
 * command guards, shortcut currency cycle, and the in-panel L-key loop.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadDeepseekCostConfig } from '../src/config'
import { createSettingsEnv, flush, makeHarness, shutdownHarnesses, usageEntry } from './helpers'

const restores: Array<() => void> = []
afterEach(() => {
  shutdownHarnesses()
  vi.useRealTimers()
  while (restores.length > 0) restores.pop()?.()
})

function env(settings: Record<string, unknown> = {}) {
  const e = createSettingsEnv(settings)
  restores.push(e.restore)
  return e
}

describe('event wiring', () => {
  it('subscribes to session/model/turn events', () => {
    env()
    const h = makeHarness([])
    for (const name of ['session_start', 'model_select', 'turn_end', 'agent_settled']) {
      expect(h.handlers[name]?.length, name).toBeGreaterThan(0)
    }
  })

  it('registers ds-cost command, no ds-estimate/ds-lang', () => {
    env()
    const h = makeHarness([])
    expect(h.commands['ds-cost']).toBeDefined()
    expect(h.commands['ds-estimate']).toBeUndefined()
    expect(h.commands['ds-lang']).toBeUndefined()
    expect(h.shortcuts['ctrl+shift+l']).toBeDefined()
  })
})

describe('status bar (updateStatus)', () => {
  it('shows CNY cost for deepseek model sessions', async () => {
    env({ deepseekCost: { locale: 'zh' } })
    const h = makeHarness([
      usageEntry('assistant', 'deepseek-v4-flash', {
        input: 1000,
        output: 300,
        totalTokens: 1300,
      }),
    ])
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(h.statuses.at(-1)).toContain('¥0.0029')
  })

  it('clears the status for non-DeepSeek models', async () => {
    env()
    const h = makeHarness([])
    h.ctx.model = { id: 'gpt-4o', provider: 'openai' } as unknown as typeof h.ctx.model
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(h.statuses.at(-1)).toBeUndefined()
  })

  it('keeps DeepSeek models on other providers invisible (id prefix alone is not enough)', async () => {
    env()
    const h = makeHarness([])
    // OpenRouter-style id that merely starts with "deepseek/…"
    h.ctx.model = {
      id: 'deepseek/deepseek-chat',
      provider: 'openrouter',
    } as unknown as typeof h.ctx.model
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(h.statuses.at(-1)).toBeUndefined()
    // User's real scenario: opencode gateway serving a DeepSeek-named model
    h.ctx.model = { id: 'deepseek-v4-flash', provider: 'opencode' } as unknown as typeof h.ctx.model
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(h.statuses.at(-1)).toBeUndefined()
  })

  it('activates for any model id on the native deepseek provider (unknown ids included)', async () => {
    env()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T11:00:00Z')) // off-peak
    const h = makeHarness([])
    h.ctx.model = {
      id: 'deepseek-future-gen',
      provider: 'deepseek',
    } as unknown as typeof h.ctx.model
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(h.statuses.at(-1)).toBe('¥0')
  })

  it('shows USD for en locale', async () => {
    env({ deepseekCost: { locale: 'en' } })
    const h = makeHarness([
      usageEntry('assistant', 'deepseek-v4-flash', {
        input: 1000,
        output: 300,
        totalTokens: 1300,
      }),
    ])
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(h.statuses.at(-1)).toContain('$0.0004')
  })

  it('shows ¥0 for an empty session', async () => {
    env({ deepseekCost: { locale: 'zh' } })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T11:00:00Z')) // off-peak
    const h = makeHarness([])
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(h.statuses.at(-1)).toBe('¥0')
  })

  it('shows ≈€ cost for the eur currency (official USD × user rate)', async () => {
    env({ deepseekCost: { locale: 'zh', currency: 'eur', eurRate: 0.5 } })
    const h = makeHarness([
      usageEntry('assistant', 'deepseek-v4-flash', {
        input: 1000,
        output: 300,
        totalTokens: 1300,
      }),
    ])
    await h.handlers.session_start![0]!({}, h.ctx)
    // USD: (1000*0.22 + 300*0.66)/1e6 = 0.000418 → ×0.5 = 0.000209
    expect(h.statuses.at(-1)).toContain('≈€0.0002')
  })
})

describe('footer peak indicator', () => {
  it('appends ⚡ during peak windows', async () => {
    env({ deepseekCost: { locale: 'zh' } })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T02:00:00Z')) // peak (UTC 01:00–04:00)
    const h = makeHarness([])
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(h.statuses.at(-1)).toBe('¥0 ⚡')
  })

  it('omits ⚡ outside peak windows', async () => {
    env({ deepseekCost: { locale: 'zh' } })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T11:00:00Z'))
    const h = makeHarness([])
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(h.statuses.at(-1)).toBe('¥0')
  })
})

describe('footer refresh timer', () => {
  it('starts on session_start and clears on session_shutdown', async () => {
    env()
    vi.useFakeTimers()
    const h = makeHarness([])
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(vi.getTimerCount()).toBe(1)
    await h.handlers.session_shutdown![0]!({}, h.ctx)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('is idempotent across repeated session_start calls', async () => {
    env()
    vi.useFakeTimers()
    const h = makeHarness([])
    await h.handlers.session_start![0]!({}, h.ctx)
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('does not start a timer outside TUI mode', async () => {
    env()
    vi.useFakeTimers()
    const h = makeHarness([])
    ;(h.ctx as { mode: string }).mode = 'print'
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('command guards', () => {
  it('rejects ds-cost when the provider is not native DeepSeek, naming the current provider', async () => {
    env()
    const h = makeHarness([])
    h.ctx.model = { id: 'deepseek-v4-flash', provider: 'opencode' } as unknown as typeof h.ctx.model
    await h.commands['ds-cost']!.handler('', h.ctx)
    expect(h.notifies.at(-1)?.msg).toContain('原生供应商')
    expect(h.notifies.at(-1)?.msg).toContain('opencode')
  })
})

describe('shortcut currency toggle', () => {
  it('cycles cny → usd and persists to settings.json', async () => {
    const e = env({ deepseekCost: { locale: 'zh' } })
    const h = makeHarness([])
    await h.shortcuts['ctrl+shift+l']!.handler(h.ctx)
    expect(loadDeepseekCostConfig(h.ctx).currency).toBe('usd')
    const data = JSON.parse(readFileSync(join(e.dir, 'settings.json'), 'utf8'))
    expect(data.deepseekCost.currency).toBe('usd')
    // Language is untouched by the currency shortcut.
    expect(data.deepseekCost.locale).toBe('zh')
    expect(h.notifies.at(-1)?.msg).toBe('已切换货币: $')
  })

  it('cycles further usd → eur on a second press', async () => {
    env({ deepseekCost: { locale: 'en', currency: 'usd' } })
    const h = makeHarness([])
    await h.shortcuts['ctrl+shift+l']!.handler(h.ctx)
    expect(loadDeepseekCostConfig(h.ctx).currency).toBe('eur')
    expect(h.notifies.at(-1)?.msg).toBe('Currency: €')
  })
})

describe('in-panel L-key loop', () => {
  /**
   * Drives /ds-cost with a controllable ctx.ui.custom: each call captures
   * the rendered component; the test presses L then escape on it.
   */
  async function drivePanelWithKeys(): Promise<string[]> {
    env({ deepseekCost: { locale: 'zh' } })
    const entries = [
      usageEntry('assistant', 'deepseek-v4-flash', {
        input: 1000,
        output: 300,
        totalTokens: 1300,
      }),
    ]
    const h = makeHarness(entries)
    const panels: Array<{
      lines: string[]
      comp: { handleInput: (d: string) => void }
    }> = []

    // Replace ctx.ui.custom with a controllable version.
    ;(h.ctx.ui as { custom: unknown }).custom = (
      factory: (
        _tui: unknown,
        _theme: unknown,
        _kb: unknown,
        done: (v?: string) => void,
      ) => unknown,
    ) =>
      new Promise<string | undefined>((resolve) => {
        const comp = factory(null, h.ctx.ui.theme, {}, (v) => resolve(v)) as {
          render: (w: number) => string[]
          handleInput: (d: string) => void
        }
        panels.push({ lines: comp.render(60), comp })
      })

    const p = h.commands['ds-cost']!.handler('', h.ctx)
    await flush() // first custom() called
    panels[0]!.comp.handleInput('l') // toggle → handler reopens
    await flush()
    await flush()
    expect(panels.length).toBeGreaterThanOrEqual(2)
    panels[1]!.comp.handleInput('\u001b') // close
    await p
    return panels.map((panel) => panel.lines.join('\n'))
  }

  it('reopens /ds-cost in USD after pressing L (currency cycles, language unchanged)', async () => {
    const panels = await drivePanelWithKeys()
    expect(panels[0]).toContain('Token 用量')
    // Language stayed zh; the *currency* cycled cny → usd.
    expect(panels[1]).toContain('Token 用量')
    expect(panels[1]).toContain('费用 (官方价, $)')
    expect(panels[1]).toContain('$0.0004')
  })
})
