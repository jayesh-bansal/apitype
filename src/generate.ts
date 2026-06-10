import { generateZod } from './formats/zod.js'
import { generateTypebox } from './formats/typebox.js'
import { generateTypescript } from './formats/typescript.js'
import { generateJsonSchemaWithType } from './formats/jsonschema.js'
import type { GenerateOptions, GenerateResult, InferredSchema, OutputFormat } from './types.js'

const DEFAULT_NAME = 'Schema'
const DEFAULT_FORMAT: OutputFormat = 'zod'
const DEFAULT_INDENT = 2

export function generate(schema: InferredSchema, opts: GenerateOptions = {}): GenerateResult {
  const name = toPascalCase(opts.name ?? DEFAULT_NAME)
  const format: OutputFormat = opts.format ?? (opts.zod === false ? 'typescript' : DEFAULT_FORMAT)
  const indent = opts.indent ?? DEFAULT_INDENT
  const fetchWrapper = opts.fetchWrapper ?? false
  const sourceUrl = opts.sourceUrl

  let combined: string

  switch (format) {
    case 'zod':
      combined = generateZod(schema, name, indent, fetchWrapper, sourceUrl)
      break
    case 'typebox':
      combined = generateTypebox(schema, name, indent, fetchWrapper, sourceUrl)
      break
    case 'typescript':
      combined = generateTypescript(schema, name, indent, fetchWrapper, sourceUrl)
      break
    case 'jsonschema':
      combined = generateJsonSchemaWithType(schema, name)
      break
  }

  return { combined, format }
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => (c as string).toUpperCase())
    .replace(/^(.)/, (c: string) => (c as string).toUpperCase())
}
