/**
 * Tokenizer tests — encoded token ids are asserted against reference outputs
 * that were cross-validated against the official HuggingFace `tokenizers`
 * (Rust) implementation loading the same tokenizer.json.
 */

import { describe, expect, it } from 'vitest'

import { countTokens, encode } from '../src/tokenizer'

describe('deepseek tokenizer', () => {
  it('encodes basic english', () => {
    expect(encode('Hello!').ids).toEqual([19923, 3])
    expect(encode('hello world').ids).toEqual([33310, 2058])
  })

  it('encodes chinese', () => {
    expect(encode('你好，世界！').ids).toEqual([30594, 303, 3427, 1175])
    expect(encode('DeepSeek 是一个人工智能助手，用于解决各种任务。').ids).toEqual([
      53091, 4374, 1465, 223, 6715, 33574, 52334, 303, 6441, 4998, 5372, 6533, 320,
    ])
  })

  it('encodes code', () => {
    expect(encode('const x = 1; // comment').ids).toEqual([
      3949, 1527, 438, 223, 19, 29, 1915, 7006,
    ])
  })

  it('encodes emoji with byte-level merges', () => {
    expect(encode('😀🚀 emoji test').ids).toEqual([28927, 225, 74287, 225, 980, 82644, 1950])
  })

  it('encodes japanese', () => {
    expect(encode('日本語のテキストとカタカナ・ひらがな').ids).toEqual([
      88768, 1576, 17383, 20367, 24552, 2495, 15961, 11767, 15961, 27071, 4825, 40259, 4970, 2936,
      2942,
    ])
  })

  it('handles whitespace and control characters', () => {
    expect(encode('\tIndented\ttext\nwith multiple\n\nlines').ids).toEqual([
      200, 5314, 19686, 200, 2067, 201, 6135, 4990, 271, 12678,
    ])
  })

  it('handles long repeated runs (merge ordering stability)', () => {
    // 5000 × "a" → 625 × token 89086 ("aaaaaaaa").
    const r = encode('a'.repeat(5000))
    expect(r.ids.length).toBe(625)
    expect(r.ids.every((id) => id === 89086)).toBe(true)
    expect(r.unencodable).toBe(0)
  })

  it('handles a long mixed document', () => {
    const text =
      'function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nconsole.log(fibonacci(10));'
    const r = encode(text)
    expect(r.ids).toEqual([
      8701, 55155, 3913, 11, 875, 223, 855, 343, 80, 8593, 223, 19, 11, 1354, 313, 510, 223, 1354,
      55155, 3913, 565, 223, 19, 11, 940, 55155, 3913, 565, 223, 20, 833, 2365, 17362, 8202, 5123,
      686, 18020, 10, 553, 29267,
    ])
    expect(r.unencodable).toBe(0)
  })

  it('encodes empty string to no tokens', () => {
    expect(encode('').ids).toEqual([])
  })

  it('countTokens matches encode length', () => {
    const text = 'DeepSeek 是一个人工智能助手'
    expect(countTokens(text).ids.length).toBe(encode(text).ids.length)
  })

  it('reports no unencodable symbols for normal text', () => {
    expect(encode('Mixed 中英 mixed text 123 !@#').unencodable).toBe(0)
  })
})
