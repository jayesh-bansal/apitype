import { describe, expect, it } from 'vitest'
import { inferSchema, mergeMultipleSamples } from '../src/infer.js'

describe('inferSchema', () => {
  it('handles null', () => {
    expect(inferSchema(null)).toEqual({ kind: 'null' })
  })

  it('handles booleans', () => {
    expect(inferSchema(true)).toEqual({ kind: 'boolean' })
    expect(inferSchema(false)).toEqual({ kind: 'boolean' })
  })

  it('handles integers', () => {
    expect(inferSchema(42)).toEqual({ kind: 'integer', min: 0 })
    expect(inferSchema(-1)).toEqual({ kind: 'integer', min: undefined })
  })

  it('handles floats', () => {
    expect(inferSchema(3.14)).toEqual({ kind: 'number' })
  })

  it('handles plain strings', () => {
    expect(inferSchema('hello')).toEqual({ kind: 'string', format: undefined })
  })

  it('detects uuid', () => {
    expect(inferSchema('123e4567-e89b-12d3-a456-426614174000')).toEqual({
      kind: 'string',
      format: 'uuid',
    })
  })

  it('detects email', () => {
    expect(inferSchema('alice@example.com')).toEqual({ kind: 'string', format: 'email' })
  })

  it('detects url', () => {
    expect(inferSchema('https://example.com')).toEqual({ kind: 'string', format: 'url' })
  })

  it('detects datetime', () => {
    expect(inferSchema('2024-01-15T10:30:00Z')).toEqual({ kind: 'string', format: 'datetime' })
  })

  it('detects date', () => {
    expect(inferSchema('2024-01-15')).toEqual({ kind: 'string', format: 'date' })
  })

  it('handles empty array', () => {
    expect(inferSchema([])).toEqual({ kind: 'array', items: { kind: 'unknown' } })
  })

  it('handles string array', () => {
    const result = inferSchema(['a', 'b', 'c'])
    expect(result).toEqual({
      kind: 'array',
      items: { kind: 'string', format: undefined },
      minLength: 0,
    })
  })

  it('handles object', () => {
    const result = inferSchema({ id: 1, name: 'Alice' })
    expect(result).toMatchObject({
      kind: 'object',
      properties: {
        id: { schema: { kind: 'integer', min: 0 }, optional: false, nullable: false },
        name: { schema: { kind: 'string' }, optional: false, nullable: false },
      },
    })
  })

  it('marks null property as nullable', () => {
    const result = inferSchema({ bio: null })
    expect(result).toMatchObject({
      kind: 'object',
      properties: {
        bio: { schema: { kind: 'null' }, nullable: true },
      },
    })
  })

  it('handles nested objects', () => {
    const result = inferSchema({ address: { city: 'London', zip: 'E1 6AN' } })
    expect(result).toMatchObject({ kind: 'object' })
  })
})

describe('mergeMultipleSamples', () => {
  it('marks missing keys as optional across samples', () => {
    const samples = [
      { id: 1, name: 'Alice', bio: 'Developer' },
      { id: 2, name: 'Bob' }, // bio missing
    ]
    const result = mergeMultipleSamples(samples)
    expect(result).toMatchObject({ kind: 'object' })
    if (result.kind === 'object') {
      expect(result.properties['bio']?.optional).toBe(true)
      expect(result.properties['id']?.optional).toBe(false)
    }
  })

  it('marks keys that are sometimes null as nullable', () => {
    const samples = [{ score: 100 }, { score: null }]
    const result = mergeMultipleSamples(samples)
    expect(result).toMatchObject({ kind: 'object' })
    if (result.kind === 'object') {
      expect(result.properties['score']?.nullable).toBe(true)
    }
  })
})
