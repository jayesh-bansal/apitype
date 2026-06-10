import type { GenerateOptions, GenerateResult, InferredSchema, PropertySchema } from './types.js'

const DEFAULT_OPTS: Required<Omit<GenerateOptions, 'sourceUrl'>> = {
  name: 'Schema',
  zod: true,
  typescript: true,
  fetchWrapper: false,
  indent: 2,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c: string) => c.toUpperCase())
}

function indent(depth: number, size: number): string {
  return ' '.repeat(depth * size)
}

// ── Zod generation ───────────────────────────────────────────────────────────

function zodForSchema(
  schema: InferredSchema,
  prop: Pick<PropertySchema, 'optional' | 'nullable'> = { optional: false, nullable: false },
  depth: number = 0,
  indentSize: number = 2
): string {
  let base = zodBase(schema, depth, indentSize)

  if (prop.nullable && schema.kind !== 'null') base += '.nullable()'
  if (prop.optional) base += '.optional()'

  return base
}

function zodBase(schema: InferredSchema, depth: number, indentSize: number): string {
  const pad = indent(depth, indentSize)
  const padI = indent(depth + 1, indentSize)

  switch (schema.kind) {
    case 'null':
      return 'z.null()'
    case 'unknown':
      return 'z.unknown()'
    case 'boolean':
      return 'z.boolean()'
    case 'integer':
      return schema.min === 0 ? 'z.number().int().nonnegative()' : 'z.number().int()'
    case 'number':
      return 'z.number()'
    case 'string': {
      const fmt = schema.format
      if (!fmt) {
        if (schema.enum) {
          const vals = schema.enum.map(v => JSON.stringify(v)).join(', ')
          return `z.enum([${vals}])`
        }
        return 'z.string()'
      }
      const formatMap: Record<string, string> = {
        uuid: 'z.string().uuid()',
        cuid: 'z.string().cuid()',
        nanoid: 'z.string().nanoid()',
        email: 'z.string().email()',
        url: 'z.string().url()',
        datetime: 'z.string().datetime()',
        date: 'z.string().date()',
        time: 'z.string().time()',
        ip: 'z.string().ip({ version: "v4" })',
        ip6: 'z.string().ip({ version: "v6" })',
        'hex-color': 'z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)',
        base64: 'z.string().base64()',
        jwt: 'z.string().jwt()',
        semver: 'z.string().regex(/^\\d+\\.\\d+\\.\\d+/)',
      }
      return formatMap[fmt] ?? 'z.string()'
    }
    case 'array': {
      const items = zodBase(schema.items, depth, indentSize)
      return `z.array(${items})`
    }
    case 'object': {
      const entries = Object.entries(schema.properties)
      if (entries.length === 0) return 'z.object({})'
      const lines = entries.map(([key, prop]) => {
        const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
        const zodStr = zodForSchema(prop.schema, prop, depth + 1, indentSize)
        return `${padI}${safeName}: ${zodStr},`
      })
      return `z.object({\n${lines.join('\n')}\n${pad}})`
    }
    case 'union': {
      const variants = schema.variants.map(v => zodBase(v, depth, indentSize))
      if (variants.length === 2) return `z.union([${variants[0]}, ${variants[1]}])`
      return `z.union([${variants.join(', ')}])`
    }
  }
}

// ── TypeScript generation ────────────────────────────────────────────────────

function tsForSchema(
  schema: InferredSchema,
  prop: Pick<PropertySchema, 'optional' | 'nullable'> = { optional: false, nullable: false },
  depth: number = 0,
  indentSize: number = 2
): string {
  let base = tsBase(schema, depth, indentSize)
  if (prop.nullable && schema.kind !== 'null') base += ' | null'
  if (prop.optional) base += ' | undefined'
  return base
}

function tsBase(schema: InferredSchema, depth: number, indentSize: number): string {
  const pad = indent(depth, indentSize)
  const padI = indent(depth + 1, indentSize)

  switch (schema.kind) {
    case 'null':
      return 'null'
    case 'unknown':
      return 'unknown'
    case 'boolean':
      return 'boolean'
    case 'integer':
    case 'number':
      return 'number'
    case 'string': {
      if (schema.enum) return schema.enum.map(v => JSON.stringify(v)).join(' | ')
      return 'string'
    }
    case 'array':
      return `${tsBase(schema.items, depth, indentSize)}[]`
    case 'object': {
      const entries = Object.entries(schema.properties)
      if (entries.length === 0) return 'Record<string, never>'
      const lines = entries.map(([key, prop]) => {
        const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
        const optionalMark = prop.optional ? '?' : ''
        const tsStr = tsForSchema(prop.schema, { ...prop, optional: false }, depth + 1, indentSize)
        return `${padI}${safeName}${optionalMark}: ${tsStr}`
      })
      return `{\n${lines.join('\n')}\n${pad}}`
    }
    case 'union': {
      return schema.variants.map(v => tsBase(v, depth, indentSize)).join(' | ')
    }
  }
}

// ── Main generate function ───────────────────────────────────────────────────

export function generate(schema: InferredSchema, opts: GenerateOptions = {}): GenerateResult {
  const o = { ...DEFAULT_OPTS, ...opts }
  const name = toPascalCase(o.name)
  const schemaVarName = `${name[0]!.toLowerCase()}${name.slice(1)}Schema`

  const parts: string[] = []

  let zodCode: string | undefined
  let tsCode: string | undefined
  let fetchCode: string | undefined

  if (o.zod) {
    const body = zodBase(schema, 0, o.indent)
    zodCode = [
      `import { z } from 'zod'`,
      ``,
      `export const ${schemaVarName} = ${body}`,
      ``,
      `export type ${name} = z.infer<typeof ${schemaVarName}>`,
    ].join('\n')
    parts.push(zodCode)
  }

  if (o.typescript && !o.zod) {
    const body = tsBase(schema, 0, o.indent)
    tsCode = `export type ${name} = ${body}`
    parts.push(tsCode)
  }

  if (o.fetchWrapper && o.sourceUrl) {
    const url = o.sourceUrl
    const fetchFnName = `fetch${name}`
    const returnType = o.zod ? name : tsBase(schema, 0, o.indent)
    const parser = o.zod ? `${schemaVarName}.parse(await res.json())` : `(await res.json()) as ${name}`

    fetchCode = [
      ``,
      `export async function ${fetchFnName}(`,
      `  options?: RequestInit`,
      `): Promise<${returnType}> {`,
      `  const res = await fetch(${JSON.stringify(url)}, options)`,
      `  if (!res.ok) throw new Error(\`HTTP \${res.status}: \${res.statusText}\`)`,
      `  return ${parser}`,
      `}`,
    ].join('\n')
    parts.push(fetchCode)
  }

  return {
    ...(zodCode !== undefined ? { zod: zodCode } : {}),
    ...(tsCode !== undefined ? { typescript: tsCode } : {}),
    ...(fetchCode !== undefined ? { fetchWrapper: fetchCode } : {}),
    combined: parts.join('\n'),
  }
}
