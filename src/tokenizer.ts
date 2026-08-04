/**
 * DeepSeek BPE tokenizer — a TypeScript port of the official DeepSeek tokenizer
 * (deepseek_v3_tokenizer from https://api-docs.deepseek.com/zh-cn/quick_start/token_usage).
 *
 * The official distribution ships a HuggingFace `tokenizer.json` (LlamaTokenizerFast /
 * byte-level BPE). This module re-implements the encoding algorithm (the same one
 * tokenizers-rs implements for `AutoTokenizer`) so we can count tokens offline
 * without Python or transformers.
 *
 * Encoder pipeline (matches HuggingFace tokenizers):
 *   1. Pre-tokenize with the 3 split regexes from tokenizer.json (Sequence of Split,
 *      behavior=Isolated), operating on the raw unicode text.
 *   2. ByteLevel step: map each pre-token's UTF-8 bytes through GPT-2 style
 *      bytes_to_unicode (add_prefix_space=false, use_regex=false for this tokenizer).
 *   3. BPE: greedy whole-word lookup, else bottom-up merges by rank (min rank first,
 *      one instance per step — identical to tokenizers-rs `merge_word`), then map
 *      merged symbols to vocab ids.
 *
 * Note: `byte_fallback` is false and `unk_token` is null in the official file, so any
 * symbol that is not in the vocab would be an error in Rust. In practice every single
 * byte-unicode character is present in the vocab; symbols that cannot be merged are
 * kept as-is. We count and report any residual unencodable symbol instead of crashing.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TOKENIZER_JSON_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'tokenizer',
  'tokenizer.json',
)

// ---------------------------------------------------------------------------
// bytes_to_unicode (GPT-2 / Llama byte-level mapping)
// ---------------------------------------------------------------------------

function buildByteToChar(): string[] {
  const bs: number[] = []
  for (let b = 0x21; b <= 0x7e; b++) bs.push(b)
  for (let b = 0xa1; b <= 0xac; b++) bs.push(b)
  for (let b = 0xae; b <= 0xff; b++) bs.push(b)
  const cs = [...bs]
  let n = 0
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b)
      cs.push(256 + n)
      n++
    }
  }
  const map: string[] = Array.from({ length: 256 })
  bs.forEach((b, i) => {
    // cs and bs always have equal length here; index is in-bounds.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    map[b] = String.fromCharCode(cs[i]!)
  })
  return map
}

// ---------------------------------------------------------------------------
// Tokenizer data (loaded lazily, cached at module level)
// ---------------------------------------------------------------------------

interface AddedToken {
  content: string
  id: number
  special: boolean
}

interface TokenizerData {
  vocab: Map<string, number>
  mergesRank: Map<string, number>
  byteToChar: string[]
  preTokenizers: RegExp[]
  addedTokens: AddedToken[]
}

let cachedData: TokenizerData | null = null

function getData(): TokenizerData {
  if (cachedData) return cachedData

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(TOKENIZER_JSON_PATH, 'utf8'))
  } catch (err) {
    throw new Error(`deepseek-cost: failed to read tokenizer.json: ${String(err)}`)
  }
  const raw = parsed as {
    model: {
      vocab: Record<string, number>
      merges: string[]
    }
    pre_tokenizer?: {
      type: string
      pretokenizers?: Array<{
        type: string
        pattern?: { Regex?: string }
        behavior?: string
        invert?: boolean
      }>
    }
    added_tokens?: AddedToken[]
  }

  const vocab = new Map<string, number>()
  for (const [token, id] of Object.entries(raw.model.vocab)) {
    vocab.set(token, id)
  }
  const mergesRank = new Map<string, number>()
  raw.model.merges.forEach((m, rank) => {
    // tokenizer.json merges are "token1 token2" (space-separated); byte-level
    // tokens never contain a literal space, so the first space splits them.
    const sep = m.indexOf(' ')
    if (sep < 0) return
    mergesRank.set(m.slice(0, sep) + m.slice(sep + 1), rank)
  })

  // Extract the split regexes from the Sequence pre_tokenizer (behavior=Isolated).
  const preTokenizers: RegExp[] = []
  for (const pt of raw.pre_tokenizer?.pretokenizers ?? []) {
    if (pt.type !== 'Split') continue
    const pattern = pt.pattern?.Regex
    if (!pattern) continue
    try {
      preTokenizers.push(new RegExp(pattern, 'gu'))
    } catch {
      // Malformed / unsupported regex: skip this split stage.
    }
  }

  cachedData = {
    vocab,
    mergesRank,
    byteToChar: buildByteToChar(),
    preTokenizers,
    addedTokens: raw.added_tokens ?? [],
  }
  return cachedData
}

// ---------------------------------------------------------------------------
// Pre-tokenization
// ---------------------------------------------------------------------------

/** Split `text` at every regex match, keeping the matches (behavior=Isolated). */
function splitIsolated(text: string, re: RegExp): string[] {
  const out: string[] = []
  re.lastIndex = 0
  let last = 0
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(m[0])
    last = m.index + m[0].length
    if (m[0].length === 0) {
      // Zero-width match safety: advance manually to avoid an infinite loop.
      re.lastIndex = m.index + 1
    }
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Map a string's UTF-8 bytes to the byte-unicode character string. */
function toByteChars(text: string, byteToChar: string[]): string {
  const bytes = Buffer.from(text, 'utf8')
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    // bytes[i] is in-bounds by the loop condition.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    out += byteToChar[bytes[i]!]
  }
  return out
}

