# pi-deepseek-cost

[![npm version](https://img.shields.io/npm/v/pi-deepseek-cost.svg)](https://www.npmjs.com/package/pi-deepseek-cost)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)

> [简体中文 (Chinese)](README_ZH.md) · [English](README.md)

> A [Pi](https://pi.dev) extension that tracks your **DeepSeek usage & cost** — live session cost in the status bar, `/ds-cost` and `/ds-estimate` overlay panels, bilingual UI (中文/English) with currency switching, and optional peak/off-peak pricing.

## Features

- **Status bar**: live cumulative cost for the current session (`¥0.019`), refreshed after every turn — cost only, no noise (an empty session shows `¥0`)
- **`/ds-cost`**: floating overlay panel — per-model token usage (cache-hit / cache-miss input, output), cache hit rate, CNY/USD cost breakdown, peak-hour split, USD↔CNY cross-reference
- **`/ds-estimate <text>`**: offline token count & input-cost estimate using the **official DeepSeek tokenizer** (ported to TypeScript, no Python)
- **Model-aware**: active only for DeepSeek models (`provider: "deepseek"` or id starting with `deepseek`); invisible otherwise
- **Bilingual + currency**: zh → ¥ (CNY), en → $ (USD). Switch inside either panel with `L`, or globally with `Ctrl+Shift+L`
- **Peak/off-peak pricing**: opt-in via settings, per-message timestamp evaluation (Beijing time), configurable hours/multiplier

## Installation

```bash
# from npm
pi install npm:pi-deepseek-cost
# or from a git repo
pi install git:github.com/hacxy/pi-deepseek-cost
# or local path
pi install ./pi-deepseek-cost
```

> **Security:** as with any Pi package, review the source before installing — extensions run with full system access.

Requires:

- A recent Pi installation
- DeepSeek models configured with an API key (`DEEPSEEK_API_KEY`, provider `deepseek` — models `deepseek-v4-flash`, `deepseek-v4-pro`)

## Usage

| Action                  | How                                                                    |
| ----------------------- | ---------------------------------------------------------------------- |
| View session cost       | Watch the status bar (updates after each turn)                         |
| Detailed cost panel     | `/ds-cost` (Esc to close, `L` to switch language)                      |
| Estimate token/cost     | `/ds-estimate <text>`                                                  |
| Switch language (zh↔en) | `L` inside a panel, or `Ctrl+Shift+L` (rebindable in keybindings.json) |
| Set language in config  | `deepseekCost.locale` in settings.json                                 |

## Configuration

In `~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project, overrides):

```json
{
  "deepseekCost": {
    "locale": "zh",
    "peakPricing": false,
    "peakMultiplier": 2,
    "peakHours": [
      [9, 12],
      [14, 18]
    ]
  }
}
```

| Key              | Default            | Description                                                                  |
| ---------------- | ------------------ | ---------------------------------------------------------------------------- |
| `locale`         | `"zh"`             | UI language: `"zh"` or `"en"`. Currency follows (zh → ¥, en → $)             |
| `peakPricing`    | `false`            | Apply the peak multiplier during peak hours (official peak/off-peak pricing) |
| `peakMultiplier` | `2`                | Price multiplier during peak hours (official: 2×)                            |
| `peakHours`      | `[[9,12],[14,18]]` | Peak hour ranges, **Asia/Shanghai (Beijing) time**, `[start, end)`           |

Config edits take effect immediately (re-read on every calculation).

### Peak pricing details

When `peakPricing: true`, each message is charged against **its own timestamp**: peak-hour requests at ×`peakMultiplier`, off-peak at ×1 — mixed sessions split precisely (the `/ds-cost` panel shows off-peak / peak rows). `/ds-estimate` applies the current period's multiplier. Time is always evaluated in Asia/Shanghai (UTC+8, no DST), matching DeepSeek's official definition (09:00–12:00 and 14:00–18:00 Beijing time).

## Cost basis

- Token numbers come from the real `usage` blocks Pi persists on messages (`input` = cache-miss input, `cacheRead` = cache-hit input, `output`), matching DeepSeek API's `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` / `completion_tokens`
- CNY uses DeepSeek official per-million-token prices; USD uses the USD rates from Pi's built-in DeepSeek model config (same source values), so the USD display matches the rest of the Pi UI

| Model               | Currency | Input · cache miss | Input · cache hit | Output    |
| ------------------- | -------- | ------------------ | ----------------- | --------- |
| `deepseek-v4-flash` | ¥ CNY    | ¥1 / M             | ¥0.02 / M         | ¥2 / M    |
|                     | $ USD    | $0.14 / M          | $0.0028 / M       | $0.28 / M |
| `deepseek-v4-pro`   | ¥ CNY    | ¥3 / M             | ¥0.025 / M        | ¥6 / M    |
|                     | $ USD    | $0.435 / M         | $0.003625 / M     | $0.87 / M |

- Cost is computed per model (model switches mid-session aggregate correctly); `toolResult` / compaction usage uses the last known model
- Session totals rebuild from the session file, so they stay accurate after `/resume`

## Tokenizer

`src/tokenizer.ts` is a pure-TypeScript port of the official `deepseek_tokenizer.zip` (LlamaTokenizerFast / byte-level BPE) — no Python, no runtime npm dependencies. Token-level identical to HuggingFace's Rust `tokenizers` (cross-validated, including Chinese, emoji, code, and 20k-char documents).

> The official zip ships the **V3** tokenizer; estimates may differ slightly for V4 models. Actual billing follows the API's returned `usage`.

## Development

```bash
pnpm install
pnpm dev          # run in pi with hot reload (pi -e ./src/index.ts)
pnpm test         # vitest unit tests
pnpm typecheck
pnpm lint
pnpm format
```

## Release

```bash
pnpm release [patch|minor|major]   # bump, push, and watch the CI publish (default: patch)
```

Bumps the version via `npm version` (commit + `vX.Y.Z` tag), pushes `main` + tags, then watches the `publish.yml` CI run: lint → typecheck → test → `npm publish` (npm trusted publishing — no tokens) → changelogithub GitHub Release. Use `pnpm release --dry` to preview the commands without running them.

## License

MIT
