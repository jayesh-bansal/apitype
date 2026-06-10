export type PrimitiveType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null'
  | 'unknown'

export type StringFormat =
  | 'uuid'
  | 'email'
  | 'url'
  | 'datetime'
  | 'date'
  | 'time'
  | 'ip'
  | 'ip6'
  | 'cuid'
  | 'nanoid'
  | 'base64'
  | 'jwt'
  | 'semver'
  | 'hex-color'

export type InferredSchema =
  | { kind: 'null' }
  | { kind: 'unknown' }
  | { kind: 'boolean' }
  | { kind: 'integer'; min?: number }
  | { kind: 'number' }
  | { kind: 'string'; format?: StringFormat; enum?: readonly string[] }
  | { kind: 'array'; items: InferredSchema; minLength?: number }
  | { kind: 'object'; properties: Record<string, PropertySchema>; description?: string }
  | { kind: 'union'; variants: InferredSchema[] }

export interface PropertySchema {
  schema: InferredSchema
  optional: boolean
  nullable: boolean
}

export interface GenerateOptions {
  /** Root schema name (PascalCase) */
  name?: string
  /** Include Zod schema alongside TypeScript types (default: true) */
  zod?: boolean
  /** Include TypeScript type alias (default: true) */
  typescript?: boolean
  /** Include a typed fetch wrapper function (default: false) */
  fetchWrapper?: boolean
  /** The source URL (used in fetch wrapper) */
  sourceUrl?: string
  /** Indent with spaces (default: 2) */
  indent?: number
}

export interface GenerateResult {
  /** Zod schema code (if requested) */
  zod?: string
  /** TypeScript type alias code (if requested) */
  typescript?: string
  /** Fetch wrapper function code (if requested) */
  fetchWrapper?: string
  /** Combined output */
  combined: string
}

export interface FetchOptions {
  headers?: Record<string, string>
  /** How many times to sample the URL (merges results for better nullable inference) */
  samples?: number
  timeout?: number
}
