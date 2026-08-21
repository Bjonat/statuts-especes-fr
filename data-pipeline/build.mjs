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
const outputPath = args.out ?? 'public/data/catalog.json'

if (!taxrefPath || !bdcPath) {
  throw new Error('Usage: node data-pipeline/build.mjs --taxref <TAXREFv18.txt> --bdc <bdc_statuts_18.csv> [--out public/data/catalog.json]')
}

console.log('Lecture de TAXREF v18…')
const taxa = await buildTaxa(taxrefPath)
console.log(`${taxa.length.toLocaleString('fr-FR')} taxons acceptés faune/flore retenus.`)

console.log('Lecture de la BDC Statuts v18…')
const statuses = await buildStatuses(bdcPath, taxa)
console.log(`${statuses.length.toLocaleString('fr-FR')} relations taxon × territoire × statut retenues.`)

const catalog = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  official: true,
  regions: publicRegions(),
  taxa,
  statuses,
  sources: buildSources(),
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, `${JSON.stringify(catalog)}\n`, 'utf8')

const stats = await fs.stat(outputPath)
console.log(`Catalogue écrit dans ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} Mio).`)
