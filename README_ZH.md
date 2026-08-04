# pi-deepseek-cost

[![npm version](https://img.shields.io/npm/v/pi-deepseek-cost.svg)](https://www.npmjs.com/package/pi-deepseek-cost)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)

> [English](README.md) · [简体中文 (Chinese)](README_ZH.md)

> 一个 [Pi](https://pi.dev) 扩展：追踪你的 **DeepSeek 用量与费用** —— 状态栏实时显示会话累计费用，`/ds-cost` 与 `/ds-estimate` 浮动弹窗，中英双语（货币随语言切换），可选峰谷计价支持。

## 功能特性

- **状态栏**：实时显示当前会话累计费用（`¥0.019`），每轮结束后更新 —— 仅费用，无噪音（空会话显示 `¥0`）
- **`/ds-cost`**：浮动弹窗 —— 分模型 token 用量（缓存命中/未命中输入、输出）、缓存命中率、CNY/USD 费用明细、峰谷拆分、美元↔人民币对照
- **`/ds-estimate <text>`**：使用**官方 DeepSeek tokenizer**（纯 TypeScript 移植，无需 Python）离线估算文本的 token 数与输入费用
- **模型感知**：仅对 DeepSeek 模型生效（`provider: "deepseek"` 或 id 以 `deepseek` 开头）；其他模型下完全隐身
- **中英双语 + 货币联动**：中文 → ¥（人民币），英文 → $（美元）。在任一弹窗内按 `L` 切换，或全局快捷键 `Ctrl+Shift+L`
- **峰谷计价**：settings 中可选启用，按每条消息自身 timestamp 判定时段（北京时间），时段与倍数可配置

## 安装

```bash
# 从 npm
pi install npm:pi-deepseek-cost
# 或从 git 仓库
pi install git:github.com/hacxy/pi-deepseek-cost
# 或本地路径
pi install ./pi-deepseek-cost
```

> **安全提示**：与所有 Pi 包一样，安装前请审查源码 —— 扩展拥有完整的系统权限。

前置条件：

- 较新的 Pi 安装
- 已配置 DeepSeek 模型与 API key（`DEEPSEEK_API_KEY`，provider 为 `deepseek` —— 模型 `deepseek-v4-flash`、`deepseek-v4-pro`）

## 使用

| 操作              | 方式                                                            |
| ----------------- | --------------------------------------------------------------- |
| 查看会话费用      | 观察状态栏（每轮结束后更新）                                    |
| 费用详情弹窗      | `/ds-cost`（Esc 关闭，`L` 切换语言）                            |
| 估算 token/费用   | `/ds-estimate <文本>`                                           |
| 切换语言（中↔英） | 弹窗内按 `L`，或 `Ctrl+Shift+L`（可在 keybindings.json 自定义） |
| 在配置中设置语言  | settings.json 的 `deepseekCost.locale`                          |

## 配置

在 `~/.pi/agent/settings.json`（全局）或 `.pi/settings.json`（项目，覆盖全局）：

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

| 配置项           | 默认值             | 说明                                                        |
| ---------------- | ------------------ | ----------------------------------------------------------- |
| `locale`         | `"zh"`             | UI 语言：`"zh"` 或 `"en"`。货币随语言（zh → ¥，en → $）     |
| `peakPricing`    | `false`            | 是否启用峰谷计价（官方峰谷定价）                            |
| `peakMultiplier` | `2`                | 高峰时段价格倍数（官方 2 倍）                               |
| `peakHours`      | `[[9,12],[14,18]]` | 高峰时段范围，**Asia/Shanghai（北京时间）**，`[开始, 结束)` |

配置修改即时生效（每次计算都会重新读取）。

### 峰谷计价细节

当 `peakPricing: true` 时，每条消息按**自身 timestamp** 计费：高峰时段请求按 ×`peakMultiplier`，平时按 ×1 —— 混合时段会话精确拆分（`/ds-cost` 面板显示平时/高峰两行）。`/ds-estimate` 按当前时段应用倍数。时间始终按 Asia/Shanghai（UTC+8，无夏令时）判定，与 DeepSeek 官方定义一致（北京时间 09:00–12:00 与 14:00–18:00）。

## 计费口径

- token 数直接取自 Pi 在会话中持久化的 `usage` 字段（`input` = 缓存未命中输入，`cacheRead` = 缓存命中输入，`output` = 输出），与 DeepSeek API 的 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` / `completion_tokens` 一一对应
- 人民币按 DeepSeek 官方每百万 token 单价；美元采用 Pi 内置 DeepSeek 模型配置的美元费率（同一来源值），因此美元显示与 Pi 其他界面一致

| 模型                | 货币     | 输入 · 缓存未命中 | 输入 · 缓存命中 | 输出      |
| ------------------- | -------- | ----------------- | --------------- | --------- |
| `deepseek-v4-flash` | ¥ 人民币 | ¥1 / M            | ¥0.02 / M       | ¥2 / M    |
|                     | $ 美元   | $0.14 / M         | $0.0028 / M     | $0.28 / M |
| `deepseek-v4-pro`   | ¥ 人民币 | ¥3 / M            | ¥0.025 / M      | ¥6 / M    |
|                     | $ 美元   | $0.435 / M        | $0.003625 / M   | $0.87 / M |

- 费用按模型分别计算（会话中切换模型也能正确累计）；`toolResult` / compaction 等无模型标记的用量按最近模型计费
- 会话总额从会话文件重建，`/resume` 后依然准确

## Tokenizer

`src/tokenizer.ts` 是官方 `deepseek_tokenizer.zip`（LlamaTokenizerFast / 字节级 BPE）的纯 TypeScript 移植 —— 无 Python、无运行时 npm 依赖。与 HuggingFace Rust `tokenizers` 逐 token 一致（已交叉验证，含中文、emoji、代码、2 万字符长文本）。

> 官方 zip 提供的是 **V3** 版 tokenizer，对 V4 模型估算可能略有差异。实际计费以 API 返回的 `usage` 为准。

## 开发

```bash
pnpm install
pnpm dev          # 在 pi 中以热重载运行（pi -e ./src/index.ts）
pnpm test         # vitest 单元测试
pnpm typecheck
pnpm lint
pnpm format
```

## 发布

```bash
pnpm release [patch|minor|major]   # 升级版本、推送并监听 CI 发布（默认 patch）
```

通过 `npm version` 升级版本（提交 + `vX.Y.Z` tag），推送 `main` 与 tag，然后监听 `publish.yml` CI 运行：lint → typecheck → test → `npm publish`（npm 信任发布，无需 token）→ changelogithub 生成 GitHub Release。用 `pnpm release --dry` 可预览要执行的命令而不实际运行。

## 许可证

MIT
