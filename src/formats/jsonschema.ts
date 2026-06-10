import type { InferredSchema, PropertySchema } from '../types.js'

function jsBase(schema: InferredSchema): Record<string, unknown> {
  switch (schema.kind) {
    case 'null':    return { type: 'null' }
    case 'unknown': return {}
    case 'boolean': return { type: 'boolean' }
    case 'integer':
      return schema.min === 0
        ? { type: 'integer', minimum: 0 }
        : { type: 'integer' }
    case 'number':  return { type: 'number' }

    case 'string': {
      if (schema.enum) return { type: 'string', enum: schema.enum }
      const fmtMap: Record<string, string> = {
        uuid:     'uuid',
        email:    'email',
        url:      'uri',
        datetime: 'date-time',
        date:     'date',
        time:     'time',
        ip:       'ipv4',
        ip6:      'ipv6',
      }
      const fmt = schema.format ? fmtMap[schema.format] : undefined
      return fmt ? { type: 'string', format: fmt } : { type: 'string' }
    }

    case 'array':
      return { type: 'array', items: jsBase(schema.items) }

    case 'object': {
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const [key, prop] of Object.entries(schema.properties)) {
        if (prop.nullable && prop.schema.kind !== 'null') {
          properties[key] = { anyOf: [jsBase(prop.schema), { type: 'null' }] }
        } else {
          properties[key] = jsBase(prop.schema)
        }
        if (!prop.optional) required.push(key)
      }

      const obj: Record<string, unknown> = { type: 'object', properties }
      if (required.length > 0) obj['required'] = required
      obj['additionalProperties'] = false
      return obj
    }

    case 'union': {
      return { anyOf: schema.variants.map(jsBase) }
    }
  }
}

export function generateJsonSchema(
  schema: InferredSchema,
  name: string
): string {
  const result = {
    $schema: 'https://json-schema.org/draft-07/schema#',
    title: name,
    ...jsBase(schema),
  }
  return JSON.stringify(result, null, 2)
}

// Also generate a TypeScript type alongside the JSON Schema
export function generateJsonSchemaWithType(
  schema: InferredSchema,
  name: string
): string {
  const jsonSchema = generateJsonSchema(schema, name)
  return [
    `// JSON Schema for ${name}`,
    `// Validate with: ajv, zod (z.string().pipe()), or any JSON Schema validator`,
    `export const ${name[0]!.toLowerCase()}${name.slice(1)}Schema = ${jsonSchema} as const`,
  ].join('\n')
}
