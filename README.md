# apitype

**Generate TypeScript types and Zod schemas from any API endpoint or JSON file — instantly.**

```sh
npx apitype https://api.github.com/users/octocat --name GithubUser
```

```ts
// ────────────────────────────────────────────────────────
import { z } from 'zod'

export const githubUserSchema = z.object({
  login: z.string(),
  id: z.number().int().nonnegative(),
  node_id: z.string(),
  avatar_url: z.string().url(),
  gravatar_id: z.string(),
  url: z.string().url(),
  html_url: z.string().url(),
  followers_url: z.string().url(),
  type: z.string(),
  site_admin: z.boolean(),
  name: z.string().nullable(),
  company: z.string().nullable(),
  blog: z.string().url().nullable(),
  location: z.string().nullable(),
  email: z.string().email().nullable(),
  bio: z.string().nullable(),
  public_repos: z.number().int().nonnegative(),
  public_gists: z.number().int().nonnegative(),
  followers: z.number().int().nonnegative(),
  following: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type GithubUser = z.infer<typeof githubUserSchema>
// ────────────────────────────────────────────────────────
```

No config. No code generation steps. No OpenAPI spec required.

---

## Features

- **Instant** — point at any URL or file and get typed output
- **Smart inference** — detects UUIDs, emails, URLs, datetimes, IPs, and more
- **Multi-sample** — fetch a URL multiple times to detect nullable/optional fields
- **Zod + TypeScript** — generates both by default, or either on its own
- **Fetch wrapper** — optionally generates a typed `async function fetchX()` for you
- **Stdin support** — pipe JSON from `curl` directly
- **Programmatic API** — use as a library in your own scripts
- **Zero runtime deps** for the library (Chalk + Ora are CLI-only)

---

## Install

```sh
# Run without installing (recommended for one-off use)
npx apitype <url|file>

# Or install globally
npm install -g apitype

# Or as a dev dependency for scripting
npm install -D apitype
```

---

## CLI Usage

### From a URL

```sh
# Basic
npx apitype https://api.github.com/users/octocat

# With a custom schema name
npx apitype https://api.github.com/users/octocat --name GithubUser

# With an auth header
npx apitype https://api.example.com/me \
  --header "Authorization: Bearer $TOKEN" \
  --name CurrentUser

# Write directly to a file
npx apitype https://api.example.com/products/1 \
  --name Product \
  --out src/types/product.ts

# Sample the URL 3 times to detect nullable and optional fields
npx apitype https://api.example.com/posts/random \
  --name Post \
  --samples 3

# Include a typed fetch wrapper
npx apitype https://api.example.com/users/1 \
  --name User \
  --fetch
```

### From a JSON file

```sh
npx apitype data.json --name MyData

# TypeScript types only (no Zod)
npx apitype data.json --ts-only --name MyData
```

### From stdin

```sh
curl -s https://api.github.com/users/octocat | npx apitype --name GithubUser

cat response.json | npx apitype --name ApiResponse
```

### All options

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--name` | `-n` | Schema name (PascalCase) | `Schema` |
| `--out` | `-o` | Write output to file | stdout |
| `--no-zod` | | Skip Zod schema | |
| `--ts-only` | | TypeScript types, no Zod import | |
| `--fetch` | | Include typed fetch wrapper | |
| `--samples` | `-s` | Fetch URL N times (improves nullable detection) | `1` |
| `--header` | `-H` | Add request header (repeatable) | |
| `--timeout` | | Fetch timeout in ms | `10000` |
| `--version` | `-v` | Print version | |
| `--help` | `-h` | Show help | |

---

## Programmatic API

### `fromUrl(url, options?)`

```ts
import { fromUrl } from 'apitype'

const result = await fromUrl('https://api.github.com/users/octocat', {
  name: 'GithubUser',
  fetchWrapper: true,
  samples: 3, // fetch 3 times for better nullable detection
})

console.log(result.combined) // full output
// result.zod        — Zod schema code
// result.typescript — TypeScript type code
// result.fetchWrapper — fetch wrapper code
```

### `fromJson(data, options?)`

```ts
import { fromJson } from 'apitype'

