import { describe, expect, it } from 'vitest'
import { fromJson, fromString } from '../src/index.js'

describe('fromJson', () => {
  it('generates Zod schema for a simple object', () => {
    const result = fromJson({ name: 'Alice', age: 30 }, { name: 'User' })
    expect(result.combined).toContain("import { z } from 'zod'")
    expect(result.combined).toContain('userSchema')
    expect(result.combined).toContain('z.string()')
    expect(result.combined).toContain('z.number().int()')
    expect(result.combined).toContain('type User')
  })

  it('detects uuid format', () => {
    const result = fromJson({ id: '123e4567-e89b-12d3-a456-426614174000' })
    expect(result.combined).toContain('z.string().uuid()')
  })

  it('detects email format', () => {
    const result = fromJson({ email: 'alice@example.com' })
    expect(result.combined).toContain('z.string().email()')
  })

  it('detects url format', () => {
    const result = fromJson({ website: 'https://example.com' })
    expect(result.combined).toContain('z.string().url()')
  })

  it('detects datetime format', () => {
    const result = fromJson({ createdAt: '2024-01-15T10:30:00Z' })
    expect(result.combined).toContain('z.string().datetime()')
  })

  it('handles nested objects', () => {
    const result = fromJson({ user: { id: 1, name: 'Alice' } })
    expect(result.combined).toContain('z.object(')
  })

  it('handles arrays', () => {
    const result = fromJson({ tags: ['typescript', 'zod'] })
    expect(result.combined).toContain('z.array(z.string())')
  })

  it('handles null fields as z.null()', () => {
    // A single null sample produces z.null() — use multi-sample for nullable
    const result = fromJson({ bio: null })
    expect(result.combined).toContain('z.null()')
  })

  it('handles nullable fields via multi-sample', () => {
    const result = fromJson({ bio: 'hello' }, { samples: [{ bio: null }] })
    expect(result.combined).toContain('.nullable()')
  })

  it('generates TypeScript only when zod is false', () => {
    const result = fromJson({ name: 'Alice' }, { name: 'User', zod: false, typescript: true })
    expect(result.combined).not.toContain("import { z } from 'zod'")
    expect(result.combined).toContain('export type User')
    expect(result.combined).toContain('string')
  })

  it('includes fetch wrapper when requested', () => {
    const result = fromJson(
      { id: 1 },
      { name: 'Item', fetchWrapper: true, sourceUrl: 'https://api.example.com/items/1' }
    )
    expect(result.combined).toContain('fetchItem')
    expect(result.combined).toContain('https://api.example.com/items/1')
    expect(result.combined).toContain('async function')
  })

  it('infers optional fields from multiple samples', () => {
    const result = fromJson(
      { id: 1, name: 'Alice', bio: 'Dev' },
      { name: 'User', samples: [{ id: 2, name: 'Bob' }] }
    )
    expect(result.combined).toContain('bio')
    expect(result.combined).toContain('.optional()')
  })
})

describe('fromString', () => {
  it('parses valid JSON string', () => {
    const result = fromString('{"hello":"world"}', { name: 'Test' })
    expect(result.combined).toContain('testSchema')
    expect(result.combined).toContain('z.string()')
  })

  it('throws on invalid JSON', () => {
    expect(() => fromString('not json')).toThrow()
  })
})
