import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { UNPUBLISHABLE_SOURCE_IDS } from './regional.mjs'

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
  assert.equal(
    UNPUBLISHABLE_SOURCE_IDS.has(source.id),
    false,
    `témoin de schéma non publiable embarqué: ${source.id}`,
  )
}

const flora = await readJson(path.join(directory, manifest.files.taxa.flora.file))
const fauna = await readJson(path.join(directory, manifest.files.taxa.fauna.file))
const definitions = await readJson(path.join(directory, manifest.files.statusDefinitions.file))
assert.ok(flora.length > 20_000, 'volume flore plausible')
assert.ok(fauna.length > 50_000, 'volume faune plausible')
assert.ok(definitions.length > 100, 'dictionnaire de statuts plausible')
assert.ok(definitions.every((definition) => !('citation' in definition) && !('documentUrl' in definition)), 'aucune citation longue ni URL documentaire dans les définitions')
const longValues = definitions.filter((definition) => typeof definition.value !== 'string' || definition.value.length > 80)
assert.equal(
  longValues.length,
  0,
  `valeurs de statuts compactes pour le terrain: ${JSON.stringify(longValues.slice(0, 5), null, 2)}`,
)

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
const gesFauna = await loadStatuses('fauna', 'GES')
const gesFlora = await loadStatuses('flora', 'GES')
const bfcFauna = await loadStatuses('fauna', 'BFC')

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

const gesZnieffSourceId = 'dreal-ges-odonat-znieff-fauna-2026-v2.2'
if (manifest.sources.some((source) => source.id === gesZnieffSourceId)) {
  const gesZnieff = gesFauna.filter((status) => status.category === 'znieff' && status.sourceId === gesZnieffSourceId)
  const rhino = gesZnieff.filter((status) => status.cdRef === 60313)
  assert.ok(
    rhino.some((status) => status.label === 'Déterminante ZNIEFF' && status.scope === 'regional' && status.value === 'Oui'),
    'Rhinolophus hipposideros: déterminante ZNIEFF Grand Est',
  )
  assert.ok(
    rhino.some((status) => status.label === 'Priorité ZNIEFF' && status.scope === 'partial' && status.scopeLabel === 'Massif vosgien'),
    'Rhinolophus hipposideros: priorité Vosges conservée comme portée partielle',
  )
}

const gesFloraZnieffSourceId = 'dreal-ges-znieff-flora-2024-08-v1.0'
if (manifest.sources.some((source) => source.id === gesFloraZnieffSourceId)) {
  const gesFloraZnieff = gesFlora.filter((status) => status.category === 'znieff' && status.sourceId === gesFloraZnieffSourceId)
  const achillea = gesFloraZnieff.filter((status) => status.cdRef === 79914)
  assert.ok(
    achillea.some((status) => status.label === 'Déterminante ZNIEFF' && status.scope === 'regional' && status.value === 'Oui'),
    'Achillea nobilis: déterminante ZNIEFF Grand Est flore',
  )
  assert.ok(
    achillea.some((status) => status.label === 'Priorité ZNIEFF' && status.scope === 'partial' && status.scopeLabel === 'Massif vosgien'),
    'Achillea nobilis: priorité Vosges conservée comme portée partielle',
  )
}

const gesLrrChecks = [
  { id: 'dreal-ges-odonat-lrr-amphibiens-2023', cdRef: 197, value: 'NT', message: 'Alytes obstetricans: LRR Grand Est amphibiens = NT' },
  { id: 'dreal-ges-odonat-lrr-reptiles-2023', cdRef: 78141, value: 'CR', message: 'Vipera berus: LRR Grand Est reptiles = CR' },
  { id: 'dreal-ges-odonat-lrr-mollusques-2023-v1.1', cdRef: 64435, value: 'CR', message: 'Margaritifera margaritifera: LRR Grand Est mollusques = CR' },
  { id: 'dreal-ges-odonat-lrr-odonates-2023', cdRef: 65202, value: 'EN', message: 'Lestes virens: LRR Grand Est odonates = EN' },
  { id: 'dreal-ges-odonat-lrr-orthopteres-2024', cdRef: 65641, value: 'CR', message: 'Polysarcus denticauda: LRR Grand Est orthoptères = CR' },
  { id: 'dreal-ges-odonat-lrr-oiseaux-nicheurs-2024', cdRef: 3984, value: 'CR*', message: 'Prunella collaris: LRR Grand Est oiseaux nicheurs = CR*' },
  { id: 'dreal-ges-odonat-lrr-papillons-jour-2025', cdRef: 1042429, value: 'RE', message: 'Parnassius mnemosyne: LRR Grand Est papillons = RE' },
  { id: 'dreal-ges-odonat-lrr-poissons-2024', cdRef: 66315, value: 'CR', message: 'Petromyzon marinus: LRR Grand Est poissons = CR' },
  { id: 'dreal-ges-odonat-lrr-branchiopodes-2025', cdRef: 348263, value: 'EN', message: 'Lynceus brachyurus: LRR Grand Est branchiopodes = EN' },
  { id: 'dreal-ges-odonat-lrr-decapodes-2025', cdRef: 18432, value: 'CR*', message: 'Astacus astacus: LRR Grand Est décapodes = CR*' },
]
for (const check of gesLrrChecks) {
  if (!manifest.sources.some((source) => source.id === check.id)) continue
  assert.ok(
    findStatus(
      gesFauna,
      check.cdRef,
      (status) =>
        status.category === 'red_list_regional' &&
        status.sourceId === check.id &&
        status.scope === 'regional' &&
        status.value === check.value,
    ),
    check.message,
  )
}

