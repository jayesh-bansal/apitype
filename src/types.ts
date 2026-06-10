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

/** Output format for generated code */
export type OutputFormat = 'zod' | 'typebox' | 'typescript' | 'jsonschema'

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
  /** Output format (default: 'zod') */
  format?: OutputFormat
  /** Include Zod schema — only when format is 'zod' (default: true) */
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
  /** Primary schema code (Zod / TypeBox / JSON Schema) */
  schema?: string
  /** TypeScript type alias code */
  typescript?: string
  /** Fetch wrapper function code */
  fetchWrapper?: string
  /** Combined output ready to write to a file */
  combined: string
  /** The format that was used */
  format: OutputFormat
}

export interface FetchOptions {
  headers?: Record<string, string>
  /** How many times to sample the URL for better nullable inference */
  samples?: number
  timeout?: number
}

// ── Config file types ────────────────────────────────────────────────────────

export interface EndpointConfig {
  /** URL to fetch or path to a local JSON file */
  url: string
  /** Schema name in PascalCase */
  name: string
  /** Output file path */
  out: string
  headers?: Record<string, string>
  samples?: number
  format?: OutputFormat
  fetchWrapper?: boolean
  timeout?: number
}

export interface ApitypeConfig {
  endpoints: EndpointConfig[]
  defaults?: {
    format?: OutputFormat
    fetchWrapper?: boolean
    samples?: number
    headers?: Record<string, string>
    timeout?: number
  }
}
