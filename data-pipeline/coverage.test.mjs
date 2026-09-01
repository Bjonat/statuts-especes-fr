import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CoverageRegistryError,
  buildCoverage,
  regionCodes,
  renderCoverageMarkdown,
  serializeCoverageJson,
  validateReadySourcesRegistry,
} from './coverage.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

function sourceFixture(overrides = {}) {
  return {
    id: 'dreal-ara-znieff',
    region: 'ARA',
    categories: ['znieff'],
    realms: ['flora', 'fauna'],
    state: 'IMPORTED',
    resources: [{ kind: 'ods', version: '2023-06' }],
    ...overrides,
  }
}

function registryFixture(sources) {
  return { schemaVersion: 1, checkedAt: '2026-08-26', sources }
}

test('une source sans id échoue explicitement', () => {
  assert.throws(
    () => validateReadySourcesRegistry(registryFixture([{ ...sourceFixture(), id: '' }])),
    (error) => error instanceof CoverageRegistryError && /id manquant/.test(error.message),
  )
})

test('une région inconnue échoue explicitement', () => {
  assert.throws(
    () => validateReadySourcesRegistry(registryFixture([sourceFixture({ region: 'XYZ' })])),
    (error) => error instanceof CoverageRegistryError && /région inconnue/.test(error.message),
  )
})

test('des catégories absentes échouent explicitement', () => {
  assert.throws(
    () => validateReadySourcesRegistry(registryFixture([sourceFixture({ categories: [] })])),
    (error) => error instanceof CoverageRegistryError && /categories manquant/.test(error.message),
  )
})

test('un règne absent échoue explicitement', () => {
  assert.throws(
    () => validateReadySourcesRegistry(registryFixture([sourceFixture({ realms: [] })])),
    (error) => error instanceof CoverageRegistryError && /realms manquant/.test(error.message),
  )
})

test('faune × flore × 2 catégories produit les combinaisons déclarées', () => {
  const coverage = buildCoverage(
    registryFixture([
      sourceFixture({
        id: 'demo-multi',
        categories: ['znieff', 'red_list_regional'],
        realms: ['flora', 'fauna'],
        resources: [{ version: '2024' }],
      }),
    ]),
  )
  const regional = coverage.entries.filter((entry) => entry.sourceId === 'demo-multi')
  assert.equal(regional.length, 4)
  assert.deepEqual(
    regional.map((entry) => `${entry.realm}/${entry.category}`).sort(),
    ['fauna/red_list_regional', 'fauna/znieff', 'flora/red_list_regional', 'flora/znieff'],
  )
  assert.ok(regional.every((entry) => entry.group === null))
  assert.ok(regional.every((entry) => entry.declaration === 'declared'))
})

test('plusieurs groups sont exposés sans en inventer', () => {
  const coverage = buildCoverage(
    registryFixture([
      sourceFixture({
        id: 'dreal-ara-lrr-vertebres-2024',
        categories: ['red_list_regional'],
        realms: ['fauna'],
        resources: [
          { version: '2024', groups: ['amphibiens', 'reptiles'] },
          { version: '2024', groups: ['oiseaux-nicheurs'] },
        ],
      }),
    ]),
  )
  const groups = coverage.entries
    .filter((entry) => entry.sourceId === 'dreal-ara-lrr-vertebres-2024')
    .map((entry) => entry.group)
    .sort()
  assert.deepEqual(groups, ['amphibiens', 'oiseaux-nicheurs', 'reptiles'])
  assert.equal(coverage.entries.some((entry) => entry.group === 'mammiferes'), false)
})

test('l’absence de groups reste indéterminée', () => {
  const coverage = buildCoverage(registryFixture([sourceFixture()]))
  const regional = coverage.entries.filter((entry) => entry.sourceId === 'dreal-ara-znieff')
  assert.ok(regional.length >= 1)
  assert.ok(regional.every((entry) => entry.group === null))
})

