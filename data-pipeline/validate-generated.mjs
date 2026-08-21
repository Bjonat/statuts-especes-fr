import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

function findStatus(statuses, cdRef, predicate) {
  return statuses.find((status) => status.cdRef === cdRef && predicate(status))
}

const args = parseArgs(process.argv.slice(2))
const directory = args.dir ?? 'public/data'
const manifest = await readJson(path.join(directory, 'manifest.json'))

assert.equal(manifest.schemaVersion, 2, 'manifest schemaVersion')
assert.equal(manifest.official, true, 'manifest officiel')
assert.equal(manifest.taxrefVersion, '18', 'version TAXREF')
assert.equal(manifest.bdcVersion, '18', 'version BDC')
assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(manifest.generatedAt), 'date de génération valide')

for (const source of manifest.sources) {
  assert.equal(source.official, true, `source officielle: ${source.id}`)
  assert.match(source.checkedAt ?? '', /^\d{4}-\d{2}-\d{2}$/, `date de vérification: ${source.id}`)
}

const flora = await readJson(path.join(directory, manifest.files.taxa.flora.file))
const fauna = await readJson(path.join(directory, manifest.files.taxa.fauna.file))
assert.ok(flora.length > 20_000, 'volume flore plausible')
assert.ok(fauna.length > 50_000, 'volume faune plausible')

const lotus = flora.find((taxon) => taxon.cdRef === 106634)
assert.equal(lotus?.scientificName, 'Lotus angustissimus', 'Lotus angustissimus présent dans TAXREF local')
assert.ok(lotus?.vernacularNames.some((name) => /lotier/i.test(name)), 'nom vernaculaire du Lotus disponible')

const aconitum = flora.find((taxon) => taxon.cdRef === 80037)
assert.ok(aconitum, 'Aconitum napellus s.l. présent dans TAXREF local')

const alcedo = fauna.find((taxon) => taxon.cdRef === 3571)
assert.equal(alcedo?.scientificName, 'Alcedo atthis', 'Martin-pêcheur présent dans TAXREF local')

const cvlFlora = await readJson(path.join(directory, manifest.files.statuses.flora.CVL.file))
const naqFlora = await readJson(path.join(directory, manifest.files.statuses.flora.NAQ.file))
const cvlFauna = await readJson(path.join(directory, manifest.files.statuses.fauna.CVL.file))

const lotusCvlLrr = findStatus(
  cvlFlora,
  106634,
  (status) => status.category === 'red_list_regional' && /^LC\b/.test(status.value),
)
assert.ok(lotusCvlLrr, 'Lotus angustissimus: LRR Centre-Val de Loire = LC')

const lotusNaqProtection = findStatus(
  naqFlora,
  106634,
  (status) =>
    status.category === 'protection_regional' &&
    status.scope === 'partial' &&
    /Aquitaine/i.test(status.scopeLabel ?? ''),
)
assert.ok(lotusNaqProtection, 'Lotus angustissimus: protection Aquitaine conservée comme portée partielle en NAQ')
assert.ok(lotusNaqProtection.citation, 'Lotus angustissimus: citation réglementaire disponible')

const aconitumCvlProtection = findStatus(
  cvlFlora,
  80037,
  (status) => status.category === 'protection_regional' && status.scope === 'regional',
)
assert.ok(aconitumCvlProtection, 'Aconitum napellus: protection régionale Centre disponible')

const alcedoNationalProtection = findStatus(
  cvlFauna,
  3571,
  (status) => status.category === 'protection_national' && status.scope === 'national',
)
assert.ok(alcedoNationalProtection, 'Alcedo atthis: protection nationale disponible en Centre-Val de Loire')

console.log('Validation métier des jeux officiels: OK')
console.log(`- flore: ${flora.length.toLocaleString('fr-FR')} taxons`)
console.log(`- faune: ${fauna.length.toLocaleString('fr-FR')} taxons`)
console.log('- cas sentinelles: Lotus angustissimus, Aconitum napellus, Alcedo atthis')
