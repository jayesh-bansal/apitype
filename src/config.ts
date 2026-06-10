import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'
import type { ApitypeConfig } from './types.js'

export { type ApitypeConfig, type EndpointConfig } from './types.js'

/** Use in apitype.config.js for type-safe config */
export function defineConfig(config: ApitypeConfig): ApitypeConfig {
  return config
}

const CONFIG_NAMES = [
  'apitype.config.json',
  'apitype.config.js',
  'apitype.config.mjs',
  '.apityperc.json',
  '.apityperc',
]

/** Find config file starting from cwd */
export function findConfig(cwd: string = process.cwd()): string | null {
  for (const name of CONFIG_NAMES) {
    const p = resolve(cwd, name)
    if (existsSync(p)) return p
  }
  return null
}

/** Interpolate ${ENV_VAR} patterns in strings (for headers with API keys) */
function interpolateEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, key: string) => process.env[key] ?? '')
}

function interpolateHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!headers) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) out[k] = interpolateEnv(v)
  return out
}

/** Load and parse a config file. Supports .json and .js/.mjs (ESM). */
export async function loadConfig(configPath: string): Promise<ApitypeConfig> {
  const abs = isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath)

  if (!existsSync(abs)) throw new Error(`Config file not found: ${abs}`)

  let raw: ApitypeConfig

  if (abs.endsWith('.json') || abs.endsWith('.rc')) {
    raw = JSON.parse(readFileSync(abs, 'utf8')) as ApitypeConfig
  } else if (abs.endsWith('.js') || abs.endsWith('.mjs') || abs.endsWith('.cjs')) {
    const mod = await import(abs) as { default?: ApitypeConfig } | ApitypeConfig
    raw = ('default' in mod && mod.default ? mod.default : mod) as ApitypeConfig
  } else {
    // Try JSON first, then JS
    try {
      raw = JSON.parse(readFileSync(abs, 'utf8')) as ApitypeConfig
    } catch {
      const mod = await import(abs) as { default?: ApitypeConfig } | ApitypeConfig
      raw = ('default' in mod && mod.default ? mod.default : mod) as ApitypeConfig
    }
  }

  if (!Array.isArray(raw.endpoints)) {
    throw new Error(`Config must have an "endpoints" array`)
  }

  // Apply env interpolation to all headers
  return {
    ...raw,
    defaults: raw.defaults
      ? { ...raw.defaults, headers: interpolateHeaders(raw.defaults.headers) }
      : undefined,
    endpoints: raw.endpoints.map(ep => ({
      ...ep,
      headers: interpolateHeaders(ep.headers),
    })),
  }
}