test('WITNESS reste identifiable et distinct d’IMPORTED', () => {
  const coverage = buildCoverage(
    registryFixture([
      sourceFixture({
        id: 'dreal-bfc-statuts-2026-03-03',
        region: 'BFC',
        state: 'IMPORTED',
      }),
      sourceFixture({
        id: 'arb-bfc-statuts-2023-12-19',
        region: 'BFC',
        state: 'WITNESS',
        publicationPolicy: 'schema-witness-smoke-only',
      }),
    ]),
  )
  const imported = coverage.entries.find((entry) => entry.sourceId === 'dreal-bfc-statuts-2026-03-03')
  const witness = coverage.entries.find((entry) => entry.sourceId === 'arb-bfc-statuts-2023-12-19')
  assert.equal(imported.sourceState, 'IMPORTED')
  assert.equal(witness.sourceState, 'WITNESS')
  assert.equal(witness.publicationPolicy, 'schema-witness-smoke-only')
  assert.match(renderCoverageMarkdown(coverage), /WITNESS \(non publiable\)/)
})

test('deux générations identiques sont déterministes', () => {
  const registry = registryFixture([
    sourceFixture(),
    sourceFixture({
      id: 'oeb-bretagne-znieff',
      region: 'BRE',
      resources: [{ kind: 'csv' }],
    }),
  ])
  const first = buildCoverage(registry)
  const second = buildCoverage(registry)
  assert.equal(serializeCoverageJson(first), serializeCoverageJson(second))
  assert.equal(renderCoverageMarkdown(first), renderCoverageMarkdown(second))
  assert.equal('generatedAt' in first, false)
})

test('le socle national et les 13 régions sont représentés', () => {
  const coverage = buildCoverage(registryFixture([]))
  assert.deepEqual(coverage.regions.map((region) => region.code), regionCodes())
  for (const code of regionCodes()) {
    const national = coverage.entries.filter((entry) => entry.region === code && entry.layer === 'national')
    assert.equal(national.filter((entry) => entry.sourceId === 'taxref-v18').length, 2)
    assert.equal(national.filter((entry) => entry.sourceId === 'bdc-v18').length, 2)
  }
  assert.equal(coverage.entries.some((entry) => entry.layer === 'regional'), false)
})

test('une preuve manifeste exacte est présente ; une absence d’id n’est pas un « false »', () => {
  const coverage = buildCoverage(registryFixture([sourceFixture({ id: 'dreal-ara-znieff' })]), {
    schemaVersion: 3,
    datasetVersion: 'abc',
    generatedAt: '2026-08-31T20:09:51.445Z',
    taxrefVersion: '18',
    bdcVersion: '18',
    sources: [{ id: 'dreal-bfc-statuts-2026-03-03' }, { id: 'taxref-v18' }, { id: 'bdc-v18' }],
  })
  const ara = coverage.entries.find((entry) => entry.sourceId === 'dreal-ara-znieff')
  const taxref = coverage.entries.find((entry) => entry.sourceId === 'taxref-v18')
  assert.equal(ara.datasetEvidence, 'unknown')
  assert.deepEqual(ara.matchedDatasetSourceIds, [])
  assert.equal(taxref.datasetEvidence, 'present')
  assert.notEqual(ara.datasetEvidence, 'absent')
  assert.notEqual(ara.datasetEvidence, false)
})

test('pipelineId de ressource ne prouve que les tuples de cette ressource', () => {
  const coverage = buildCoverage(
    registryFixture([
      sourceFixture({
        id: 'dreal-pdl-znieff-2018',
        region: 'PDL',
        resources: [
          { realm: 'fauna', pipelineId: 'dreal-pdl-znieff-faune-2018' },
          { realm: 'flora', pipelineId: 'dreal-pdl-znieff-flore-2018' },
        ],
      }),
    ]),
    {
      schemaVersion: 3,
      sources: [{ id: 'dreal-pdl-znieff-faune-2018' }],
    },
  )
  const fauna = coverage.entries.find((entry) => entry.sourceId === 'dreal-pdl-znieff-2018' && entry.realm === 'fauna')
  const flora = coverage.entries.find((entry) => entry.sourceId === 'dreal-pdl-znieff-2018' && entry.realm === 'flora')
  assert.equal(fauna.datasetEvidence, 'present')
  assert.deepEqual(fauna.matchedDatasetSourceIds, ['dreal-pdl-znieff-faune-2018'])
  assert.equal(flora.datasetEvidence, 'unknown')
  assert.deepEqual(flora.matchedDatasetSourceIds, [])
})

