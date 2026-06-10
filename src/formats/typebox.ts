import type { InferredSchema, PropertySchema } from '../types.js'

function ind(depth: number, size: number): string {
  return ' '.repeat(depth * size)
}

function tbForProp(
  schema: InferredSchema,
  prop: Pick<PropertySchema, 'optional' | 'nullable'>,
  depth: number,
  indentSize: number
): string {
  let base = tbBase(schema, depth, indentSize)
  if (prop.nullable && schema.kind !== 'null') {
    base = `Type.Union([${base}, Type.Null()])`
  }
  if (prop.optional) {
    base = `Type.Optional(${base})`
  }
  return base
}

export function tbBase(schema: InferredSchema, depth: number, indentSize: number): string {
  const pad = ind(depth, indentSize)
  const padI = ind(depth + 1, indentSize)

  switch (schema.kind) {
    case 'null':    return 'Type.Null()'
    case 'unknown': return 'Type.Unknown()'
    case 'boolean': return 'Type.Boolean()'
    case 'integer':
      return schema.min === 0
        ? 'Type.Integer({ minimum: 0 })'
        : 'Type.Integer()'
    case 'number':  return 'Type.Number()'

    case 'string': {
      if (schema.enum) {
        const variants = schema.enum.map(v => `Type.Literal(${JSON.stringify(v)})`).join(', ')
        return `Type.Union([${variants}])`
      }
      const fmtMap: Record<string, string> = {
        uuid:        'Type.String({ format: \'uuid\' })',
        email:       'Type.String({ format: \'email\' })',
        url:         'Type.String({ format: \'uri\' })',
        datetime:    'Type.String({ format: \'date-time\' })',
        date:        'Type.String({ format: \'date\' })',
        time:        'Type.String({ format: \'time\' })',
        ip:          'Type.String({ format: \'ipv4\' })',
        ip6:         'Type.String({ format: \'ipv6\' })',
        cuid:        'Type.String({ pattern: \'^c[a-z0-9]{24,}$\' })',
        nanoid:      'Type.String({ minLength: 21, maxLength: 21 })',
        base64:      'Type.String({ contentEncoding: \'base64\' })',
        jwt:         'Type.String({ pattern: \'^[\\\\w-]+\\\\.[\\\\w-]+\\\\.[\\\\w-]*$\' })',
        semver:      'Type.String({ pattern: \'^\\\\d+\\\\.\\\\d+\\\\.\\\\d+\' })',
        'hex-color': 'Type.String({ pattern: \'^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$\' })',
      }
      return (schema.format && fmtMap[schema.format]) ?? 'Type.String()'
    }

    case 'array':
      return `Type.Array(${tbBase(schema.items, depth, indentSize)})`

    case 'object': {
      const entries = Object.entries(schema.properties)
      if (entries.length === 0) return 'Type.Object({})'
      const lines = entries.map(([key, prop]) => {
        const k = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
        return `${padI}${k}: ${tbForProp(prop.schema, prop, depth + 1, indentSize)},`
      })
      return `Type.Object({\n${lines.join('\n')}\n${pad}})`
    }

    case 'union': {
      const vs = schema.variants.map(v => tbBase(v, depth, indentSize))
      return `Type.Union([${vs.join(', ')}])`
    }
  }
}

export function generateTypebox(
  schema: InferredSchema,
  name: string,
  indentSize: number,
  fetchWrapper: boolean,
  sourceUrl?: string
): string {
  const schemaVar = `${name[0]!.toLowerCase()}${name.slice(1)}Schema`
  const body = tbBase(schema, 0, indentSize)

  const lines = [
    `import { Type, Static } from '@sinclair/typebox'`,
    ``,
    `export const ${schemaVar} = ${body}`,
    ``,
    `export type ${name} = Static<typeof ${schemaVar}>`,
  ]

  if (fetchWrapper && sourceUrl) {
    lines.push(
      ``,
      `export async function fetch${name}(options?: RequestInit): Promise<${name}> {`,
      `  const res = await fetch(${JSON.stringify(sourceUrl)}, options)`,
      `  if (!res.ok) throw new Error(\`HTTP \${res.status}: \${res.statusText}\`)`,
      `  return (await res.json()) as ${name}`,
      `}`
    )
  }

  return lines.join('\n')
}