const data = { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Alice', age: 30 }

const result = fromJson(data, { name: 'User' })
console.log(result.combined)
// →
// import { z } from 'zod'
//
// export const userSchema = z.object({
//   id: z.string().uuid(),
//   name: z.string(),
//   age: z.number().int().nonnegative(),
// })
//
// export type User = z.infer<typeof userSchema>
```

### `fromString(json, options?)`

```ts
import { fromString } from 'apitype'

const result = fromString('{"hello":"world"}', { name: 'Greeting' })
```

### Multi-sample for better inference

When a field is **sometimes missing** or **sometimes null** across responses, `apitype` needs multiple samples to detect it. Use `--samples N` on the CLI or pass `samples` array to the library:

```ts
import { fromJson } from 'apitype'

// Provide multiple example payloads
const result = fromJson(
  { id: 1, name: 'Alice', bio: 'Developer' }, // primary
  {
    name: 'User',
    samples: [
      { id: 2, name: 'Bob' },            // bio missing → optional
      { id: 3, name: 'Carol', bio: null }, // bio null → nullable
    ],
  }
)
// bio will be: z.string().nullable().optional()
```

---

## Detected formats

`apitype` automatically detects these string patterns and applies the correct Zod validator:

| Pattern | Zod output |
|---------|-----------|
| UUID v4 | `z.string().uuid()` |
| CUID | `z.string().cuid()` |
| Nano ID (21 chars) | `z.string().nanoid()` |
| Email address | `z.string().email()` |
| `http://` / `https://` URL | `z.string().url()` |
| ISO 8601 datetime | `z.string().datetime()` |
| ISO 8601 date | `z.string().date()` |
| ISO 8601 time | `z.string().time()` |
| IPv4 address | `z.string().ip({ version: "v4" })` |
| IPv6 address | `z.string().ip({ version: "v6" })` |
| JWT | `z.string().jwt()` |
| Base64 | `z.string().base64()` |
| Semver | `z.string().regex(...)` |
| Hex color | `z.string().regex(...)` |

---

## Examples

### Stripe API

```sh
npx apitype https://api.stripe.com/v1/customers/cus_xxx \
  -H "Authorization: Bearer $STRIPE_KEY" \
  --name StripeCustomer \
  --out src/types/stripe.ts
```

### GitHub API — with fetch wrapper

```sh
npx apitype https://api.github.com/repos/octocat/Hello-World \
  --name GithubRepo \
  --fetch \
  --out src/lib/github.ts
```

Output includes:

```ts
export async function fetchGithubRepo(options?: RequestInit): Promise<GithubRepo> {
  const res = await fetch('https://api.github.com/repos/octocat/Hello-World', options)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return githubRepoSchema.parse(await res.json())
}
```

### Local JSON file

```sh
npx apitype db-export.json --name DbRecord --out src/types/db.ts
```

### JSON from clipboard (macOS/Linux)

```sh
pbpaste | npx apitype --name ClipboardData   # macOS
xclip -o | npx apitype --name ClipboardData  # Linux
```

---

## Why apitype?

| | apitype | quicktype | openapi-typescript |
|---|---------|-----------|-------------------|
| Works from live URL | ✅ | ✅ | ❌ (needs spec) |
| Generates Zod schemas | ✅ | ❌ | ❌ |
| Detects field formats | ✅ | Partial | N/A |
| Multi-sample nullable inference | ✅ | ❌ | N/A |
| Typed fetch wrapper | ✅ | ❌ | ❌ |
| Zero config | ✅ | ✅ | ❌ |
| Programmatic API | ✅ | ❌ | ✅ |
| Bundle size (library) | ~0kb (0 deps) | ~2MB | ~100kb |

---

## Contributing

Contributions are welcome! Please open an issue before submitting a PR for large changes.

```sh
git clone https://github.com/yourusername/apitype
cd apitype
npm install
npm test
```

---

## License

MIT