const bfcSourceId = 'dreal-bfc-statuts-2026-03-03'
if (manifest.sources.some((source) => source.id === bfcSourceId)) {
  const triturus = bfcFauna.filter((status) => status.cdRef === 139 && status.sourceId === bfcSourceId)
  assert.ok(
    triturus.some((status) => status.category === 'znieff' && status.scope === 'regional' && status.value === 'Oui'),
    'Triturus cristatus: déterminante ZNIEFF Bourgogne-Franche-Comté',
  )
  assert.ok(
    triturus.some((status) => status.category === 'red_list_regional' && status.scope === 'partial' && status.scopeLabel === 'ancienne région Bourgogne' && status.value === 'VU'),
    'Triturus cristatus: LRR Bourgogne partielle',
  )
  assert.ok(
    triturus.some((status) => status.category === 'red_list_regional' && status.scope === 'partial' && status.scopeLabel === 'ancienne région Franche-Comté' && status.value === 'VU'),
    'Triturus cristatus: LRR Franche-Comté partielle',
  )
}

const breFauna = await loadStatuses('fauna', 'BRE')
const breFlora = await loadStatuses('flora', 'BRE')
const breResponsabiliteSourceId = 'oeb-bretagne-responsabilite-csv-2026-07-29'
if (manifest.sources.some((source) => source.id === breResponsabiliteSourceId)) {
  assert.ok(
    findStatus(
      breFlora,
      97152,
      (status) =>
        status.category === 'regional_responsibility' &&
        status.sourceId === breResponsabiliteSourceId &&
        status.scope === 'regional' &&
        status.value === 'majeure',
    ),
    'Eryngium viviparum: responsabilité biologique Bretagne = majeure',
  )
  const alca = breFauna.filter(
    (status) => status.cdRef === 3388 && status.category === 'regional_responsibility' && status.sourceId === breResponsabiliteSourceId,
  )
  assert.ok(
    alca.some((status) => status.scope === 'partial' && status.scopeLabel === 'Oiseaux nicheurs' && status.value === 'majeure'),
    'Alca torda: responsabilité biologique Bretagne nicheurs = majeure',
  )
  assert.ok(
    alca.some((status) => status.scope === 'partial' && status.scopeLabel === 'Oiseaux migrateurs' && status.value === 'modérée'),
    'Alca torda: responsabilité biologique Bretagne migrateurs = modérée',
  )
}

