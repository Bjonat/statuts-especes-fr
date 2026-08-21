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

const scopeByCode = ['national', 'regional', 'partial']

const args = parseArgs(process.argv.slice(2))
const directory = args.dir ?? 'public/data'
const manifest = await readJson(path.join(directory, 'manifest.json'))

assert.equal(manifest.schemaVersion, 3, 'manifest schemaVersion')
assert.equal(manifest.official, true, 'manifest officiel')
assert.equal(manifest.taxrefVersion, '18', 'version TAXREF')
assert.equal(manifest.bdcVersion, '18', 'version BDC')
assert.equal(manifest.regions.length, 13, '13 régions métropolitaines')
assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(manifest.generatedAt), 'date de génération valide')

for (const source of manifest.sources) {
  assert.equal(source.official, true, `source officielle: ${source.id}`)
  assert.match(source.checkedAt ?? '', /^\d{4}-\d{2}-\d{2}$/, `date de vérification: ${source.id}`)
  assert.equal('url' in source, false, `pas de lien documentaire embarqué: ${source.id}`)
}

const flora = await readJson(path.join(directory, manifest.files.taxa.flora.file))
const fauna = await readJson(path.join(directory, manifest.files.taxa.fauna.file))
const definitions = await readJson(path.join(directory, manifest.files.statusDefinitions.file))
assert.ok(flora.length > 20_000, 'volume flore plausible')
assert.ok(fauna.length > 50_000, 'volume faune plausible')
assert.ok(definitions.length > 100, 'dictionnaire de statuts plausible')
assert.ok(definitions.every((definition) => !('citation' in definition) && !('documentUrl' in definition)), 'aucune citation longue ni URL documentaire dans les définitions')
assert.ok(definitions.every((definition) => typeof definition.value === 'string' && definition.value.length <= 80), 'valeurs de statuts compactes pour le terrain')

async function loadLinks(realm, region) {
  return readJson(path.join(directory, manifest.files.statusLinks[realm][region].file))
}

async function loadStatuses(realm, region) {
  const links = await loadLinks(realm, region)
  return links.map(([cdRef, definitionId, scopeCode, scopeLabel]) => {
    const definition = definitions[definitionId]
    assert.ok(definition, `définition #${definitionId} disponible`)
    return {
      cdRef,
      region,
      ...definition,
      scope: scopeByCode[scopeCode],
      ...(scopeLabel ? { scopeLabel } : {}),
    }
  })
}

const regionalCoverage = []
for (const region of manifest.regions) {
  const [floraLinks, faunaLinks] = await Promise.all([
    loadLinks('flora', region.code),
    loadLinks('fauna', region.code),
  ])
  const nonNational = [...floraLinks, ...faunaLinks].filter((link) => link[2] !== 0).length
  assert.ok(nonNational > 0, `${region.name}: au moins un statut régional ou partiel`)
  regionalCoverage.push({ code: region.code, name: region.name, nonNational })
}

const lotus = flora.find((taxon) => taxon.cdRef === 106634)
assert.equal(lotus?.scientificName, 'Lotus angustissimus', 'Lotus angustissimus présent dans TAXREF local')
assert.ok(lotus?.vernacularNames.some((name) => /lotier/i.test(name)), 'nom vernaculaire du Lotus disponible')

const aconitum = flora.find((taxon) => taxon.cdRef === 80037)
assert.ok(aconitum, 'Aconitum napellus s.l. présent dans TAXREF local')

const alcedo = fauna.find((taxon) => taxon.cdRef === 3571)
assert.equal(alcedo?.scientificName, 'Alcedo atthis', 'Martin-pêcheur présent dans TAXREF local')

const cvlFlora = await loadStatuses('flora', 'CVL')
const naqFlora = await loadStatuses('flora', 'NAQ')
const cvlFauna = await loadStatuses('fauna', 'CVL')

const naqZnieffSourceId = 'obv-na-znieff-flore-2019-v1.2'
if (manifest.sources.some((source) => source.id === naqZnieffSourceId)) {
  const naqZnieff = naqFlora.filter((status) => status.category === 'znieff')
  const regionalNaqZnieff = naqZnieff.filter((status) => status.sourceId === naqZnieffSourceId)
  const coveredCdRefs = new Set(regionalNaqZnieff.map((status) => status.cdRef))
  const residualBdcOnCoveredTaxa = naqZnieff.filter(
    (status) => status.sourceId !== naqZnieffSourceId && coveredCdRefs.has(status.cdRef),
  )

  assert.ok(regionalNaqZnieff.length >= 1_200, 'ZNIEFF flore NAQ régional: volume plausible >= 1 200 statuts')
  assert.equal(
    residualBdcOnCoveredTaxa.length,
    0,
    'ZNIEFF flore NAQ: aucun statut BDC résiduel pour les CD_REF couverts par le référentiel régional',
  )
  assert.ok(
    regionalNaqZnieff.some((status) => status.scope === 'partial' && status.scopeLabel),
    'ZNIEFF flore NAQ: les restrictions biogéographiques/départementales sont conservées',
  )
}

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

console.log('Validation métier des jeux officiels métropolitains: OK')
console.log(`- flore: ${flora.length.toLocaleString('fr-FR')} taxons`)
console.log(`- faune: ${fauna.length.toLocaleString('fr-FR')} taxons`)
console.log(`- définitions de statut: ${definitions.length.toLocaleString('fr-FR')}`)
if (manifest.sources.some((source) => source.id === naqZnieffSourceId)) {
  console.log('- enrichissement régional: ZNIEFF flore Nouvelle-Aquitaine v1.2 (2019)')
}
console.log('- couverture régionale non nationale:')
for (const region of regionalCoverage) {
  console.log(`  ${region.code} ${region.name}: ${region.nonNational.toLocaleString('fr-FR')} relations`)
}
console.log('- cas sentinelles: Lotus angustissimus, Aconitum napellus, Alcedo atthis')