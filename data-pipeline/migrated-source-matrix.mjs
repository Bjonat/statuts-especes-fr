import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REGISTRY = path.join(here, 'regions/ready-sources.json')

function declaredAdapter(source) {
  return typeof source.adapter === 'string' && source.adapter.trim() !== ''
}

function csvResources(source) {
  return (source.resources ?? []).filter((resource) => resource?.kind === 'csv')
}

function migratedSourceEntry(source) {
  const csvs = csvResources(source)
  if (csvs.length === 0) {
    throw new Error(`Source ${source.id} : ressource CSV introuvable`)
  }
  if (csvs.length > 1) {
    throw new Error(`Source ${source.id} : plusieurs ressources CSV`)
  }
  const resource = csvs[0]
  if (typeof resource.url !== 'string' || resource.url.trim() === '') {
    throw new Error(`Source ${source.id} : url CSV absente`)
  }
  if (typeof resource.pipelineId !== 'string' || resource.pipelineId.trim() === '') {
    throw new Error(`Source ${source.id} : pipelineId manquant`)
  }
  return {
    sourceId: source.id,
    adapter: source.adapter.trim(),
    region: source.region,
    pipelineId: resource.pipelineId,
    inputKind: 'csv',
    inputUrl: resource.url,
  }
}

export function buildMigratedSourceMatrix(registry) {
  const include = []
  for (const source of registry.sources ?? []) {
    if (source.state !== 'IMPORTED') continue
    if (!declaredAdapter(source)) continue
    include.push(migratedSourceEntry(source))
  }
  include.sort((left, right) => left.sourceId.localeCompare(right.sourceId))
  if (include.length === 0) {
    throw new Error('Aucune source migrée dans le registre')
  }
  return { include }
}

async function main() {
  const registryPath = process.argv[2] ?? DEFAULT_REGISTRY
  const registry = JSON.parse(await readFile(registryPath, 'utf8'))
  process.stdout.write(JSON.stringify(buildMigratedSourceMatrix(registry)))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