// ---------------------------------------------------------------------------
// BPE (min-rank merges, one instance per step — matches tokenizers-rs)
// ---------------------------------------------------------------------------

interface HeapItem {
  rank: number
  pos: number
  pair: string
  left: SymNode
}

interface SymNode {
  value: string
  pos: number
  prev: SymNode | null
  next: SymNode | null
}

/** Compare two heap items: rank first, then symbol position (matches
 * tokenizers-rs `Merge::cmp`, which breaks ties on the (left, right) pair). */
function heapLess(a: HeapItem, b: HeapItem): boolean {
  return a.rank < b.rank || (a.rank === b.rank && a.pos < b.pos)
}

class MinHeap {
  private items: HeapItem[] = []

  get size(): number {
    return this.items.length
  }

  // Heap operations only index elements known to exist (length checks + the
  // binary-heap invariant); the non-null assertions below are guaranteed.
  /* eslint-disable @typescript-eslint/no-non-null-assertion */
  push(item: HeapItem): void {
    const arr = this.items
    arr.push(item)
    let i = arr.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!heapLess(item, arr[parent]!)) break
      ;[arr[parent], arr[i]] = [arr[i]!, arr[parent]!]
      i = parent
    }
  }

  pop(): HeapItem | undefined {
    const arr = this.items
    if (arr.length === 0) return undefined
    const top = arr[0]
    const last = arr.pop()
    if (last === undefined || arr.length === 0) {
      return top
    }
    arr[0] = last
    let i = 0
    for (;;) {
      const left = 2 * i + 1
      const right = 2 * i + 2
      let smallest = i
      if (left < arr.length && heapLess(arr[left]!, arr[smallest]!)) smallest = left
      if (right < arr.length && heapLess(arr[right]!, arr[smallest]!)) smallest = right
      if (smallest === i) break
      ;[arr[i], arr[smallest]] = [arr[smallest]!, arr[i]!]
      i = smallest
    }
    return top
  }
  /* eslint-enable @typescript-eslint/no-non-null-assertion */
}

/**
 * Bottom-up BPE merge over the byte-unicode symbol array, using the merge ranks.
 * Mutates `parts` in place, merging symbols until no adjacent pair is a merge rule.
 *
 * Uses a linked list + min-heap keyed by merge rank, with node references instead
 * of array indices (merging never invalidates other pending pairs), matching
 * tokenizers-rs `merge_word` exactly.
 *
 * All indexed accesses are bounded by the linked-list construction loop; the
 * non-null assertions are guaranteed by construction.
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
function mergeBpe(parts: string[], mergesRank: Map<string, number>): void {
  const n = parts.length
  if (n < 2) return

  // Build a doubly linked list of symbols.
  const nodes: SymNode[] = new Array(n)
  for (let i = 0; i < n; i++) {
    nodes[i] = {
      value: parts[i]!,
      pos: i,
      prev: i > 0 ? nodes[i - 1]! : null,
      next: null,
    }
    if (i > 0) nodes[i - 1]!.next = nodes[i]!
  }

  const heap = new MinHeap()
  const tryPush = (left: SymNode | null): void => {
    if (!left || !left.next) return
    const pair = left.value + left.next.value
    const rank = mergesRank.get(pair)
    if (rank !== undefined) {
      heap.push({ rank, pos: left.pos, pair, left })
    }
  }
  for (let i = 0; i + 1 < n; i++) tryPush(nodes[i]!)

  while (heap.size > 0) {
    const item = heap.pop()!
    const { left, pair } = item
    const right = left.next
    if (!right) continue // right neighbour was already merged away
    if (left.value + right.value !== pair) continue // stale pair

    // Merge: left absorbs right, neighbours relink.
    left.value = pair
    left.next = right.next
    if (right.next) right.next.prev = left
    right.next = null
    right.prev = null

    tryPush(left.prev)
    tryPush(left)
  }

  // Collect results back into the array.
  const out: string[] = []
  for (let node: SymNode | null = nodes[0]!; node; node = node.next) {
    out.push(node.value)
  }
  parts.length = 0
  parts.push(...out)
}
/* eslint-enable @typescript-eslint/no-non-null-assertion */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EncodeResult {
  /** Token ids in encoding order. */
  ids: number[]
  /** Number of symbols that could not be mapped to a vocab id. */
  unencodable: number
}

/**
 * Encode a text string into DeepSeek token ids (offline, no network / Python).
 */
export function encode(text: string): EncodeResult {
  const data = getData()
  const { vocab, mergesRank, byteToChar, preTokenizers } = data

  // 1. Pre-tokenize: apply each split regex in sequence.
  let parts: string[] = [text]
  for (const re of preTokenizers) {
    const next: string[] = []
    for (const part of parts) {
      if (part.length === 0) continue
      next.push(...splitIsolated(part, re))
    }
    parts = next
  }

  // 2 + 3. Byte-level conversion + BPE + vocab lookup.
  const ids: number[] = []
  let unencodable = 0
  for (const part of parts) {
    if (part.length === 0) continue
    const word = toByteChars(part, byteToChar)

    // Greedy whole-word lookup first (matches tokenizers-rs behavior).
    const whole = vocab.get(word)
    if (whole !== undefined) {
      ids.push(whole)
      continue
    }

    const symbols = Array.from(word)
    mergeBpe(symbols, mergesRank)
    for (const sym of symbols) {
      const id = vocab.get(sym)
      if (id !== undefined) {
        ids.push(id)
      } else {
        unencodable++
      }
    }
  }

  return { ids, unencodable }
}

/** Convenience: token count for a text string. */
export function countTokens(text: string): EncodeResult {
  return encode(text)
}
