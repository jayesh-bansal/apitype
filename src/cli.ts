import { readFileSync, writeFileSync, watch as fsWatch } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fromJson, fromString, fromUrl, loadConfig, findConfig, runBatch } from './index.js'
import { startMcpServer } from './mcp.js'
import type { GenerateOptions, OutputFormat } from './types.js'

const chalk = await import('chalk').then(m => m.default)
const ora = await import('ora').then(m => m.default)

// ── Helpers ──────────────────────────────────────────────────────────────────

function getVersion(): string {
  try {
    const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    return (JSON.parse(pkg) as { version: string }).version
  } catch { return '0.0.0' }
}

function printHeader(): void {
  console.log()
  console.log(chalk.bold.cyan('  apitype') + chalk.dim('  v' + getVersion()))
  console.log(chalk.dim('  TypeScript types · Zod · TypeBox · JSON Schema — from any API'))
  console.log()
}

function printHelp(): void {
  printHeader()
  console.log(`${chalk.bold('Usage')}`)
  console.log(`  ${chalk.cyan('apitype')} ${chalk.yellow('<url|file>')}         Generate from URL or JSON file`)
  console.log(`  ${chalk.cyan('apitype')} ${chalk.dim('(no args)')}            Read JSON from stdin`)
  console.log(`  ${chalk.cyan('apitype')} ${chalk.yellow('--config')} ${chalk.dim('[file]')}     Run batch from config file`)
  console.log(`  ${chalk.cyan('apitype')} ${chalk.yellow('--mcp')}             Start MCP server for AI assistants`)
  console.log()
  console.log(`${chalk.bold('Options')}`)
  console.log(`  ${chalk.cyan('--name')},    ${chalk.cyan('-n')}  <name>   Schema name (PascalCase)`)
  console.log(`  ${chalk.cyan('--format')},  ${chalk.cyan('-f')}  <fmt>    zod │ typebox │ typescript │ jsonschema  ${chalk.dim('[default: zod]')}`)
  console.log(`  ${chalk.cyan('--out')},     ${chalk.cyan('-o')}  <file>   Write output to file`)
  console.log(`  ${chalk.cyan('--fetch')}              Include typed fetch wrapper`)
  console.log(`  ${chalk.cyan('--samples')}, ${chalk.cyan('-s')}  <n>      Fetch URL N times (better nullable detection)`)
  console.log(`  ${chalk.cyan('--header')},  ${chalk.cyan('-H')}  <k:v>    Add request header (repeatable)`)
  console.log(`  ${chalk.cyan('--timeout')}     <ms>    Fetch timeout  ${chalk.dim('[default: 10000]')}`)
  console.log(`  ${chalk.cyan('--config')},  ${chalk.cyan('-c')}  <file>   Batch config file`)
  console.log(`  ${chalk.cyan('--watch')},   ${chalk.cyan('-w')}           Re-run on config/file changes`)
  console.log(`  ${chalk.cyan('--mcp')}                Start MCP server (stdio JSON-RPC)`)
  console.log(`  ${chalk.cyan('--version')}, ${chalk.cyan('-v')}           Show version`)
  console.log(`  ${chalk.cyan('--help')},    ${chalk.cyan('-h')}           Show this help`)
  console.log()
  console.log(`${chalk.bold('Formats')}`)
  console.log(`  ${chalk.cyan('zod')}         Zod schema + TypeScript type  ${chalk.dim('(requires: zod)')}`)
  console.log(`  ${chalk.cyan('typebox')}     TypeBox schema + TypeScript type  ${chalk.dim('(requires: @sinclair/typebox)')}`)
  console.log(`  ${chalk.cyan('typescript')}  TypeScript type only  ${chalk.dim('(no runtime dependency)')}`)
  console.log(`  ${chalk.cyan('jsonschema')}  JSON Schema (draft-07)`)
  console.log()
  console.log(`${chalk.bold('Examples')}`)
  console.log(`  ${chalk.dim('# From a live URL')}`)
  console.log(`  ${chalk.cyan('apitype')} https://api.github.com/users/octocat ${chalk.yellow('-n GithubUser')}`)
  console.log()
  console.log(`  ${chalk.dim('# TypeBox format with fetch wrapper')}`)
  console.log(`  ${chalk.cyan('apitype')} https://api.example.com/me ${chalk.yellow('-f typebox --fetch -n Me')}`)
  console.log()
  console.log(`  ${chalk.dim('# Batch mode from config file')}`)
  console.log(`  ${chalk.cyan('apitype')} ${chalk.yellow('--config apitype.config.json')}`)
  console.log()
  console.log(`  ${chalk.dim('# MCP server for Claude / Cursor')}`)
  console.log(`  ${chalk.cyan('apitype')} ${chalk.yellow('--mcp')}`)
  console.log()
  console.log(`  ${chalk.dim('# From stdin (pipe from curl)')}`)
  console.log(`  curl -s https://api.github.com/users/octocat | ${chalk.cyan('apitype')} ${chalk.yellow('-n GithubUser')}`)
  console.log()
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const result = {
    input: undefined as string | undefined,
    name: undefined as string | undefined,
    out: undefined as string | undefined,
    format: 'zod' as OutputFormat,
    fetchWrapper: false,
    samples: 1,
    headers: {} as Record<string, string>,
    timeout: 10_000,
    config: undefined as string | undefined,
    watch: false,
    mcp: false,
    help: false,
    version: false,
  }

  let i = 0
  while (i < args.length) {
    const arg = args[i]!
    switch (arg) {
      case '--help':    case '-h': result.help = true; break
      case '--version': case '-v': result.version = true; break
      case '--mcp':                result.mcp = true; break
      case '--watch':   case '-w': result.watch = true; break
      case '--fetch':              result.fetchWrapper = true; break
      case '--name':    case '-n': result.name = args[++i]; break
      case '--out':     case '-o': result.out = args[++i]; break
      case '--config':  case '-c': result.config = args[++i]; break
      case '--samples': case '-s': result.samples = parseInt(args[++i]!, 10) || 1; break
      case '--timeout':            result.timeout = parseInt(args[++i]!, 10) || 10_000; break
      case '--format':  case '-f': {
        const f = args[++i] as OutputFormat
        if (['zod','typebox','typescript','jsonschema'].includes(f)) result.format = f
        break
      }
      case '--header':  case '-H': {
        const h = args[++i]!
        const ci = h.indexOf(':')
        if (ci > -1) result.headers[h.slice(0, ci).trim()] = h.slice(ci + 1).trim()
        break
      }
      default:
        if (!arg.startsWith('-')) result.input = arg
    }
    i++
  }
  return result
}

function isUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://')
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) { resolve(''); return }
    let data = ''
    const rl = createInterface({ input: process.stdin })
    rl.on('line', l => { data += l + '\n' })
    rl.on('close', () => resolve(data.trim()))
    rl.on('error', reject)
  })
}

function printResult(code: string, out: string | undefined, format: OutputFormat): void {
  if (out) {
    const p = isAbsolute(out) ? out : resolve(process.cwd(), out)
    writeFileSync(p, code, 'utf8')
    console.log(chalk.green('✓') + ' Written to ' + chalk.bold(p))
    return
  }

  const highlighted = code
    .replace(/(import|export|from|const|type|async|function|await|return|if|throw)\b/g,
      w => chalk.magenta(w))
    .replace(/(z\.[a-zA-Z]+)/g, w => chalk.cyan(w))
    .replace(/(Type\.[a-zA-Z]+)/g, w => chalk.blue(w))

  console.log()
  console.log(chalk.dim('─'.repeat(64)))
  console.log(highlighted)
  console.log(chalk.dim('─'.repeat(64)))
  console.log()

  const deps: Record<OutputFormat, string | null> = {
    zod:        'npm install zod',
    typebox:    'npm install @sinclair/typebox',
    typescript: null,
    jsonschema: null,
  }
  const dep = deps[format]
  if (dep) console.log(chalk.dim('  Install: ') + chalk.cyan(dep) + '\n')
}

// ── Batch mode ───────────────────────────────────────────────────────────────

