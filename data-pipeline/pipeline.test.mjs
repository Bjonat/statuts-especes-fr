import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { resolveScope, REGIONS } from './regions.mjs'
import {
  buildStatuses,
  buildTaxa,
  filterTaxaForMetropolitanRegions,
  isMetropolitanBiogeographicStatus,
  isSearchableRank,
  parseDelimitedLine,
  statusCategory,
} from './pipeline.mjs'

test('le parseur conserve les séparateurs présents dans les champs CSV quotés', () => {
  assert.deepEqual(parseDelimitedLine('a;"b;c";"d""e"', ';'), ['a', 'b;c', 'd"e'])
})

test('les 13 régions métropolitaines et les 96 départements sont couverts', () => {
  assert.equal(REGIONS.length, 13)
  assert.deepEqual(
    REGIONS.map((region) => region.inseeCode).sort(),
    ['11', '24', '27', '28', '32', '44', '52', '53', '75', '76', '84', '93', '94'],
  )

  const departments = REGIONS.flatMap((region) => region.departments)
  assert.equal(departments.length, 96)
  assert.equal(new Set(departments).size, 96)
})

test('ancienne Aquitaine est une portée partielle en Nouvelle-Aquitaine', () => {
  const naq = REGIONS.find((region) => region.code === 'NAQ')
  assert.ok(naq)
  assert.deepEqual(resolveScope('INSEER72', naq), {
    scope: 'partial',
    scopeLabel: 'ancienne région Aquitaine',
  })
})

test('les régions historiques inchangées restent des portées régionales complètes', () => {
  for (const [regionCode, legacySig] of [
    ['CVL', 'INSEER24'],
    ['BRE', 'INSEER53'],
    ['IDF', 'INSEER11'],
    ['PDL', 'INSEER52'],
    ['PAC', 'INSEER93'],
    ['COR', 'INSEER94'],
  ]) {
    const region = REGIONS.find((item) => item.code === regionCode)
    assert.ok(region)
    assert.deepEqual(resolveScope(legacySig, region), {
      scope: 'regional',
      scopeLabel: region.name,
    })
  }
})

test('les anciennes composantes des régions fusionnées restent partielles', () => {
  const cases = [
    ['ARA', 'INSEER83', 'ancienne région Auvergne'],
    ['BFC', 'INSEER43', 'ancienne région Franche-Comté'],
    ['GES', 'INSEER42', 'ancienne région Alsace'],
    ['HDF', 'INSEER22', 'ancienne région Picardie'],
    ['NOR', 'INSEER25', 'ancienne région Basse-Normandie'],
    ['OCC', 'INSEER91', 'ancienne région Languedoc-Roussillon'],
  ]

  for (const [regionCode, sig, label] of cases) {
    const region = REGIONS.find((item) => item.code === regionCode)
    assert.ok(region)
    assert.deepEqual(resolveScope(sig, region), { scope: 'partial', scopeLabel: label })
  }
})

test('PNA reste distinct d’une protection nationale', () => {
  assert.equal(statusCategory('PNA'), 'pna')
  assert.equal(statusCategory('PN'), 'protection_national')
})

test('les rangs supraspécifiques ne sont pas proposés à la recherche', () => {
  assert.equal(isSearchableRank('ES'), true)
  assert.equal(isSearchableRank('SSES'), true)
  assert.equal(isSearchableRank('VAR'), true)
  assert.equal(isSearchableRank('GN'), false)
  assert.equal(isSearchableRank('FM'), false)
})

test('le statut biogéographique métropolitain exclut absence et mention erronée', () => {
  assert.equal(isMetropolitanBiogeographicStatus('P'), true)
  assert.equal(isMetropolitanBiogeographicStatus('I'), true)
  assert.equal(isMetropolitanBiogeographicStatus('A'), false)
  assert.equal(isMetropolitanBiogeographicStatus('Q'), false)
  assert.equal(isMetropolitanBiogeographicStatus(''), false)
})

test('le pipeline rattache les synonymes TAXREF, filtre faune/flore et exclut les genres', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'statuts-especes-'))
  const taxref = path.join(directory, 'taxref.txt')
  await fs.writeFile(
    taxref,
    [
      'REGNE\tFAMILLE\tRANG\tFR\tCD_NOM\tCD_REF\tLB_NOM\tNOM_VERN',
      'Plantae\tFagaceae\tES\tP\t100\t100\tQuercus robur\tChêne pédonculé',
      'Plantae\tFagaceae\tES\tP\t101\t100\tQuercus pedunculata\t',
      'Plantae\tFagaceae\tGN\tP\t102\t102\tQuercus\tChênes',
      'Animalia\tAlcedinidae\tES\tP\t200\t200\tAlcedo atthis\tMartin-pêcheur d’Europe',
      'Fungi\tAmanitaceae\tES\tP\t300\t300\tAmanita muscaria\tAmanite tue-mouches',
    ].join('\n'),
  )

  const taxa = await buildTaxa(taxref)
  assert.equal(taxa.length, 2)
  assert.deepEqual(taxa.find((taxon) => taxon.cdRef === 100)?.synonyms, ['Quercus pedunculata'])
  assert.equal(taxa.find((taxon) => taxon.cdRef === 200)?.realm, 'fauna')
  assert.equal(taxa.some((taxon) => taxon.cdRef === 102), false)
})

test('le filtre métropolitain conserve par sécurité un taxon absent ayant un statut applicable', () => {
  const taxa = [
    { cdRef: 100, biogeographicStatus: 'P' },
    { cdRef: 200, biogeographicStatus: 'A' },
    { cdRef: 300, biogeographicStatus: 'A' },
  ]
  const statuses = [{ cdRef: 200 }]

  assert.deepEqual(
    filterTaxaForMetropolitanRegions(taxa, statuses).map((taxon) => taxon.cdRef),
    [100, 200],
  )
})

test('le pipeline projette un statut national sur les 13 régions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'statuts-especes-'))
  const bdc = path.join(directory, 'bdc.csv')
  await fs.writeFile(
    bdc,
    [
      'cd_ref;cd_type_statut;lb_type_statut;code_statut;label_statut;cd_sig;cd_doc;full_citation;doc_url',
      '100;LRR;Liste rouge régionale;LC;Préoccupation mineure;INSEER24;DOC1;Liste rouge Centre;https://example.test/lrr',
      '100;PR;Protection régionale;PR;Protégée;INSEER72;DOC2;Arrêté Aquitaine;https://example.test/pr',
      '100;LRN;Liste rouge nationale;LC;Préoccupation mineure;ETATFRA;DOC3;Liste rouge France;https://example.test/lrn',
    ].join('\n'),
  )

  const statuses = await buildStatuses(bdc, [{ cdRef: 100 }])
  const national = statuses.filter((status) => status.category === 'red_list_national')
  assert.equal(national.length, 13)
  assert.ok(national.every((status) => status.scope === 'national'))

  const cvlLrr = statuses.find((status) => status.region === 'CVL' && status.category === 'red_list_regional')
  const naqPr = statuses.find((status) => status.region === 'NAQ' && status.category === 'protection_regional')
  assert.equal(cvlLrr?.scope, 'regional')
  assert.equal(naqPr?.scope, 'partial')
  assert.equal(naqPr?.scopeLabel, 'ancienne région Aquitaine')
})