const naqFauna = await loadStatuses('fauna', 'NAQ')
const naqGroupChecks = [
  {
    id: 'dreal-naq-znieff-characees-2023',
    realmStatuses: naqFlora,
    cdRef: 73555,
    message: 'Chara fragifera: déterminante ZNIEFF NAQ characées',
  },
  {
    id: 'dreal-naq-znieff-oiseaux-nicheurs-2023',
    realmStatuses: naqFauna,
    cdRef: 3571,
    message: 'Alcedo atthis: déterminante ZNIEFF NAQ oiseaux nicheurs',
  },
  {
    id: 'dreal-naq-znieff-araignees-2023',
    realmStatuses: naqFauna,
    cdRef: 719819,
    message: 'Eratigena inermis: déterminante ZNIEFF NAQ araignées (portée partielle)',
    requirePartial: true,
  },
  {
    id: 'dreal-naq-znieff-amphibiens-2024-09',
    realmStatuses: naqFauna,
    cdRef: 444427,
    message: 'Calotriton asper: déterminante ZNIEFF NAQ amphibiens (64)',
    requirePartial: true,
  },
  {
    id: 'dreal-naq-znieff-reptiles-2024-09',
    realmStatuses: naqFauna,
    cdRef: 701823,
    message: 'Vipera seoanei: déterminante ZNIEFF NAQ reptiles (64)',
    requirePartial: true,
  },
  {
    id: 'dreal-naq-znieff-mollusques-2025',
    realmStatuses: naqFauna,
    cdRef: 162701,
    message: 'Platyla cryptomena: déterminante ZNIEFF NAQ mollusques',
  },
  {
    id: 'dreal-naq-znieff-orthopteres-2026',
    realmStatuses: naqFauna,
    cdRef: 65899,
    message: 'Gryllotalpa gryllotalpa: déterminante ZNIEFF NAQ orthoptères (79/86)',
    requirePartial: true,
  },
  {
    id: 'dreal-naq-znieff-oiseaux-marins-2026',
    realmStatuses: naqFauna,
    cdRef: 3388,
    message: 'Alca torda: déterminante ZNIEFF NAQ oiseaux marins',
  },
]
for (const check of naqGroupChecks) {
  if (!manifest.sources.some((source) => source.id === check.id)) continue
  const rows = check.realmStatuses.filter(
    (status) => status.category === 'znieff' && status.sourceId === check.id && status.cdRef === check.cdRef,
  )
  assert.ok(
    rows.some((status) => status.label === 'Déterminante ZNIEFF' && status.value === 'Oui'),
    check.message,
  )
  if (check.requirePartial) {
    assert.ok(
      rows.some((status) => status.scope === 'partial' && status.scopeLabel),
      `${check.message}: portée partielle conservée`,
    )
  }
}

const pacFauna = await loadStatuses('fauna', 'PAC')
const pacFlora = await loadStatuses('flora', 'PAC')
const pacChecks = [
  { id: 'dreal-pac-znieff-fauna-2024-01', statuses: pacFauna, cdRef: 139, value: 'Déterminante', message: 'Triturus cristatus: ZNIEFF PACA Déterminante' },
  { id: 'dreal-pac-znieff-fauna-2024-01', statuses: pacFauna, cdRef: 60313, value: 'Remarquable', message: 'Rhinolophus hipposideros: ZNIEFF PACA Remarquable' },
  { id: 'dreal-pac-znieff-flora-2016', statuses: pacFlora, cdRef: 610608, value: 'Déterminante', message: 'Acis nicaeensis: ZNIEFF PACA flore Déterminante' },
  { id: 'dreal-pac-lrr-oiseaux-2020', statuses: pacFauna, cdRef: 2657, value: 'CR', message: 'Aquila fasciata: LRR PACA oiseaux CR' },
  { id: 'dreal-pac-lrr-odonates-2017', statuses: pacFauna, cdRef: 65397, value: 'CR', message: 'Somatochlora arctica: LRR PACA odonates CR' },
  { id: 'dreal-pac-lrr-papillons-2024', statuses: pacFauna, cdRef: 53341, value: 'RE', message: 'Gegenes pumilio: LRR PACA papillons RE' },
  { id: 'dreal-pac-lrr-flore-2015', statuses: pacFlora, cdRef: 79903, value: 'RE', message: 'Achillea ligustica: LRR PACA flore RE' },
  { id: 'dreal-pac-lrr-amphibiens-2016', statuses: pacFauna, cdRef: 139, value: 'CR', message: 'Triturus cristatus: LRR PACA amphibiens CR' },
  { id: 'dreal-pac-lrr-reptiles-2016', statuses: pacFauna, cdRef: 78141, value: 'RE', message: 'Vipera berus: LRR PACA reptiles RE' },
  { id: 'dreal-pac-lrr-orthopteres-2018', statuses: pacFauna, cdRef: 66052, value: 'CR', message: 'Prionotropis rhodanica: LRR PACA orthoptères CR' },
]
for (const check of pacChecks) {
  if (!manifest.sources.some((source) => source.id === check.id)) continue
  assert.ok(
    check.statuses.some(
      (status) => status.sourceId === check.id && status.cdRef === check.cdRef && status.value === check.value,
    ),
    check.message,
  )
}

const pdlFauna = await loadStatuses('fauna', 'PDL')
const pdlFlora = await loadStatuses('flora', 'PDL')
if (manifest.sources.some((source) => source.id === 'dreal-pdl-znieff-faune-2018')) {
  assert.ok(
    pdlFauna.some((status) => status.sourceId === 'dreal-pdl-znieff-faune-2018' && status.cdRef === 139 && status.value === 'Oui'),
    'Triturus cristatus: déterminante ZNIEFF PDL',
  )
  assert.ok(
    pdlFauna.some(
      (status) =>
        status.sourceId === 'dreal-pdl-znieff-faune-2018' &&
        status.cdRef === 2651 &&
        status.label === 'Condition de déterminance' &&
        status.value === 'Nicheur',
    ),
    'Hieraaetus pennatus: condition Nicheur PDL',
  )
}
if (manifest.sources.some((source) => source.id === 'dreal-pdl-znieff-flore-2018')) {
  assert.ok(
    pdlFlora.some((status) => status.sourceId === 'dreal-pdl-znieff-flore-2018' && status.cdRef === 80978 && status.value === 'Oui'),
    'Ajuga chamaepitys: déterminante ZNIEFF PDL flore',
  )
  assert.ok(
    pdlFlora.some(
      (status) =>
        status.sourceId === 'dreal-pdl-znieff-flore-2018' &&
        status.cdRef === 80978 &&
        status.label === 'Condition de déterminance',
    ),
    'Ajuga chamaepitys: restriction géographique PDL conservée',
  )
}