test('pipelineId par groupe ne prouve pas les autres groupes', () => {
  const coverage = buildCoverage(
    registryFixture([
      sourceFixture({
        id: 'irpn-hdf-lrr-unifiees',
        region: 'HDF',
        categories: ['red_list_regional'],
        realms: ['fauna'],
        resources: [
          { group: 'papillons-jour', pipelineId: 'irpn-hdf-lrr-papillons-jour-2024' },
          { group: 'odonates', pipelineId: 'irpn-hdf-lrr-odonates-2023' },
        ],
      }),
    ]),
    {
      schemaVersion: 3,
      sources: [{ id: 'irpn-hdf-lrr-papillons-jour-2024' }],
    },
  )
  const papillons = coverage.entries.find((entry) => entry.group === 'papillons-jour')
  const odonates = coverage.entries.find((entry) => entry.group === 'odonates')
  assert.equal(papillons.datasetEvidence, 'present')
  assert.equal(odonates.datasetEvidence, 'unknown')
  assert.deepEqual(odonates.matchedDatasetSourceIds, [])
})

test('source.id dans le manifeste prouve tous les tuples de la source', () => {
  const coverage = buildCoverage(
    registryFixture([
      sourceFixture({
        id: 'dreal-pdl-znieff-2018',
        region: 'PDL',
        resources: [
          { realm: 'fauna', pipelineId: 'dreal-pdl-znieff-faune-2018' },
          { realm: 'flora', pipelineId: 'dreal-pdl-znieff-flore-2018' },
        ],
      }),
    ]),
    {
      schemaVersion: 3,
      sources: [{ id: 'dreal-pdl-znieff-2018' }],
    },
  )
  const regional = coverage.entries.filter((entry) => entry.sourceId === 'dreal-pdl-znieff-2018')
  assert.equal(regional.length, 2)
  assert.ok(regional.every((entry) => entry.datasetEvidence === 'present'))
  assert.ok(regional.every((entry) => entry.matchedDatasetSourceIds.includes('dreal-pdl-znieff-2018')))
})

test('sentinelles du registre réel ARA / BRE / BFC / COR / HDF', async () => {
  const registry = JSON.parse(await fs.readFile(path.join(here, 'regions/ready-sources.json'), 'utf8'))
  const coverage = buildCoverage(registry)
  const ids = new Set(coverage.entries.map((entry) => entry.sourceId))

  assert.ok(ids.has('dreal-ara-znieff'))
  assert.ok(ids.has('oeb-bretagne-znieff'))
  assert.ok(ids.has('dreal-bfc-statuts-2026-03-03'))
  assert.ok(ids.has('arb-bfc-statuts-2023-12-19'))
  assert.ok(ids.has('taxref-v18'))
  assert.ok(ids.has('bdc-v18'))

  assert.ok(coverage.entries.some((entry) => entry.sourceId === 'dreal-ara-znieff' && entry.region === 'ARA'))
  assert.ok(coverage.entries.some((entry) => entry.sourceId === 'oeb-bretagne-znieff' && entry.region === 'BRE'))
  assert.equal(
    coverage.entries.find((entry) => entry.sourceId === 'arb-bfc-statuts-2023-12-19').sourceState,
    'WITNESS',
  )
  assert.equal(
    coverage.entries.find((entry) => entry.sourceId === 'dreal-bfc-statuts-2026-03-03').sourceState,
    'IMPORTED',
  )
  assert.equal(
    coverage.entries.some((entry) => entry.region === 'COR' && entry.layer === 'regional'),
    false,
  )
  assert.ok(coverage.entries.some((entry) => entry.region === 'COR' && entry.sourceId === 'bdc-v18'))
  assert.ok(
    coverage.entries.some(
      (entry) => entry.region === 'HDF' && entry.sourceId === 'cbnhdf-digitale-znieff-hdf' && entry.realm === 'flora',
    ),
  )
  assert.equal(
    coverage.entries.some(
      (entry) => entry.region === 'HDF' && entry.sourceId === 'cbnhdf-digitale-znieff-hdf' && entry.realm === 'fauna',
    ),
    false,
  )
})

test('les fichiers générés commis correspondent au registre', async () => {
  const registry = JSON.parse(await fs.readFile(path.join(here, 'regions/ready-sources.json'), 'utf8'))
  const coverage = buildCoverage(registry)
  const jsonPath = path.join(here, 'generated/coverage.json')
  const mdPath = path.resolve(here, '../docs/generated/source-coverage.md')
  const committedJson = await fs.readFile(jsonPath, 'utf8')
  const committedMd = await fs.readFile(mdPath, 'utf8')
  assert.equal(committedJson, serializeCoverageJson(coverage))
  assert.equal(committedMd, renderCoverageMarkdown(coverage))
})
