/**
 * Formatting helpers for token counts, money, and two-column panel rows.
 * All width math is visible-width aware (CJK wide chars count as 2).
 */

import { visibleWidth } from '@earendil-works/pi-tui'

/** Overlay content width: panel width (60) - 2 border - 2 padding. */
export const PANEL_CONTENT_W = 56
/** Right column width for two-column rows. */
export const PANEL_VALUE_W = 34

export function formatTokens(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatShortTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatCny(n: number): string {
  if (n === 0) return '¥0'
  if (n >= 1) return `¥${n.toFixed(2)}`
  if (n >= 0.01) return `¥${n.toFixed(3)}`
  if (n >= 0.0001) return `¥${n.toFixed(4)}`
  return `¥${n.toFixed(6)}`
}

export function formatUsd(n: number): string {
  if (n === 0) return '$0'
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(3)}`
  if (n >= 0.0001) return `$${n.toFixed(4)}`
  return `$${n.toFixed(6)}`
}

/** Pad a string to `width` visible columns (CJK wide chars count as 2). */
export function padVisible(s: string, width: number): string {
  const pad = Math.max(0, width - visibleWidth(s))
  return s + ' '.repeat(pad)
}

/** Right-align a string within `width` visible columns. */
export function alignRight(s: string, width: number): string {
  const pad = Math.max(0, width - visibleWidth(s))
  return ' '.repeat(pad) + s
}

/** Build a two-column content row: label left, value right-aligned. */
export function row(label: string, value: string, labelW = 18): string {
  return `  ${padVisible(label, labelW)}${alignRight(value, PANEL_VALUE_W)}`
}
