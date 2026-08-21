import { rowsFromFile } from './pipeline.mjs'

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

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

const args = parseArgs(process.argv.slice(2))
if (!args.taxref || !args.bdc) {
  throw new Error('Usage: node data-pipeline/analyze.mjs --taxref <TAXREFv18.txt> --bdc <bdc.csv>')
}

const ranks = new Map()
const realms = new Map()
const frStatuses = new Map()
const metadataByRef = new Map()
let accepted = 0
let metropolitanCandidates = 0

for await (const row of rowsFromFile(args.taxref)) {
  if (String(row.cd_nom) !== String(row.cd_ref)) continue
  const kingdom = String(row.regne || '').trim()
  if (!['Animalia', 'Plantae'].includes(kingdom)) continue

  const cdRef = Number.parseInt(String(row.cd_ref), 10)
  const rank = String(row.rang || '<vide>').trim()
  const fr = String(row.fr || '<vide>').trim()

  accepted += 1
  increment(realms, kingdom)
  increment(ranks, `${kingdom}:${rank}`)
  increment(frStatuses, `${kingdom}:${fr}`)
  metadataByRef.set(cdRef, { kingdom, rank, fr })

  if (!['<vide>', 'A', 'Q'].includes(fr)) metropolitanCandidates += 1
}

console.log(`Accepted Animalia/Plantae: ${accepted}`)
console.log('By realm:', Object.fromEntries([...realms].sort()))
console.log(`Metropolitan candidates (FR renseigné hors A/Q): ${metropolitanCandidates}`)
console.log('FR biogeographic statuses:')
for (const [key, count] of [...frStatuses].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${count}`)
}

console.log('Accepted ranks:')
for (const [key, count] of [...ranks].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${count}`)
}

const statusTypes = new Map()
const statusRanks = new Map()
let bdcRows = 0
let bdcRowsOnAcceptedFaunaFlora = 0
for await (const row of rowsFromFile(args.bdc)) {
  bdcRows += 1
  increment(statusTypes, String(row.cd_type_statut || '<vide>').trim())

  const cdRef = Number.parseInt(String(row.cd_ref || ''), 10)
  const metadata = metadataByRef.get(cdRef)
  if (metadata) {
    bdcRowsOnAcceptedFaunaFlora += 1
    increment(statusRanks, `${metadata.kingdom}:${metadata.rank}`)
  }
}

console.log(`BDC rows: ${bdcRows}`)
console.log(`BDC rows on accepted Animalia/Plantae: ${bdcRowsOnAcceptedFaunaFlora}`)
console.log('BDC rows by accepted taxon rank:')
for (const [key, count] of [...statusRanks].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${count}`)
}

console.log('BDC status types:')
for (const [key, count] of [...statusTypes].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${count}`)
}
