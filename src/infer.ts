import type { InferredSchema, PropertySchema, StringFormat } from './types.js'

// ── Pattern detectors ────────────────────────────────────────────────────────

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_CUID = /^c[a-z0-9]{24,}$/
const RE_NANOID = /^[A-Za-z0-9_-]{21}$/
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const RE_URL = /^https?:\/\//
const RE_ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/
const RE_TIME = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/
const RE_IP = /^(\d{1,3}\.){3}\d{1,3}$/
const RE_IP6 = /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i
const RE_HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RE_BASE64 = /^[A-Za-z0-9+/]+=*$/
const RE_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/
const RE_SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?(\+[0-9A-Za-z-.]+)?$/

function detectStringFormat(value: string): StringFormat | undefined {
  if (RE_UUID.test(value)) return 'uuid'
  if (RE_CUID.test(value)) return 'cuid'
  if (RE_NANOID.test(value)) return 'nanoid'
  if (RE_EMAIL.test(value)) return 'email'
  if (RE_URL.test(value)) return 'url'
  if (RE_ISO8601.test(value)) return 'datetime'
  if (RE_DATE.test(value)) return 'date'
  if (RE_TIME.test(value)) return 'time'
  if (RE_IP.test(value)) return 'ip'
  if (RE_IP6.test(value)) return 'ip6'
  if (RE_HEX_COLOR.test(value)) return 'hex-color'
  if (RE_SEMVER.test(value)) return 'semver'
  // JWT check: 3 parts separated by dots, each base64url
  if (RE_JWT.test(value) && value.split('.').length === 3) return 'jwt'
  // Base64 heuristic: longer strings that look base64-encoded
  if (value.length >= 16 && RE_BASE64.test(value) && value.length % 4 === 0) return 'base64'
  return undefined
}

// ── Schema inference ─────────────────────────────────────────────────────────

export function inferSchema(data: unknown): InferredSchema {
  if (data === null) return { kind: 'null' }
  if (data === undefined) return { kind: 'unknown' }

  if (typeof data === 'boolean') return { kind: 'boolean' }

  if (typeof data === 'number') {
    if (!isFinite(data)) return { kind: 'number' }
    if (Number.isInteger(data)) {
      return data >= 0 ? { kind: 'integer', min: 0 } : { kind: 'integer' }
    }
    return { kind: 'number' }
  }

  if (typeof data === 'string') {
    const format = detectStringFormat(data)
    return format ? { kind: 'string', format } : { kind: 'string' }
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return { kind: 'array', items: { kind: 'unknown' } }
    const itemSchemas = data.map(inferSchema)
    return { kind: 'array', items: mergeSchemas(itemSchemas), minLength: 0 }
  }

  if (typeof data === 'object') {
    const properties: Record<string, PropertySchema> = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const schema = inferSchema(value)
      properties[key] = {
        schema,
        optional: false,
        nullable: schema.kind === 'null',
      }
    }
    return { kind: 'object', properties }
  }

  return { kind: 'unknown' }
}

// ── Schema merging (for multiple samples / array items) ──────────────────────

export function mergeSchemas(schemas: InferredSchema[]): InferredSchema {
  if (schemas.length === 0) return { kind: 'unknown' }
  if (schemas.length === 1) return schemas[0]!

  const unique = deduplicateSchemas(schemas)
  if (unique.length === 1) return unique[0]!

  // If the only difference is null and one other type → nullable union is handled by caller
  const nonNull = unique.filter(s => s.kind !== 'null')
  if (nonNull.length === 1) {
    // One real type + null → the caller wraps as nullable
    return nonNull[0]!
  }

  // Merge objects deeply
  const objects = unique.filter((s): s is Extract<InferredSchema, { kind: 'object' }> =>
    s.kind === 'object'
  )
  if (objects.length === unique.length) {
    return mergeObjects(objects)
  }

  // Integers can widen to number
  const hasInteger = unique.some(s => s.kind === 'integer')
  const hasNumber = unique.some(s => s.kind === 'number')
  if (hasInteger && hasNumber) {
    return { kind: 'number' }
  }

  // Fall back to union
  return { kind: 'union', variants: unique }
}

function deduplicateSchemas(schemas: InferredSchema[]): InferredSchema[] {
  const seen: InferredSchema[] = []
  for (const schema of schemas) {
    if (!seen.some(s => schemasEqual(s, schema))) {
      seen.push(schema)
    }
  }
  return seen
}

function schemasEqual(a: InferredSchema, b: InferredSchema): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'string' && b.kind === 'string') return a.format === b.format
  if (a.kind === 'object' && b.kind === 'object') return false // always merge objects
  return true
}

function mergeObjects(
  objects: Array<Extract<InferredSchema, { kind: 'object' }>>
): Extract<InferredSchema, { kind: 'object' }> {
  if (objects.length === 0) return { kind: 'object', properties: {} }

  // Collect all keys across all objects
  const allKeys = new Set<string>()
  for (const obj of objects) {
    for (const key of Object.keys(obj.properties)) allKeys.add(key)
  }

  const properties: Record<string, PropertySchema> = {}

  for (const key of allKeys) {
    const appearances = objects.filter(o => key in o.properties)
    const missing = appearances.length < objects.length
    const propSchemas = appearances.map(o => o.properties[key]!.schema)
    const hasNull = propSchemas.some(s => s.kind === 'null') || missing
    const nonNull = propSchemas.filter(s => s.kind !== 'null')
    const merged = mergeSchemas(nonNull.length > 0 ? nonNull : propSchemas)

    properties[key] = {
      schema: merged,
      optional: missing,
      nullable: hasNull,
    }
  }

  return { kind: 'object', properties }
}

// ── Multi-sample merging ─────────────────────────────────────────────────────

export function mergeMultipleSamples(samples: unknown[]): InferredSchema {
  const schemas = samples.map(inferSchema)
  return mergeSchemas(schemas)
}
