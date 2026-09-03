import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildOebCsvZnieff, diagnosticsForOebCsvZnieff } from './adapters/oeb-csv-znieff.mjs'
import {
  buildSourceDiagnostic,
  formatQualityLog,
  validateQualityConfig,
  validateSourceDiagnostic,
} from './diagnostics.mjs'
import { validateRegionalPackage } from './regional.mjs'

const ADAPTERS = {
  'oeb-csv-znieff': {
    build: buildOebCsvZnieff,
    diagnostics: diagnosticsForOebCsvZnieff,
  },
}

const here = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REGISTRY = path.join(here, 'regions/ready-sources.json')

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) throw new Error(`Argument inattendu: ${key}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Valeur manquante pour ${key}`)
    args[key.slice(2)] = value
    index += 1
  }
  return args
}

async function loadRegistry(registry, registryPath) {
  if (registry) return registry
  const filePath = registryPath ?? DEFAULT_REGISTRY
  return JSON.parse(await readFile(filePath, 'utf8'))
}

function findSource(registry, sourceId) {
  const source = registry.sources?.find((item) => item.id === sourceId)
  if (!source) throw new Error(`Source inconnue: ${sourceId}`)
  return source
}

function findCsvResource(source) {
  const resource = (source.resources ?? []).find((item) => item.kind === 'csv')
  if (!resource) throw new Error(`Source ${source.id} : ressource CSV introuvable`)
  return resource
}

async function requireFile(filePath, label) {
  try {
    await access(filePath)
  } catch {
    throw new Error(`${label} introuvable: ${filePath}`)
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value)}\n`, 'utf8')
}

export async function runAdapter({
  registry,
  registryPath,
  sourceId,
  taxrefPath,
  inputPath,
  outputPath,
  diagnosticsPath,
  checkedAt,
}) {
  if (!sourceId) throw new Error('sourceId obligatoire')
  if (!taxrefPath) throw new Error('taxrefPath obligatoire')
  if (!inputPath) throw new Error('inputPath obligatoire')
  if (!outputPath) throw new Error('outputPath obligatoire')

  const loaded = await loadRegistry(registry, registryPath)
  const source = findSource(loaded, sourceId)
  if (source.state === 'WITNESS') {
    throw new Error(`Source ${sourceId} est WITNESS et ne peut pas être publiée`)
  }
  if (!source.adapter) {
    throw new Error(`Source ${sourceId} n'a pas d'adaptateur déclaré`)
  }
  const adapter = ADAPTERS[source.adapter]
  if (!adapter) {
    throw new Error(`Adaptateur inconnu: ${source.adapter}`)
  }

  const resource = findCsvResource(source)
  await requireFile(taxrefPath, 'TAXREF')
  await requireFile(inputPath, 'Fichier d’entrée')

  const pkg = await adapter.build({
    source,
    resource,
    taxrefPath,
    inputPath,
    checkedAt: checkedAt ?? new Date().toISOString().slice(0, 10),
  })
  validateRegionalPackage(pkg, path.basename(outputPath))

  if (adapter.diagnostics) {
    validateQualityConfig(source.quality, source.id)
    const diagnostic = buildSourceDiagnostic({
      source,
      resource,
      package: pkg,
      adapterMetrics: adapter.diagnostics(pkg),
    })
    validateSourceDiagnostic(diagnostic)
    console.log(formatQualityLog(diagnostic))
    if (diagnosticsPath) await writeJson(diagnosticsPath, diagnostic)
    if (diagnostic.quality.status === 'fail') {
      throw new Error(formatQualityLog(diagnostic))
    }
  }

  await writeJson(outputPath, pkg)
  return pkg
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await runAdapter({
    registryPath: args.registry,
    sourceId: args.source,
    taxrefPath: args.taxref,
    inputPath: args.input,
    outputPath: args.out,
    diagnosticsPath: args['diagnostics-out'],
    checkedAt: args['checked-at'],
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
