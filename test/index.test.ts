/**
 * Extension entry tests: event wiring, status bar behavior (model-aware),
 * command guards, shortcut language toggle, and the in-panel L-key loop.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadDeepseekCostConfig } from '../src/config'
import { createSettingsEnv, flush, makeHarness, usageEntry } from './helpers'

const restores: Array<() => void> = []
afterEach(() => {
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
    const h = makeHarness([])
    await h.handlers.session_start![0]!({}, h.ctx)
    expect(h.statuses.at(-1)).toBe('¥0')
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

describe('shortcut language toggle', () => {
  it('toggles zh → en and persists to settings.json', async () => {
    const e = env({ deepseekCost: { locale: 'zh' } })
    const h = makeHarness([])
    await h.shortcuts['ctrl+shift+l']!.handler(h.ctx)
    expect(loadDeepseekCostConfig(h.ctx).locale).toBe('en')
    const data = JSON.parse(readFileSync(join(e.dir, 'settings.json'), 'utf8'))
    expect(data.deepseekCost.locale).toBe('en')
    expect(h.notifies.at(-1)?.msg).toBe('Switched to English')
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

  it('reopens /ds-cost in English after pressing L', async () => {
    const panels = await drivePanelWithKeys()
    expect(panels[0]).toContain('Token 用量')
    expect(panels[1]).toContain('Token Usage')
  })
})
