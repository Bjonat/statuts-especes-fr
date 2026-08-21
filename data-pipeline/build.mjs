import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildStatusDictionary, statusToCompactLink } from './compact.mjs'
import {
  buildSources,
  buildStatuses,
  buildTaxa,
  filterTaxaForMetropolitanRegions,
  publicRegions,
} from './pipeline.mjs'
import { loadRegionalPackages, mergeRegionalPackages } from './regional.mjs'

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

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12)
}

async function writeDataset(outputDirectory, prefix, rows) {
  const json = `${JSON.stringify(rows)}\n`
  const hash = hashContent(json)
  const file = `${prefix}-${hash}.json`
  const filePath = path.join(outputDirectory, file)
  await fs.writeFile(filePath, json, 'utf8')
  const stats = await fs.stat(filePath)
  console.log(`  ${file}: ${rows.length.toLocaleString('fr-FR')} lignes, ${(stats.size / 1024 / 1024).toFixed(1)} Mio`)
  return { file, count: rows.length }
}

async function clearGeneratedDatasets(outputDirectory) {
  try {
    const entries = await fs.readdir(outputDirectory)
    await Promise.all(
      entries
        .filter((entry) => /^(?:catalog|taxa|statuses|status-definitions|status-links)-.*\.json$/.test(entry))
        .map((entry) => fs.rm(path.join(outputDirectory, entry))),
    )
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

const args = parseArgs(process.argv.slice(2))
const taxrefPath = args.taxref
const bdcPath = args.bdc
const outputDirectory = args.out ?? 'public/data'
const regionalDirectory = args['regional-dir']

if (!taxrefPath || !bdcPath) {
  throw new Error('Usage: node data-pipeline/build.mjs --taxref <TAXREFv18.txt> --bdc <bdc.csv> [--regional-dir <dossier>] [--out public/data]')
}

console.log('Lecture de TAXREF v18…')
const searchableTaxa = await buildTaxa(taxrefPath)
console.log(`${searchableTaxa.length.toLocaleString('fr-FR')} taxons de rang espèce/infraspécifique retenus avant filtre territorial.`)

console.log('Lecture de la BDC Statuts v18…')
let statuses = await buildStatuses(bdcPath, searchableTaxa)
console.log(`${statuses.length.toLocaleString('fr-FR')} relations taxon × territoire × statut BDC retenues.`)

const regionalPackages = await loadRegionalPackages(regionalDirectory)
const regionalMerge = mergeRegionalPackages(statuses, searchableTaxa, regionalPackages)
statuses = regionalMerge.statuses
for (const diagnostic of regionalMerge.diagnostics) {
  console.log(`Source régionale ${diagnostic.sourceId}: ${diagnostic.imported.toLocaleString('fr-FR')} statuts importés, ${diagnostic.unknownRefs.toLocaleString('fr-FR')} CD_REF inconnus.`)
}
if (regionalPackages.length) {
  console.log(`${regionalPackages.length.toLocaleString('fr-FR')} paquet(s) régional(aux) appliqué(s).`)
}

const taxa = filterTaxaForMetropolitanRegions(searchableTaxa, statuses)
const keptRefs = new Set(taxa.map((taxon) => taxon.cdRef))
statuses = statuses.filter((status) => keptRefs.has(status.cdRef))
console.log(`${taxa.length.toLocaleString('fr-FR')} taxons conservés après filtre métropolitain sécurisé.`)

const { definitions, definitionIds } = buildStatusDictionary(statuses)
console.log(`${definitions.length.toLocaleString('fr-FR')} définitions de statut uniques après déduplication.`)

const realmByRef = new Map(taxa.map((taxon) => [taxon.cdRef, taxon.realm]))
const taxaByRealm = {
  flora: taxa.filter((taxon) => taxon.realm === 'flora'),
  fauna: taxa.filter((taxon) => taxon.realm === 'fauna'),
}
const regions = publicRegions()
const linksByRealmRegion = {
  flora: Object.fromEntries(regions.map((region) => [region.code, []])),
  fauna: Object.fromEntries(regions.map((region) => [region.code, []])),
}

for (const status of statuses) {
  const realm = realmByRef.get(status.cdRef)
  if (!realm) continue
  linksByRealmRegion[realm][status.region].push(statusToCompactLink(status, definitionIds))
}

await fs.mkdir(outputDirectory, { recursive: true })
await clearGeneratedDatasets(outputDirectory)

console.log('Écriture des jeux offline compacts…')
const files = {
  taxa: {
    flora: await writeDataset(outputDirectory, 'taxa-flora', taxaByRealm.flora),
    fauna: await writeDataset(outputDirectory, 'taxa-fauna', taxaByRealm.fauna),
  },
  statusDefinitions: await writeDataset(outputDirectory, 'status-definitions', definitions),
  statusLinks: {
    flora: {},
    fauna: {},
  },
}

for (const realm of ['flora', 'fauna']) {
  for (const region of regions) {
    files.statusLinks[realm][region.code] = await writeDataset(
      outputDirectory,
      `status-links-${realm}-${region.code.toLowerCase()}`,
      linksByRealmRegion[realm][region.code],
    )
  }
}

const generatedAt = new Date().toISOString()
const sources = [...buildSources(generatedAt.slice(0, 10)), ...regionalMerge.sources]
const datasetVersion = hashContent(JSON.stringify(files))
const manifest = {
  schemaVersion: 3,
  generatedAt,
  datasetVersion,
  official: true,
  taxrefVersion: '18',
  bdcVersion: '18',
  regions,
  sources,
  files,
}

await fs.writeFile(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Manifest v3 écrit dans ${path.join(outputDirectory, 'manifest.json')} (${datasetVersion}).`)
