import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCoverage, renderCoverageMarkdown, serializeCoverageJson } from './coverage.mjs'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || !value) throw new Error(`Argument invalide près de ${key ?? '<fin>'}`)
    args[key.slice(2)] = value
  }
  return args
}

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const args = parseArgs(process.argv.slice(2))

const registryPath = path.resolve(args.registry ?? path.join(here, 'regions/ready-sources.json'))
const manifestPath = args.manifest ? path.resolve(args.manifest) : null
const jsonPath = path.resolve(args['out-json'] ?? path.join(here, 'generated/coverage.json'))
const markdownPath = path.resolve(args['out-md'] ?? path.join(repoRoot, 'docs/generated/source-coverage.md'))

const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'))
let manifest = null
if (manifestPath) {
  manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
}

const coverage = buildCoverage(registry, manifest)
await fs.mkdir(path.dirname(jsonPath), { recursive: true })
await fs.mkdir(path.dirname(markdownPath), { recursive: true })
await fs.writeFile(jsonPath, serializeCoverageJson(coverage), 'utf8')
await fs.writeFile(markdownPath, renderCoverageMarkdown(coverage), 'utf8')

const regionalSources = new Set(coverage.entries.filter((entry) => entry.layer === 'regional').map((entry) => entry.sourceId))
console.log(
  `Couverture écrite : ${coverage.entries.length} entrées, ${regionalSources.size} sources régionales normalisées.`,
)
console.log(`JSON : ${jsonPath}`)
console.log(`Markdown : ${markdownPath}`)
