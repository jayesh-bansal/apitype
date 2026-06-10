/**
 * MCP (Model Context Protocol) server — lets AI assistants like Claude and
 * Cursor call apitype as a tool directly.
 *
 * Usage: apitype --mcp
 * Then add to claude_desktop_config.json or .cursor/mcp.json.
 */
import { createInterface } from 'node:readline'
import { fromUrl, fromString } from './index.js'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string | null
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

const SERVER_INFO = { name: 'apitype', version: '0.2.0' }

const TOOLS = [
  {
    name: 'generate_from_url',
    description:
      'Fetch a URL and generate TypeScript types + Zod/TypeBox/JSON Schema. ' +
      'Use this when the user wants types for an API endpoint.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'HTTP/HTTPS URL to fetch' },
        name: { type: 'string', description: 'PascalCase schema name (e.g. "GithubUser")' },
        format: {
          type: 'string',
          enum: ['zod', 'typebox', 'typescript', 'jsonschema'],
          description: 'Output format (default: zod)',
        },
        fetchWrapper: {
          type: 'boolean',
          description: 'Include a typed async fetch() wrapper function',
        },
        samples: {
          type: 'number',
          description: 'Fetch N times to detect nullable/optional fields (default: 1)',
        },
        headers: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'HTTP headers (e.g. Authorization)',
        },
      },
    },
  },
  {
    name: 'generate_from_json',
    description:
      'Generate TypeScript types + Zod/TypeBox/JSON Schema from a JSON string. ' +
      'Use this when the user pastes a JSON payload and wants types for it.',
    inputSchema: {
      type: 'object',
      required: ['json'],
      properties: {
        json: { type: 'string', description: 'Raw JSON string to generate types from' },
        name: { type: 'string', description: 'PascalCase schema name (e.g. "Product")' },
        format: {
          type: 'string',
          enum: ['zod', 'typebox', 'typescript', 'jsonschema'],
          description: 'Output format (default: zod)',
        },
        fetchWrapper: { type: 'boolean' },
      },
    },
  },
  {
    name: 'generate_from_multiple_samples',
    description:
      'Generate types from multiple JSON samples to correctly detect nullable and optional fields. ' +
      'Use when you have several example responses from the same endpoint.',
    inputSchema: {
      type: 'object',
      required: ['samples'],
      properties: {
        samples: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of JSON strings (at least 2)',
        },
        name: { type: 'string', description: 'PascalCase schema name' },
        format: {
          type: 'string',
          enum: ['zod', 'typebox', 'typescript', 'jsonschema'],
        },
      },
    },
  },
]

type ToolArgs = Record<string, unknown>

async function callTool(name: string, args: ToolArgs): Promise<string> {
  const genOpts = {
    name: args['name'] as string | undefined,
    format: args['format'] as 'zod' | 'typebox' | 'typescript' | 'jsonschema' | undefined,
    fetchWrapper: args['fetchWrapper'] as boolean | undefined,
  }

  if (name === 'generate_from_url') {
    const result = await fromUrl(args['url'] as string, {
      ...genOpts,
      headers: args['headers'] as Record<string, string> | undefined,
      samples: args['samples'] as number | undefined,
    })
    return result.combined
  }

  if (name === 'generate_from_json') {
    const result = fromString(args['json'] as string, genOpts)
    return result.combined
  }

  if (name === 'generate_from_multiple_samples') {
    const rawSamples = args['samples'] as string[]
    const [first, ...rest] = rawSamples.map(s => JSON.parse(s) as unknown)
    const { fromJson } = await import('./index.js')
    const result = fromJson(first, { ...genOpts, samples: rest })
    return result.combined
  }

  throw new Error(`Unknown tool: ${name}`)
}

async function handleMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  try {
    switch (msg.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: SERVER_INFO,
            capabilities: { tools: {} },
          },
        }

      case 'initialized':
        return null

      case 'ping':
        return { jsonrpc: '2.0', id: msg.id, result: {} }

      case 'tools/list':
        return { jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } }

      case 'tools/call': {
        const { name, arguments: toolArgs } =
          msg.params as { name: string; arguments: ToolArgs }
        const text = await callTool(name, toolArgs)
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text }] },
        }
      }

      default:
        return {
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: `Method not found: ${msg.method}` },
        }
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

export async function startMcpServer(): Promise<void> {
  // Redirect all console output to stderr — stdout is reserved for JSON-RPC
  const origLog = console.log
  const origWarn = console.warn
  console.log = (...a) => process.stderr.write(a.join(' ') + '\n')
  console.warn = (...a) => process.stderr.write(a.join(' ') + '\n')

  process.stderr.write(`[apitype MCP] server started (${SERVER_INFO.version})\n`)

  const rl = createInterface({ input: process.stdin, terminal: false })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let msg: JsonRpcRequest
    try {
      msg = JSON.parse(trimmed) as JsonRpcRequest
    } catch {
      continue
    }

    const response = await handleMessage(msg)
    if (response !== null) {
      process.stdout.write(JSON.stringify(response) + '\n')
    }
  }

  console.log = origLog
  console.warn = origWarn
}
