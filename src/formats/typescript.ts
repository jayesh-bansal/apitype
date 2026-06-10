import type { InferredSchema, PropertySchema } from '../types.js'

function ind(depth: number, size: number): string {
  return ' '.repeat(depth * size)
}

function tsForProp(
  schema: InferredSchema,
  prop: Pick<PropertySchema, 'optional' | 'nullable'>,
  depth: number,
  indentSize: number
): string {
  let base = tsBase(schema, depth, indentSize)
  if (prop.nullable && schema.kind !== 'null') base += ' | null'
  return base
}

export function tsBase(schema: InferredSchema, depth: number, indentSize: number): string {
  const pad = ind(depth, indentSize)
  const padI = ind(depth + 1, indentSize)

  switch (schema.kind) {
    case 'null':    return 'null'
    case 'unknown': return 'unknown'
    case 'boolean': return 'boolean'
    case 'integer':
    case 'number':  return 'number'
    case 'string':
      if (schema.enum) return schema.enum.map(v => JSON.stringify(v)).join(' | ')
      return 'string'

    case 'array':
      return `${tsBase(schema.items, depth, indentSize)}[]`

    case 'object': {
      const entries = Object.entries(schema.properties)
      if (entries.length === 0) return 'Record<string, never>'
      const lines = entries.map(([key, prop]) => {
        const k = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
        const opt = prop.optional ? '?' : ''
        const val = tsForProp(prop.schema, { ...prop, optional: false }, depth + 1, indentSize)
        return `${padI}${k}${opt}: ${val}`
      })
      return `{\n${lines.join('\n')}\n${pad}}`
    }

    case 'union':
      return schema.variants.map(v => tsBase(v, depth, indentSize)).join(' | ')
  }
}

export function generateTypescript(
  schema: InferredSchema,
  name: string,
  indentSize: number,
  fetchWrapper: boolean,
  sourceUrl?: string
): string {
  const body = tsBase(schema, 0, indentSize)
  const lines = [`export type ${name} = ${body}`]

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
