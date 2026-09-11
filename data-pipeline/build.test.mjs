import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { computeDatasetVersion, writeDataset, writeSourceCoverageSnapshot } from './build.mjs'

test('writeDataset records bytes equal to the written JSON file size', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'statuts-build-bytes-'))
  try {
    const rows = [
      { cdRef: 1, name: 'Carex' },
      { cdRef: 2, name: 'Quercus' },
    ]
    const result = await writeDataset(directory, 'taxa-flora', rows)
    const filePath = path.join(directory, result.file)
    const stats = await fs.stat(filePath)
    assert.equal(result.count, 2)
    assert.equal(result.bytes, stats.size)
    assert.ok(Number.isInteger(result.bytes))
    assert.ok(result.bytes > 0)
    assert.match(result.file, /^taxa-flora-[a-f0-9]+\.json$/)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

function registryFixture(sources) {
  return { schemaVersion: 1, checkedAt: '2026-08-26', sources }
}

function sourceFixture(overrides = {}) {
  return {
    id: 'dreal-ara-znieff',
    region: 'ARA',
    categories: ['znieff'],
    realms: ['flora', 'fauna'],
    state: 'IMPORTED',
    resources: [{ version: '2023-06' }],
    ...overrides,
  }
}

async function assembleMiniDataset(directory, registry, sourceIds) {
  const files = {
    taxa: {
      flora: await writeDataset(directory, 'taxa-flora', [{ cdRef: 1 }]),
      fauna: await writeDataset(directory, 'taxa-fauna', [{ cdRef: 2 }]),
    },
    statusDefinitions: await writeDataset(directory, 'status-definitions', []),
    statusLinks: {
      flora: { ARA: await writeDataset(directory, 'status-links-flora-ara', []) },
      fauna: { ARA: await writeDataset(directory, 'status-links-fauna-ara', []) },
    },
  }
  const coverage = await writeSourceCoverageSnapshot(directory, registry, sourceIds)
  files.sourceCoverage = coverage.descriptor
  return {
    files,
    coverage,
    datasetVersion: computeDatasetVersion(files),
  }
}

test('le snapshot source-coverage est hashé et participe à datasetVersion', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'statuts-build-coverage-'))
  try {
    const registry = registryFixture([sourceFixture()])
    const sourceIds = ['taxref-v18', 'bdc-v18', 'dreal-ara-znieff']
    const first = await assembleMiniDataset(directory, registry, sourceIds)
    assert.match(first.files.sourceCoverage.file, /^source-coverage-[a-f0-9]{12}\.json$/)
    assert.equal(first.files.sourceCoverage.schemaVersion, 1)

    const withoutCoverage = { ...first.files }
    delete withoutCoverage.sourceCoverage
    assert.notEqual(first.datasetVersion, computeDatasetVersion(withoutCoverage))

    const richerRegistry = registryFixture([
      sourceFixture(),
      sourceFixture({
        id: 'oeb-bretagne-znieff',
        region: 'BRE',
        categories: ['znieff'],
      }),
    ])
    const second = await assembleMiniDataset(directory, richerRegistry, sourceIds)
    assert.notEqual(second.files.sourceCoverage.file, first.files.sourceCoverage.file)
    assert.notEqual(second.datasetVersion, first.datasetVersion)

    const replay = await assembleMiniDataset(directory, registry, sourceIds)
    assert.equal(replay.files.sourceCoverage.file, first.files.sourceCoverage.file)
    assert.equal(replay.datasetVersion, first.datasetVersion)
    assert.equal(JSON.stringify(replay.coverage.entries), JSON.stringify(first.coverage.entries))
    assert.equal(JSON.stringify(first.coverage.entries).includes('generatedAt'), false)
    assert.equal(JSON.stringify(first.coverage.entries).includes('datasetVersion'), false)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
