# apitype

**Generate TypeScript types, Zod schemas, TypeBox, and JSON Schema from any API endpoint or JSON — instantly.**

```sh
npx apitype https://api.github.com/users/octocat --name GithubUser
```

```ts
import { z } from 'zod'

export const githubUserSchema = z.object({
  login: z.string(),
  id: z.number().int().nonnegative(),
  avatar_url: z.string().url(),
  email: z.string().email().nullable(),
  created_at: z.string().datetime(),
  public_repos: z.number().int().nonnegative(),
  site_admin: z.boolean(),
  // ...
})

export type GithubUser = z.infer<typeof githubUserSchema>
```

Zero config. No OpenAPI spec needed. Works as a **CLI**, **MCP server for AI assistants**, **Vite plugin**, and **GitHub Action**.

[![npm version](https://img.shields.io/npm/v/apitype.svg)](https://www.npmjs.com/package/apitype)
[![npm downloads](https://img.shields.io/npm/dm/apitype.svg)](https://www.npmjs.com/package/apitype)
[![CI](https://github.com/jayesh-bansal/apitype/actions/workflows/ci.yml/badge.svg)](https://github.com/jayesh-bansal/apitype/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Why apitype?

Every developer writing API integrations writes the same boilerplate: copy a JSON response, manually type every field, figure out which are nullable, which are optional, what format that date string is.

**apitype eliminates all of that.** Point it at any URL — it fetches the response, infers every field's type and format, and outputs production-ready code.

```
Before:  20 minutes of manual typing + guessing nullable fields
After:   npx apitype <url>   →  3 seconds
```

And in 2026, when your team uses AI coding assistants daily — apitype is the tool those assistants call under the hood.

---

## Features

- **4 output formats** — Zod, TypeBox, TypeScript-only, JSON Schema
- **Smart format detection** — 14 patterns: UUID, email, URL, datetime, IP, JWT, CUID, NanoID, base64, semver, hex-color, and more
- **Multi-sample inference** — fetch a URL multiple times to detect nullable and optional fields accurately
- **Batch mode** — define all your endpoints in a config file, generate everything with one command
- **Watch mode** — re-generate automatically when config or files change
- **Typed fetch wrapper** — generates a production-ready `async function fetchX()` alongside the schema
- **MCP server** — AI assistants like Claude and Cursor call apitype as a tool directly
- **Vite plugin** — types regenerated at dev server start, zero workflow change
- **GitHub Action** — keep types in sync in CI, fail if they drift
- **ENV var interpolation** — use `${API_KEY}` in config headers, never hardcode secrets
- **Programmatic API** — `import { fromUrl, fromJson } from 'apitype'`
- **Zero library deps** — Chalk and Ora are CLI-only; the library ships with no runtime dependencies

---

## Install

```sh
# One-off use (no install)
npx apitype <url|file>

# Global install
npm install -g apitype

# Dev dependency (for programmatic use or Vite plugin)
npm install -D apitype
```

---

## CLI

### Single endpoint

```sh
# From a URL
npx apitype https://api.github.com/users/octocat

# Custom name
npx apitype https://api.github.com/users/octocat --name GithubUser

# TypeBox format
npx apitype https://api.example.com/products/1 --format typebox --name Product

# With auth header + typed fetch wrapper + write to file
npx apitype https://api.example.com/me \
  --header "Authorization: Bearer $TOKEN" \
  --name CurrentUser \
  --fetch \
  --out src/types/me.ts

# Sample 5 times for accurate nullable/optional detection
npx apitype https://api.example.com/posts/random --name Post --samples 5

# From a local JSON file
npx apitype response.json --name ApiResponse --out src/types/api.ts

# From stdin
curl -s https://api.github.com/users/octocat | npx apitype --name GithubUser
```

### Batch mode

Create `apitype.config.json`:

```json
{
  "endpoints": [
    {
      "url": "https://api.github.com/users/octocat",
      "name": "GithubUser",
      "out": "src/types/github.ts"
    },
    {
      "url": "https://api.stripe.com/v1/customers",
      "name": "StripeCustomer",
      "out": "src/types/stripe.ts",
      "headers": { "Authorization": "Bearer ${STRIPE_SECRET_KEY}" }
    },
    {
      "url": "https://api.example.com/products/1",
      "name": "Product",
      "out": "src/types/product.ts",
      "format": "typebox",
      "fetchWrapper": true,
      "samples": 3
    }
  ],
  "defaults": {
    "format": "zod",
    "fetchWrapper": false
  }
}
```

Then run:

```sh
npx apitype                          # auto-detects apitype.config.json
npx apitype --config my-config.json  # explicit path
npx apitype --config apitype.config.json --watch  # re-run on changes
```

### All flags

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--name` | `-n` | Schema name (PascalCase) | `Schema` |
| `--format` | `-f` | `zod` \| `typebox` \| `typescript` \| `jsonschema` | `zod` |
| `--out` | `-o` | Write output to file | stdout |
| `--fetch` | | Include typed fetch wrapper | |
| `--samples` | `-s` | Fetch URL N times | `1` |
| `--header` | `-H` | Add request header (repeatable) | |
| `--timeout` | | Fetch timeout in ms | `10000` |
| `--config` | `-c` | Batch config file | auto-detect |
| `--watch` | `-w` | Re-run on config/file changes | |
| `--mcp` | | Start MCP server for AI assistants | |
| `--version` | `-v` | Print version | |
| `--help` | `-h` | Show help | |

---

## MCP Server (for AI assistants)

apitype ships as an **MCP (Model Context Protocol) server** — the standard protocol used by Claude, Cursor, Windsurf, and other AI coding assistants to call external tools.

Once configured, your AI assistant can generate types without you lifting a finger:

> *"Generate Zod types for our products endpoint"*
> → Claude calls `apitype.generate_from_url` → types appear in your file

### Setup

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "apitype": {
      "command": "npx",
      "args": ["apitype", "--mcp"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json` in your project or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "apitype": {
      "command": "npx",
      "args": ["apitype@latest", "--mcp"]
    }
  }
}
```

**Windsurf / other MCP clients** — same pattern, `command: npx`, `args: ["apitype", "--mcp"]`.

### Available MCP tools

| Tool | Description |
|------|-------------|
| `generate_from_url` | Fetch a URL and generate types |
| `generate_from_json` | Generate types from a JSON string |
| `generate_from_multiple_samples` | Merge multiple JSON samples for accurate nullable inference |

All tools accept `name`, `format` (`zod`/`typebox`/`typescript`/`jsonschema`), and `fetchWrapper` options.

---

## Vite Plugin

```sh
npm install -D apitype
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { apitype } from 'apitype/vite'

export default defineConfig({
  plugins: [
    apitype({
      endpoints: [
        {
          url: 'https://api.example.com/users/1',
          name: 'User',
          out: 'src/types/user.ts',
        },
        {
          url: 'https://api.example.com/products',
          name: 'ProductList',
          out: 'src/types/products.ts',
          format: 'typebox',
          fetchWrapper: true,
        },
      ],
      defaults: { format: 'zod' },
    }),
  ],
})
```

Types are generated at `vite dev` startup and `vite build` — no manual step required.

Options:
- `skipIfExists: true` — only generate if the output file doesn't exist yet (fast re-runs)
- `verbose: false` — silence the generation log

---

## GitHub Action

Add to `.github/workflows/sync-types.yml`:

```yaml
name: Sync API Types

on:
  schedule:
    - cron: '0 6 * * *'   # daily at 6am
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate types from API endpoints
        uses: jayesh-bansal/apitype@v1
        with:
          config: apitype.config.json
          fail-on-diff: 'true'
        env:
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
```

**Inputs:**

| Input | Description | Default |
|-------|-------------|---------|
| `config` | Path to config file | `apitype.config.json` |
| `version` | apitype version to use | `latest` |
| `fail-on-diff` | Fail if generated types differ from committed | `true` |
| `commit-changes` | Auto-commit updated types | `false` |
| `commit-message` | Commit message when auto-committing | `chore: sync api types [skip ci]` |

---

## Programmatic API

```sh
npm install apitype
```

### `fromUrl(url, options?)`

```ts
import { fromUrl } from 'apitype'

const result = await fromUrl('https://api.github.com/users/octocat', {
  name: 'GithubUser',
  format: 'zod',         // 'zod' | 'typebox' | 'typescript' | 'jsonschema'
  fetchWrapper: true,    // generate a typed fetch() wrapper
  samples: 3,            // fetch 3× for better nullable/optional detection
  headers: { 'Authorization': 'Bearer token' },
  timeout: 15_000,
})

console.log(result.combined)  // full file content
// result.format → 'zod'
```

### `fromJson(data, options?)`

```ts
import { fromJson } from 'apitype'

const result = fromJson(
  { id: '550e8400-...', name: 'Alice', bio: 'Developer' },
  {
    name: 'User',
    format: 'zod',
    // Pass multiple samples for accurate nullable/optional detection
    samples: [
      { id: '...', name: 'Bob' },            // bio missing → optional
      { id: '...', name: 'Carol', bio: null }, // bio null → nullable
    ],
  }
)
// bio: z.string().nullable().optional()
```

### `fromString(json, options?)`

```ts
import { fromString } from 'apitype'

const result = fromString('{"hello":"world"}', { name: 'Greeting' })
```

### Batch processing

```ts
import { loadConfig, runBatch } from 'apitype'

const config = await loadConfig('apitype.config.json')
const results = await runBatch(config, {
  onProgress: (ep, i, total) => console.log(`[${i}/${total}] ${ep.name}`),
  onDone: (r) => console.log(`✓ ${r.outPath}`),
  onError: (ep, err) => console.error(`✗ ${ep.name}: ${err.message}`),
})
```

### `defineConfig` for type-safe config files

```ts
// apitype.config.js
import { defineConfig } from 'apitype'

export default defineConfig({
  endpoints: [
    {
      url: 'https://api.github.com/users/octocat',
      name: 'GithubUser',
      out: 'src/types/github.ts',
    },
  ],
  defaults: { format: 'zod' },
})
```

---

## Detected formats

| Input | Zod | TypeBox | JSON Schema |
|-------|-----|---------|-------------|
| UUID v4 | `z.string().uuid()` | `Type.String({ format: 'uuid' })` | `"format": "uuid"` |
| CUID | `z.string().cuid()` | `Type.String({ pattern: ... })` | `"type": "string"` |
| Nano ID | `z.string().nanoid()` | `Type.String({ minLength: 21 })` | `"type": "string"` |
| Email | `z.string().email()` | `Type.String({ format: 'email' })` | `"format": "email"` |
| URL | `z.string().url()` | `Type.String({ format: 'uri' })` | `"format": "uri"` |
| ISO datetime | `z.string().datetime()` | `Type.String({ format: 'date-time' })` | `"format": "date-time"` |
| ISO date | `z.string().date()` | `Type.String({ format: 'date' })` | `"format": "date"` |
| ISO time | `z.string().time()` | `Type.String({ format: 'time' })` | `"format": "time"` |
| IPv4 | `z.string().ip({ version: "v4" })` | `Type.String({ format: 'ipv4' })` | `"format": "ipv4"` |
| IPv6 | `z.string().ip({ version: "v6" })` | `Type.String({ format: 'ipv6' })` | `"format": "ipv6"` |
| JWT | `z.string().jwt()` | `Type.String({ pattern: ... })` | `"type": "string"` |
| Base64 | `z.string().base64()` | `Type.String({ contentEncoding: 'base64' })` | `"type": "string"` |
| Semver | `z.string().regex(...)` | `Type.String({ pattern: ... })` | `"type": "string"` |
| Hex color | `z.string().regex(...)` | `Type.String({ pattern: ... })` | `"type": "string"` |

---

## Examples

### Stripe API

```sh
STRIPE_SECRET_KEY=sk_test_... \
npx apitype https://api.stripe.com/v1/customers/cus_xxx \
  -H "Authorization: Bearer $STRIPE_SECRET_KEY" \
  --name StripeCustomer \
  --out src/types/stripe.ts
```

### Internal API with multiple samples

```sh
# Fetch 5 times to correctly detect nullable/optional fields
npx apitype https://your-api.com/api/users/random \
  -H "Authorization: Bearer $API_TOKEN" \
  --name User \
  --samples 5 \
  --out src/types/user.ts
```

### TypeBox for Fastify

```sh
npx apitype https://api.example.com/products/1 \
  --format typebox \
  --name Product \
  --fetch \
  --out src/types/product.ts
```

Output:

```ts
import { Type, Static } from '@sinclair/typebox'

export const productSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  price: Type.Number(),
  createdAt: Type.String({ format: 'date-time' }),
})

export type Product = Static<typeof productSchema>

export async function fetchProduct(options?: RequestInit): Promise<Product> {
  const res = await fetch('https://api.example.com/products/1', options)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return (await res.json()) as Product
}
```

### Clipboard (macOS/Linux)

```sh
pbpaste | npx apitype --name ApiResponse   # macOS
xclip -o | npx apitype --name ApiResponse  # Linux
```

---

## Comparison

| | apitype | quicktype | openapi-typescript | json-to-ts |
|---|---------|-----------|-------------------|------------|
| From live URL | ✅ | ✅ | ❌ (needs spec) | ❌ |
| Zod schemas | ✅ | ❌ | ❌ | ❌ |
| TypeBox schemas | ✅ | ❌ | ❌ | ❌ |
| JSON Schema output | ✅ | ✅ | ❌ | ❌ |
| Multi-sample nullable detection | ✅ | ❌ | N/A | ❌ |
| Typed fetch wrapper | ✅ | ❌ | ❌ | ❌ |
| MCP server (AI assistant tool) | ✅ | ❌ | ❌ | ❌ |
| Batch config file | ✅ | ❌ | ✅ | ❌ |
| Vite plugin | ✅ | ❌ | ❌ | ❌ |
| GitHub Action | ✅ | ❌ | ❌ | ❌ |
| Watch mode | ✅ | ❌ | ❌ | ❌ |
| Library (0 runtime deps) | ✅ | ❌ | ✅ | ✅ |
| ENV var interpolation in config | ✅ | ❌ | ❌ | ❌ |

---

## Contributing

Contributions are welcome! Open an issue before large PRs.

```sh
git clone https://github.com/jayesh-bansal/apitype
cd apitype
npm install
npm test
npm run dev   # watch mode build
```

### Project structure

```
src/
├── infer.ts          # JSON → InferredSchema (pattern detection)
├── generate.ts       # InferredSchema → code (dispatches to formats)
├── formats/
│   ├── zod.ts        # Zod schema generator
│   ├── typebox.ts    # TypeBox schema generator
│   ├── typescript.ts # TypeScript-only generator
│   └── jsonschema.ts # JSON Schema generator
├── config.ts         # Config file loading + defineConfig
├── batch.ts          # Batch endpoint processing
├── mcp.ts            # MCP server (stdio JSON-RPC)
├── vite.ts           # Vite plugin
├── index.ts          # Public API
└── cli.ts            # CLI entry
```

---

## License

MIT © [Jayesh Bansal](https://github.com/jayesh-bansal)
