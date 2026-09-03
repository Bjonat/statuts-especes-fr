import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildMigratedSourceMatrix } from './migrated-source-matrix.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const REAL_REGISTRY = path.join(here, 'regions/ready-sources.json')
const WORKFLOW = path.join(here, '../.github/workflows/regional-adapters-matrix.yml')
const SMOKE_WORKFLOW = path.join(here, '../.github/workflows/bre-regional-smoke.yml')

function csvResource(overrides = {}) {
  return {
    kind: 'csv',
    url: 'https://example.test/source.csv',
    pipelineId: 'example-pipeline-2026',
    ...overrides,
  }
}

function source(overrides = {}) {
  return {
    id: 'example-source',
    region: 'BRE',
    state: 'IMPORTED',
    adapter: 'oeb-csv-example',
    resources: [csvResource()],
    ...overrides,
  }
}

function registry(sources) {
  return { schemaVersion: 1, sources }
}

test('A — IMPORTED + adapter est inclus', () => {
  const matrix = buildMigratedSourceMatrix(registry([source()]))
  assert.deepEqual(matrix, {
    include: [
      {
        sourceId: 'example-source',
        adapter: 'oeb-csv-example',
        region: 'BRE',
        pipelineId: 'example-pipeline-2026',
        inputKind: 'csv',
        inputUrl: 'https://example.test/source.csv',
      },
    ],
  })
})

test('B — WITNESS + adapter est exclu', () => {
  const matrix = buildMigratedSourceMatrix(
    registry([source({ id: 'witness-source', state: 'WITNESS' }), source({ id: 'imported-source' })]),
  )
  assert.deepEqual(
    matrix.include.map((entry) => entry.sourceId),
    ['imported-source'],
  )
})

test('C — IMPORTED sans adapter est exclu', () => {
  const matrix = buildMigratedSourceMatrix(
    registry([
      source({ id: 'historical-source', adapter: undefined }),
      source({ id: 'blank-adapter', adapter: '' }),
      source({ id: 'migrated-source' }),
    ]),
  )
  assert.deepEqual(
    matrix.include.map((entry) => entry.sourceId),
    ['migrated-source'],
  )
})

test('D — source migrée sans CSV est une erreur', () => {
  assert.throws(
    () =>
      buildMigratedSourceMatrix(
        registry([
          source({
            resources: [{ kind: 'pdf', url: 'https://example.test/doc.pdf', pipelineId: 'pdf-only' }],
          }),
        ]),
      ),
    /ressource CSV introuvable/,
  )
})

test('E — deux ressources CSV sont une erreur d’ambiguïté', () => {
  assert.throws(
    () =>
      buildMigratedSourceMatrix(
        registry([
          source({
            resources: [csvResource(), csvResource({ url: 'https://example.test/other.csv' })],
          }),
        ]),
      ),
    /plusieurs ressources CSV/,
  )
})

test('F — URL absente est une erreur', () => {
  assert.throws(
    () => buildMigratedSourceMatrix(registry([source({ resources: [csvResource({ url: '' })] })])),
    /url CSV absente/,
  )
  assert.throws(
    () => buildMigratedSourceMatrix(registry([source({ resources: [csvResource({ url: undefined })] })])),
    /url CSV absente/,
  )
})

test('G — pipelineId absent est une erreur', () => {
  assert.throws(
    () => buildMigratedSourceMatrix(registry([source({ resources: [csvResource({ pipelineId: '' })] })])),
    /pipelineId manquant/,
  )
  assert.throws(
    () =>
      buildMigratedSourceMatrix(registry([source({ resources: [csvResource({ pipelineId: undefined })] })])),
    /pipelineId manquant/,
  )
})

test('H — l’ordre de la matrice est déterministe par sourceId', () => {
  const matrix = buildMigratedSourceMatrix(
    registry([
      source({ id: 'zeta-source' }),
      source({ id: 'alpha-source' }),
      source({ id: 'mu-source' }),
    ]),
  )
  assert.deepEqual(
    matrix.include.map((entry) => entry.sourceId),
    ['alpha-source', 'mu-source', 'zeta-source'],
  )
})

test('I — aucune source migrée est une erreur', () => {
  assert.throws(() => buildMigratedSourceMatrix(registry([])), /Aucune source migrée dans le registre/)
  assert.throws(
    () =>
      buildMigratedSourceMatrix(
        registry([
          source({ state: 'WITNESS' }),
          source({ id: 'historical', adapter: undefined }),
        ]),
      ),
    /Aucune source migrée dans le registre/,
  )
})

test('le registre réel ne découvre que les deux sources migrées, triées', async () => {
  const registryJson = JSON.parse(await readFile(REAL_REGISTRY, 'utf8'))
  const matrix = buildMigratedSourceMatrix(registryJson)
  assert.deepEqual(
    matrix.include.map((entry) => entry.sourceId),
    ['oeb-bretagne-lrr', 'oeb-bretagne-znieff'],
  )
  assert.equal(matrix.include.length, 2)
})

test('le CLI écrit un JSON compact compatible fromJSON', () => {
  const result = spawnSync('node', [path.join(here, 'migrated-source-matrix.mjs')], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.includes('\n'), false)
  const matrix = JSON.parse(result.stdout)
  assert.deepEqual(
    matrix.include.map((entry) => entry.sourceId),
    ['oeb-bretagne-lrr', 'oeb-bretagne-znieff'],
  )
})

test('le workflow matrice n’hardcode ni sources, ni UUID, ni fail-fast true', async () => {
  const yaml = await readFile(WORKFLOW, 'utf8')
  const smokeYaml = await readFile(SMOKE_WORKFLOW, 'utf8')
  for (const forbidden of ['oeb-bretagne-znieff', 'oeb-bretagne-lrr', '4ada0b2b', '937614a8']) {
    assert.equal(yaml.includes(forbidden), false, `workflow contient ${forbidden}`)
  }
  assert.equal(yaml.includes('fail-fast: false'), true)
  assert.equal(yaml.includes('fromJSON(needs.discover.outputs.matrix)'), true)
  assert.equal(yaml.includes('data-pipeline/pipeline.mjs'), true)
  assert.equal(smokeYaml.includes('data-pipeline/pipeline.mjs'), true)
  assert.equal(/python/i.test(yaml), false)
  assert.match(yaml, /node-version:\s*24/)
})
