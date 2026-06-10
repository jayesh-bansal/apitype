import type { InferredSchema, PropertySchema } from '../types.js'

function ind(depth: number, size: number): string {
  return ' '.repeat(depth * size)
}

function zodForProp(
  schema: InferredSchema,
  prop: Pick<PropertySchema, 'optional' | 'nullable'>,
  depth: number,
  indentSize: number
): string {
  let base = zodBase(schema, depth, indentSize)
  if (prop.nullable && schema.kind !== 'null') base += '.nullable()'
  if (prop.optional) base += '.optional()'
  return base
}

export function zodBase(schema: InferredSchema, depth: number, indentSize: number): string {
  const pad = ind(depth, indentSize)
  const padI = ind(depth + 1, indentSize)

  switch (schema.kind) {
    case 'null':    return 'z.null()'
    case 'unknown': return 'z.unknown()'
    case 'boolean': return 'z.boolean()'
    case 'integer': return schema.min === 0 ? 'z.number().int().nonnegative()' : 'z.number().int()'
    case 'number':  return 'z.number()'

    case 'string': {
      if (schema.enum) {
        const vals = schema.enum.map(v => JSON.stringify(v)).join(', ')
        return `z.enum([${vals}])`
      }
      const fmtMap: Record<string, string> = {
        uuid:        'z.string().uuid()',
        cuid:        'z.string().cuid()',
        nanoid:      'z.string().nanoid()',
        email:       'z.string().email()',
        url:         'z.string().url()',
        datetime:    'z.string().datetime()',
        date:        'z.string().date()',
        time:        'z.string().time()',
        ip:          'z.string().ip({ version: "v4" })',
        ip6:         'z.string().ip({ version: "v6" })',
        'hex-color': 'z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)',
        base64:      'z.string().base64()',
        jwt:         'z.string().jwt()',
        semver:      'z.string().regex(/^\\d+\\.\\d+\\.\\d+/)',
      }
      return (schema.format && fmtMap[schema.format]) ?? 'z.string()'
    }

    case 'array':
      return `z.array(${zodBase(schema.items, depth, indentSize)})`

    case 'object': {
      const entries = Object.entries(schema.properties)
      if (entries.length === 0) return 'z.object({})'
      const lines = entries.map(([key, prop]) => {
        const k = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
        return `${padI}${k}: ${zodForProp(prop.schema, prop, depth + 1, indentSize)},`
      })
      return `z.object({\n${lines.join('\n')}\n${pad}})`
    }

    case 'union': {
      const vs = schema.variants.map(v => zodBase(v, depth, indentSize))
      return vs.length === 2
        ? `z.union([${vs[0]}, ${vs[1]}])`
        : `z.union([${vs.join(', ')}])`
    }
  }
}

export function generateZod(
  schema: InferredSchema,
  name: string,
  indentSize: number,
  fetchWrapper: boolean,
  sourceUrl?: string
): string {
  const schemaVar = `${name[0]!.toLowerCase()}${name.slice(1)}Schema`
  const body = zodBase(schema, 0, indentSize)

  const lines = [
    `import { z } from 'zod'`,
    ``,
    `export const ${schemaVar} = ${body}`,
    ``,
    `export type ${name} = z.infer<typeof ${schemaVar}>`,
  ]

  if (fetchWrapper && sourceUrl) {
    lines.push(
      ``,
      `export async function fetch${name}(options?: RequestInit): Promise<${name}> {`,
      `  const res = await fetch(${JSON.stringify(sourceUrl)}, options)`,
      `  if (!res.ok) throw new Error(\`HTTP \${res.status}: \${res.statusText}\`)`,
      `  return ${schemaVar}.parse(await res.json())`,
      `}`
    )
  }

  return lines.join('\n')
}
