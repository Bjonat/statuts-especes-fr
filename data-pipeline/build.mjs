import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildSources, buildStatuses, buildTaxa, publicRegions } from './pipeline.mjs'

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

const args = parseArgs(process.argv.slice(2))
const taxrefPath = args.taxref
const bdcPath = args.bdc
const outputDirectory = args.out ?? 'public/data'

if (!taxrefPath || !bdcPath) {
  throw new Error('Usage: node data-pipeline/build.mjs --taxref <TAXREFv18.txt> --bdc <bdc_statuts_18.csv> [--out public/data]')
}

console.log('Lecture de TAXREF v18…')
const taxa = await buildTaxa(taxrefPath)
console.log(`${taxa.length.toLocaleString('fr-FR')} taxons acceptés faune/flore retenus.`)

console.log('Lecture de la BDC Statuts v18…')
const statuses = await buildStatuses(bdcPath, taxa)
console.log(`${statuses.length.toLocaleString('fr-FR')} relations taxon × territoire × statut retenues.`)

const generatedAt = new Date().toISOString()
const sources = buildSources(generatedAt.slice(0, 10))
const catalog = {
  schemaVersion: 1,
  generatedAt,
  official: true,
  regions: publicRegions(),
  taxa,
  statuses,
  sources,
}

const catalogJson = `${JSON.stringify(catalog)}\n`
const hash = crypto.createHash('sha256').update(catalogJson).digest('hex').slice(0, 12)
const catalogFile = `catalog-${hash}.json`
const manifest = {
  schemaVersion: 1,
  generatedAt,
  datasetVersion: hash,
  catalogFile,
  taxrefVersion: '18',
  bdcVersion: '18',
  sources,
}

await fs.mkdir(outputDirectory, { recursive: true })
await fs.writeFile(path.join(outputDirectory, catalogFile), catalogJson, 'utf8')
await fs.writeFile(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const stats = await fs.stat(path.join(outputDirectory, catalogFile))
console.log(`Catalogue écrit dans ${path.join(outputDirectory, catalogFile)} (${(stats.size / 1024 / 1024).toFixed(1)} Mio).`)
console.log(`Manifest écrit dans ${path.join(outputDirectory, 'manifest.json')}.`)