const idfFauna = await loadStatuses('fauna', 'IDF')
const idfFlora = await loadStatuses('flora', 'IDF')
const idfLrrChecks = [
  {
    id: 'arb-idf-lrr-amphibiens-2023',
    realmStatuses: idfFauna,
    cdRef: 212,
    value: 'EN',
    message: 'Bombina variegata: LRR amphibiens Île-de-France EN',
  },
  {
    id: 'arb-idf-lrr-oiseaux-nicheurs-2018',
    realmStatuses: idfFauna,
    cdRef: 974,
    value: 'EN',
    message: 'Podiceps nigricollis: LRR oiseaux nicheurs Île-de-France EN',
  },
  {
    id: 'arb-idf-lrr-flore-vasculaire-2014',
    realmStatuses: idfFlora,
    cdRef: 80037,
    value: 'EN',
    message: 'Aconitum napellus: LRR flore vasculaire Île-de-France EN',
  },
]
for (const check of idfLrrChecks) {
  if (!manifest.sources.some((source) => source.id === check.id)) continue
  assert.ok(
    findStatus(
      check.realmStatuses,
      check.cdRef,
      (status) =>
        status.category === 'red_list_regional' &&
        status.sourceId === check.id &&
        status.value === check.value,
    ),
    check.message,
  )
}

console.log('Validation métier des jeux officiels métropolitains: OK')
console.log(`- flore: ${flora.length.toLocaleString('fr-FR')} taxons`)
console.log(`- faune: ${fauna.length.toLocaleString('fr-FR')} taxons`)
console.log(`- définitions de statut: ${definitions.length.toLocaleString('fr-FR')}`)
if (manifest.sources.some((source) => source.id === naqZnieffSourceId)) {
  console.log('- enrichissement régional: ZNIEFF flore Nouvelle-Aquitaine v1.2 (2019)')
}
if (manifest.sources.some((source) => source.id === 'dreal-naq-znieff-orthopteres-2026')) {
  console.log('- enrichissement régional: ZNIEFF NAQ groupes unifiés (characées → oiseaux marins)')
}
if (manifest.sources.some((source) => source.id === gesZnieffSourceId)) {
  console.log('- enrichissement régional: ZNIEFF faune Grand Est v2.2 (juin 2026)')
}
if (manifest.sources.some((source) => source.id === gesFloraZnieffSourceId)) {
  console.log('- enrichissement régional: ZNIEFF flore Grand Est v1.0 (août 2024)')
}
if (manifest.sources.some((source) => source.id === 'dreal-ges-odonat-lrr-oiseaux-nicheurs-2024')) {
  console.log('- enrichissement régional: LRR Grand Est unifiées (10 groupes faune)')
}
if (manifest.sources.some((source) => source.id === bfcSourceId)) {
  console.log('- enrichissement régional: tableur maître BFC 03/03/2026')
}
if (manifest.sources.some((source) => source.id === 'dreal-pac-znieff-fauna-2024-01')) {
  console.log('- enrichissement régional: ZNIEFF + LRR Provence-Alpes-Côte d’Azur')
}
if (manifest.sources.some((source) => source.id === 'dreal-pdl-znieff-faune-2018')) {
  console.log('- enrichissement régional: ZNIEFF Pays de la Loire 2018')
}
if (manifest.sources.some((source) => source.id === 'oeb-bretagne-responsabilite-csv-2026-07-29')) {
  console.log('- enrichissement régional: responsabilité biologique Bretagne OEB 2025')
}
if (manifest.sources.some((source) => source.id === 'arb-idf-lrr-amphibiens-2023')) {
  console.log('- enrichissement régional: LRR Île-de-France via GeoNat (8 groupes)')
}
console.log('- couverture régionale non nationale:')
for (const region of regionalCoverage) {
  console.log(`  ${region.code} ${region.name}: ${region.nonNational.toLocaleString('fr-FR')} relations`)
}
console.log('- cas sentinelles: Lotus angustissimus, Aconitum napellus, Alcedo atthis')
