import { inferSchema, mergeMultipleSamples } from './infer.js'
import { generate } from './generate.js'
import type { FetchOptions, GenerateOptions, GenerateResult } from './types.js'

// ── Re-exports ────────────────────────────────────────────────────────────────

export type {
  FetchOptions,
  GenerateOptions,
  GenerateResult,
  InferredSchema,
  OutputFormat,
  ApitypeConfig,
  EndpointConfig,
} from './types.js'

export { inferSchema, mergeMultipleSamples } from './infer.js'
export { generate } from './generate.js'
export { defineConfig, loadConfig, findConfig } from './config.js'
export { runBatch } from './batch.js'
export type { BatchResult, BatchOptions } from './batch.js'

// ── Core API ─────────────────────────────────────────────────────────────────

export interface FromJsonOptions extends GenerateOptions {
  samples?: unknown[]
}

/**
 * Generate types from a JSON value (in-memory).
 *
 * @example
 * const result = fromJson({ id: '550e8400-...', name: 'Alice' }, { name: 'User' })
 */
export function fromJson(data: unknown, opts: FromJsonOptions = {}): GenerateResult {
  const { samples, ...genOpts } = opts
  const schema = samples
    ? mergeMultipleSamples([data, ...samples])
    : inferSchema(data)
  return generate(schema, genOpts)
}

/**
 * Generate types by fetching a URL.
 *
 * @example
 * const result = await fromUrl('https://api.github.com/users/octocat', {
 *   name: 'GithubUser',
 *   fetchWrapper: true,
 * })
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
      headers: { Accept: 'application/json', ...headers },
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
 * Generate types from a raw JSON string.
 *
 * @example
 * const result = fromString('{"hello":"world"}', { name: 'Greeting' })
 */
export function fromString(json: string, opts: FromJsonOptions = {}): GenerateResult {
  return fromJson(JSON.parse(json) as unknown, opts)
}
