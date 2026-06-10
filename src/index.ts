import { inferSchema, mergeMultipleSamples } from './infer.js'
import { generate } from './generate.js'
import type { FetchOptions, GenerateOptions, GenerateResult } from './types.js'

export type { FetchOptions, GenerateOptions, GenerateResult, InferredSchema } from './types.js'
export { inferSchema, mergeMultipleSamples } from './infer.js'
export { generate } from './generate.js'

// ── Public API ───────────────────────────────────────────────────────────────

export interface FromJsonOptions extends GenerateOptions {
  /** Infer from multiple JSON values for better nullable/optional detection */
  samples?: unknown[]
}

/**
 * Generate TypeScript types and Zod schemas from a JSON value.
 *
 * @example
 * ```ts
 * import { fromJson } from 'apitype'
 *
 * const result = await fromJson({ id: '123e4567-e89b-12d3-a456-426614174000', name: 'Alice' })
 * console.log(result.combined)
 * ```
 */
export function fromJson(data: unknown, opts: FromJsonOptions = {}): GenerateResult {
  const { samples, ...genOpts } = opts
  const schema = samples
    ? mergeMultipleSamples([data, ...samples])
    : inferSchema(data)
  return generate(schema, genOpts)
}

/**
 * Generate TypeScript types and Zod schemas by fetching a URL.
 *
 * @example
 * ```ts
 * import { fromUrl } from 'apitype'
 *
 * const result = await fromUrl('https://api.github.com/users/octocat', {
 *   name: 'GithubUser',
 *   fetchWrapper: true,
 * })
 * console.log(result.combined)
 * ```
 */
export async function fromUrl(
  url: string,
  opts: GenerateOptions & FetchOptions = {}
): Promise<GenerateResult> {
  const { headers, samples = 1, timeout = 10_000, ...genOpts } = opts

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  const fetchOne = async (): Promise<unknown> => {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', ...headers },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    return res.json() as Promise<unknown>
  }

  try {
    if (samples <= 1) {
      const data = await fetchOne()
      clearTimeout(timer)
      return fromJson(data, { ...genOpts, sourceUrl: url })
    }

    const results = await Promise.all(Array.from({ length: samples }, fetchOne))
    clearTimeout(timer)
    const [first, ...rest] = results
    return fromJson(first, { ...genOpts, sourceUrl: url, samples: rest })
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

/**
 * Generate TypeScript types and Zod schemas from a JSON string.
 */
export function fromString(json: string, opts: FromJsonOptions = {}): GenerateResult {
  return fromJson(JSON.parse(json), opts)
}
