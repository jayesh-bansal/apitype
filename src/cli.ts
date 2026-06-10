import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fromJson, fromString, fromUrl } from './index.js'
import type { GenerateOptions } from './types.js'

// Dynamic imports to avoid bundling issues
const chalk = await import('chalk').then(m => m.default)
const ora = await import('ora').then(m => m.default)

// ── Helpers ──────────────────────────────────────────────────────────────────

function printHeader(): void {
  console.log()
  console.log(chalk.bold.cyan('  apitype') + chalk.dim('  v' + getVersion()))
  console.log(chalk.dim('  TypeScript types + Zod schemas from any API or JSON'))
  console.log()
}

function getVersion(): string {
  try {
    const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    return (JSON.parse(pkg) as { version: string }).version
  } catch {
    return '0.0.0'
  }
}

function printHelp(): void {
  printHeader()
  console.log(`${chalk.bold('Usage')}`)
  console.log(`  ${chalk.cyan('apitype')} ${chalk.yellow('<url>')}           Fetch URL and generate types`)
  console.log(`  ${chalk.cyan('apitype')} ${chalk.yellow('<file.json>')}     Generate from local JSON file`)
  console.log(`  ${chalk.cyan('apitype')} ${chalk.dim('(no args)')}         Read JSON from stdin`)
  console.log()
  console.log(`${chalk.bold('Options')}`)
  console.log(`  ${chalk.cyan('--name')}, ${chalk.cyan('-n')}     <name>   Schema name (PascalCase)  ${chalk.dim('[default: Schema]')}`)
  console.log(`  ${chalk.cyan('--out')},  ${chalk.cyan('-o')}     <file>   Write output to file`)
  console.log(`  ${chalk.cyan('--no-zod')}              Skip Zod schema generation`)
  console.log(`  ${chalk.cyan('--ts-only')}             TypeScript types only (no Zod import)`)
  console.log(`  ${chalk.cyan('--fetch')}               Include typed fetch wrapper function`)
  console.log(`  ${chalk.cyan('--samples')}, ${chalk.cyan('-s')}  <n>      Fetch URL N times for better inference`)
  console.log(`  ${chalk.cyan('--header')}, ${chalk.cyan('-H')}   <k:v>    Add request header (repeatable)`)
  console.log(`  ${chalk.cyan('--timeout')}   <ms>     Fetch timeout in ms  ${chalk.dim('[default: 10000]')}`)
  console.log(`  ${chalk.cyan('--version')}, ${chalk.cyan('-v')}           Show version`)
  console.log(`  ${chalk.cyan('--help')},    ${chalk.cyan('-h')}           Show this help`)
  console.log()
  console.log(`${chalk.bold('Examples')}`)
  console.log(`  ${chalk.dim('# From a live URL')}`)
  console.log(`  ${chalk.cyan('apitype')} https://api.github.com/users/octocat ${chalk.yellow('--name GithubUser')}`)
  console.log()
  console.log(`  ${chalk.dim('# With auth header + fetch wrapper')}`)
  console.log(`  ${chalk.cyan('apitype')} https://api.example.com/me ${chalk.yellow('-H "Authorization: Bearer TOKEN" --fetch')}`)
  console.log()
  console.log(`  ${chalk.dim('# From a local file')}`)
  console.log(`  ${chalk.cyan('apitype')} data.json ${chalk.yellow('--name Product --out types.ts')}`)
  console.log()
  console.log(`  ${chalk.dim('# From stdin')}`)
  console.log(`  ${chalk.cyan('curl')} -s https://api.github.com/users/octocat | ${chalk.cyan('apitype')} ${chalk.yellow('--name GithubUser')}`)
  console.log()
}

function parseArgs(argv: string[]): {
  input?: string
  name?: string
  out?: string
  zod: boolean
  typescript: boolean
  fetchWrapper: boolean
  samples: number
  headers: Record<string, string>
  timeout: number
  help: boolean
  version: boolean
} {
  const args = argv.slice(2)
  const result = {
    input: undefined as string | undefined,
    name: undefined as string | undefined,
    out: undefined as string | undefined,
    zod: true,
    typescript: true,
    fetchWrapper: false,
    samples: 1,
    headers: {} as Record<string, string>,
    timeout: 10_000,
    help: false,
    version: false,
  }

  let i = 0
  while (i < args.length) {
    const arg = args[i]!
    switch (arg) {
      case '--help':
      case '-h':
        result.help = true
        break
      case '--version':
      case '-v':
        result.version = true
        break
      case '--no-zod':
        result.zod = false
        break
      case '--ts-only':
        result.zod = false
        result.typescript = true
        break
      case '--fetch':
        result.fetchWrapper = true
        break
      case '--name':
      case '-n':
        result.name = args[++i]
        break
      case '--out':
      case '-o':
        result.out = args[++i]
        break
      case '--samples':
      case '-s':
        result.samples = parseInt(args[++i]!, 10) || 1
        break
      case '--timeout':
        result.timeout = parseInt(args[++i]!, 10) || 10_000
        break
      case '--header':
      case '-H': {
        const header = args[++i]!
        const colonIdx = header.indexOf(':')
        if (colonIdx > -1) {
          result.headers[header.slice(0, colonIdx).trim()] = header.slice(colonIdx + 1).trim()
        }
        break
      }
      default:
        if (!arg.startsWith('-')) result.input = arg
    }
    i++
  }

  return result
}

function isUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://')
}

function isJsonFile(str: string): boolean {
  return str.endsWith('.json')
}

function printResult(code: string, out: string | undefined): void {
  if (out) {
    const outPath = isAbsolute(out) ? out : resolve(process.cwd(), out)
    writeFileSync(outPath, code, 'utf8')
    console.log(chalk.green('✓') + ' Written to ' + chalk.bold(outPath))
  } else {
    // Syntax-highlight the output with simple coloring
    const highlighted = code
      .replace(/(import|export|from|const|type|async|function|await|return|if|throw)\b/g,
        w => chalk.magenta(w))
      .replace(/('zod'|"zod")/g, chalk.yellow("'zod'"))
      .replace(/(z\.\w+\(\))/g, w => chalk.cyan(w))
      .replace(/(z\.\w+)/g, w => chalk.cyan(w))

    console.log()
    console.log(chalk.dim('─'.repeat(60)))
    console.log(highlighted)
    console.log(chalk.dim('─'.repeat(60)))
    console.log()
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve('')
      return
    }
    let data = ''
    const rl = createInterface({ input: process.stdin })
    rl.on('line', line => { data += line + '\n' })
    rl.on('close', () => resolve(data.trim()))
    rl.on('error', reject)
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv)

  if (args.version) {
    console.log(getVersion())
    process.exit(0)
  }

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  printHeader()

  const genOpts: GenerateOptions = {
    name: args.name ?? 'Schema',
    zod: args.zod,
    typescript: args.typescript,
    fetchWrapper: args.fetchWrapper,
  }

  let result: Awaited<ReturnType<typeof fromUrl>>

  // ── URL input ────────────────────────────────────────────────────────────
  if (args.input && isUrl(args.input)) {
    const spinner = ora({
      text: `Fetching ${chalk.cyan(args.input)}${args.samples > 1 ? ` × ${args.samples}` : ''}…`,
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
      spinner.fail(`Failed to fetch: ${(err as Error).message}`)
      process.exit(1)
    }

  // ── JSON file input ──────────────────────────────────────────────────────
  } else if (args.input && isJsonFile(args.input)) {
    const filePath = isAbsolute(args.input) ? args.input : resolve(process.cwd(), args.input)
    const spinner = ora({ text: `Reading ${chalk.cyan(filePath)}…`, color: 'cyan' }).start()
    try {
      const raw = readFileSync(filePath, 'utf8')
      result = fromString(raw, genOpts)
      spinner.succeed(`Parsed ${chalk.cyan(filePath)}`)
    } catch (err) {
      spinner.fail(`Failed to read file: ${(err as Error).message}`)
      process.exit(1)
    }

  // ── Stdin input ──────────────────────────────────────────────────────────
  } else {
    const raw = args.input ? null : await readStdin()
    if (!raw) {
      printHelp()
      process.exit(0)
    }
    const spinner = ora({ text: 'Parsing JSON from stdin…', color: 'cyan' }).start()
    try {
      result = fromString(raw, genOpts)
      spinner.succeed('Parsed stdin')
    } catch (err) {
      spinner.fail(`Invalid JSON: ${(err as Error).message}`)
      process.exit(1)
    }
  }

  // ── Output ───────────────────────────────────────────────────────────────
  if (!args.out) {
    const schemaName = (args.name ?? 'Schema').replace(/^./, c => c.toUpperCase())
    const zodNote = args.zod ? chalk.dim(' · requires ') + chalk.cyan('zod') : ''
    console.log(chalk.green(`✓ Generated ${chalk.bold(schemaName)}`) + zodNote)
  }

  printResult(result.combined, args.out)

  if (!args.out && args.zod) {
    console.log(chalk.dim('  Install Zod: ') + chalk.cyan('npm install zod'))
    console.log()
  }
}

main().catch(err => {
  console.error(chalk.red('Error: ') + (err as Error).message)
  process.exit(1)
})