async function runBatchMode(configPath: string): Promise<boolean> {
  const spinner = ora({ text: `Loading ${chalk.cyan(configPath)}…`, color: 'cyan' }).start()
  let config
  try {
    config = await loadConfig(configPath)
    spinner.succeed(`Loaded ${config.endpoints.length} endpoint(s)`)
  } catch (err) {
    spinner.fail(`Failed to load config: ${(err as Error).message}`)
    return false
  }

  let failed = false
  await runBatch(config, {
    onProgress(ep, i, total) {
      process.stdout.write(chalk.dim(`  [${i}/${total}] `) + chalk.cyan(ep.url) + ' → ' + ep.out + '\n')
    },
    onDone(r) {
      process.stdout.write(chalk.green('  ✓ ') + chalk.bold(r.endpoint.name) + chalk.dim(` → ${r.outPath}`) + '\n')
    },
    onError(ep, err) {
      process.stdout.write(chalk.red('  ✗ ') + ep.name + ': ' + err.message + '\n')
      failed = true
    },
  })

  return !failed
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)

  if (args.version) { console.log(getVersion()); process.exit(0) }
  if (args.help) { printHelp(); process.exit(0) }

  // ── MCP server mode ──────────────────────────────────────────────────────
  if (args.mcp) {
    await startMcpServer()
    return
  }

  printHeader()

  // ── Batch / config mode ──────────────────────────────────────────────────
  const configPath = args.config ?? findConfig()

  if (configPath && !args.input) {
    const ok = await runBatchMode(configPath)

    if (args.watch) {
      console.log(chalk.dim(`\n  Watching ${configPath} for changes…`))
      fsWatch(configPath, { persistent: true }, async () => {
        console.log(chalk.dim(`\n  Config changed, regenerating…\n`))
        await runBatchMode(configPath)
      })
    } else {
      process.exit(ok ? 0 : 1)
    }
    return
  }

  // ── Single endpoint mode ─────────────────────────────────────────────────
  const genOpts: GenerateOptions = {
    name: args.name ?? 'Schema',
    format: args.format,
    fetchWrapper: args.fetchWrapper,
  }

  let result: Awaited<ReturnType<typeof fromUrl>>

  if (args.input && isUrl(args.input)) {
    const spinner = ora({
      text: `Fetching ${chalk.cyan(args.input)}${args.samples > 1 ? ` ×${args.samples}` : ''}…`,
      color: 'cyan',
    }).start()
    try {
      result = await fromUrl(args.input, {
        ...genOpts,
        headers: args.headers,
        samples: args.samples,
        timeout: args.timeout,
        sourceUrl: args.input,
      })
      spinner.succeed(`Fetched ${chalk.cyan(args.input)}`)
    } catch (err) {
      spinner.fail(`Failed: ${(err as Error).message}`)
      process.exit(1)
    }

  } else if (args.input) {
    const p = isAbsolute(args.input) ? args.input : resolve(process.cwd(), args.input)
    const spinner = ora({ text: `Reading ${chalk.cyan(p)}…`, color: 'cyan' }).start()
    try {
      result = fromString(readFileSync(p, 'utf8'), genOpts)
      spinner.succeed(`Parsed ${chalk.cyan(p)}`)
    } catch (err) {
      spinner.fail(`Failed: ${(err as Error).message}`)
      process.exit(1)
    }

    if (args.watch) {
      console.log(chalk.dim(`  Watching ${p} for changes…\n`))
      fsWatch(p, () => {
        try {
          const r = fromString(readFileSync(p, 'utf8'), genOpts)
          printResult(r.combined, args.out, r.format)
        } catch (e) {
          console.error(chalk.red('Error: ') + (e as Error).message)
        }
      })
    }

  } else {
    const raw = await readStdin()
    if (!raw) { printHelp(); process.exit(0) }
    const spinner = ora({ text: 'Parsing stdin…', color: 'cyan' }).start()
    try {
      result = fromString(raw, genOpts)
      spinner.succeed('Parsed stdin')
    } catch (err) {
      spinner.fail(`Invalid JSON: ${(err as Error).message}`)
      process.exit(1)
    }
  }

  const schemaName = (args.name ?? 'Schema').replace(/^./, c => c.toUpperCase())
  if (!args.out) {
    console.log(chalk.green(`✓ Generated ${chalk.bold(schemaName)}`))
  }
  printResult(result.combined, args.out, result.format)
}

main().catch(err => {
  console.error(chalk.red('Error: ') + (err as Error).message)
  process.exit(1)
})
