/**
 * Shared test helpers: theme mock, extension harness (mock ExtensionAPI /
 * ExtensionContext), and fixture builders.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent'

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import installExtension from '../src/index'

/** Theme mock that returns text verbatim (no ANSI), so assertions are simple. */
export function mockTheme(): Theme {
  return new Proxy({} as Theme, {
    get: (_t, prop) => {
      if (prop === 'fg' || prop === 'bold') {
        return (_colorOrText: unknown, text?: unknown) =>
          (text as string) ?? (_colorOrText as string)
      }
      return (text: unknown) => text as string
    },
  })
}

export interface UsageFixture {
  input?: number
  cacheRead?: number
  cacheWrite?: number
  output?: number
  totalTokens?: number
}

/** A persisted message entry with usage, as pi stores in sessions. */
export function usageEntry(
  role: 'assistant' | 'toolResult',
  modelId: string | undefined,
  usage: UsageFixture,
  timestamp = '2025-01-01T05:00:00.000Z',
) {
  return {
    type: 'message' as const,
    id: Math.random().toString(36).slice(2),
    parentId: null,
    timestamp,
    message: {
      role,
      ...(modelId ? { model: modelId } : {}),
      usage,
    },
  }
}

/** A compaction entry with usage. */
export function compactionEntry(usage: UsageFixture, timestamp = '2025-01-01T05:00:00.000Z') {
  return {
    type: 'compaction' as const,
    id: Math.random().toString(36).slice(2),
    parentId: null,
    timestamp,
    summary: 's',
    firstKeptEntryId: '1',
    usage,
  }
}

export interface Harness {
  pi: ExtensionAPI
  handlers: Record<
    string,
    Array<(event: unknown, ctx: ExtensionContext) => Promise<unknown> | unknown>
  >
  commands: Record<
    string,
    { handler: (args: string, ctx: ExtensionContext) => Promise<unknown> | unknown }
  >
  shortcuts: Record<string, { handler: (ctx: ExtensionContext) => Promise<unknown> | unknown }>
  ctx: ExtensionContext
  /** Capture ui.notify calls. */
  notifies: Array<{ msg: string; level: string }>
  /** Capture ctx.ui.setStatus("ds-cost", ...) values. */
  statuses: Array<string | undefined>
}

/**
 * Build a mock pi + ctx and run the extension factory against it. The mock
 * `ctx.ui.custom` returns the component synchronously and never resolves the
 * promise (callers drive the component manually), mirroring the overlay loop.
 */
export function makeHarness(entries: Array<Record<string, unknown>>): Harness {
  const theme = mockTheme()
  const notifies: Harness['notifies'] = []
  const statuses: Array<string | undefined> = []

  const handlers: Harness['handlers'] = {}
  const commands: Harness['commands'] = {}
  const shortcuts: Harness['shortcuts'] = {}

  const ui = {
    theme,
    setStatus: (key: string, value: string | undefined) => {
      if (key === 'ds-cost') statuses.push(value)
    },
    notify: (msg: string, level: string) => notifies.push({ msg, level }),
    // Resolve with the value the component closes with; tests drive the
    // component manually and call the captured `done` themselves.
    custom: () =>
      new Promise<undefined>(() => {
        // never resolves unless the test resolves it via the component
      }),
  }

  const ctx = {
    mode: 'tui' as const,
    cwd: '/tmp',
    model: { id: 'deepseek-v4-flash', provider: 'deepseek' },
    ui,
    sessionManager: { getEntries: () => entries },
  } as unknown as ExtensionContext

  const pi = {
    on: (name: string, handler: Harness['handlers'][string][number]) => {
      ;(handlers[name] ??= []).push(handler)
    },
    registerCommand: (name: string, opts: Harness['commands'][string]) => {
      commands[name] = opts
    },
    registerShortcut: (key: string, opts: Harness['shortcuts'][string]) => {
      shortcuts[key] = opts
    },
  } as unknown as ExtensionAPI

  // Install the extension so events/commands/shortcuts are registered.
  installExtension(pi)

  return { pi, handlers, commands, shortcuts, ctx, notifies, statuses }
}

/** Run an async handler and flush pending microtasks. */
export async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
}

/**
 * Point PI_CODING_AGENT_DIR at a throwaway dir with the given settings.json
 * so config loading is isolated from the user's real settings. Call
 * `restore()` in afterEach/finally.
 */
export function createSettingsEnv(settings: Record<string, unknown>): {
  dir: string
  restore: () => void
} {
  const dir = mkdtempSync(join(tmpdir(), 'ds-test-'))
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings))
  const prev = process.env.PI_CODING_AGENT_DIR
  process.env.PI_CODING_AGENT_DIR = dir
  return {
    dir,
    restore: () => {
      if (prev === undefined) {
        delete process.env.PI_CODING_AGENT_DIR
      } else {
        process.env.PI_CODING_AGENT_DIR = prev
      }
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
