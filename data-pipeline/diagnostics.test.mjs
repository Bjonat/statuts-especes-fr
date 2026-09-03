import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSourceDiagnostic,
  evaluateSourceQuality,
  validateQualityConfig,
  validateSourceDiagnostic,
} from './diagnostics.mjs'

const SHA = 'a'.repeat(64)

function metricsFixture(overrides = {}) {
  return {
    rowsRead: 10,
    rowsResolved: 9,
    resolvedByCode: 8,
    resolvedByName: 1,
    unresolved: 1,
    ambiguous: 0,
    explicitlyIgnored: 0,
    duplicatesDropped: 0,
    realms: { flora: 4, fauna: 5 },
    years: ['2020'],
    groups: ['Plantes vasculaires'],
    unresolvedSample: [],
    matchRate: 0.9,
    ...overrides,
  }
}

function packageFixture(overrides = {}) {
  const statuses = overrides.statuses ?? [
    {
      cdRef: 97152,
      region: 'BRE',
      category: 'znieff',
      label: 'Déterminante ZNIEFF',
      value: 'Oui',
      sourceId: 'oeb-bretagne-znieff-csv-2026-01-29',
      scope: 'regional',
    },
  ]
  return {
    schemaVersion: 1,
    source: {
      id: 'oeb-bretagne-znieff-csv-2026-01-29',
      name: 'Espèces déterminantes ZNIEFF Bretagne',
      producer: 'OEB',
      version: 'fixture',
      publicationYear: 2026,
      official: true,
      checkedAt: '2026-09-03',
      sha256: SHA,
    },
    replaces: [],
    statuses,
    diagnostics: {
      rows: 10,
      matched: 9,
      matchRate: 0.9,
    },
    ...overrides,
    statuses,
  }
}

function sourceFixture(quality) {
  return {
    id: 'oeb-bretagne-znieff',
    adapter: 'oeb-csv-znieff',
    region: 'BRE',
    quality,
  }
}

function build(quality, metricOverrides = {}, packageOverrides = {}) {
  const { statuses: overrideStatuses, ...restMetrics } = metricOverrides
  const metrics = metricsFixture(restMetrics)
  const statuses =
    overrideStatuses ??
    Array.from({ length: metrics.rowsResolved - (metrics.duplicatesDropped ?? 0) }, (_, index) => ({
      cdRef: index === 0 ? 97152 : 100_000 + index,
      region: 'BRE',
      category: 'znieff',
      label: 'Déterminante ZNIEFF',
      value: 'Oui',
      sourceId: 'oeb-bretagne-znieff-csv-2026-01-29',
      scope: 'regional',
    }))
  const pkg = packageFixture({ statuses, ...packageOverrides })
  return buildSourceDiagnostic({
    source: sourceFixture(quality),
    resource: { pipelineId: 'oeb-bretagne-znieff-csv-2026-01-29' },
    package: pkg,
    adapterMetrics: metrics,
  })
}

test('A — diagnostic v1 valide, quality pass', () => {
  const diagnostic = build({
    expectedStatuses: 9,
    expectedResolutionRate: 0.9,
    minStatuses: 8,
    minResolutionRate: 0.85,
    requiredCategories: ['znieff'],
    sentinels: [{ cdRef: 97152, category: 'znieff', value: 'Oui', scope: 'regional' }],
  })
  assert.equal(diagnostic.schemaVersion, 1)
  assert.equal(validateSourceDiagnostic(diagnostic).quality.status, 'pass')
  assert.equal(diagnostic.metrics.rowsConsidered, 10)
  assert.equal(diagnostic.metrics.resolutionRate, 0.9)
  assert.equal(diagnostic.metrics.categories.znieff, 9)
  assert.equal(diagnostic.baseline.statusesDelta, 0)
  assert.equal(diagnostic.baseline.resolutionRateDelta, 0)
  assert.equal(diagnostic.quality.failures.length, 0)
})

test('B — résolution sous seuil → fail', () => {
  const diagnostic = build({ minResolutionRate: 0.99 }, { rowsResolved: 98, unresolved: 2, matchRate: 0.98 })
  assert.equal(diagnostic.metrics.resolutionRate, 0.98)
  assert.equal(diagnostic.quality.status, 'fail')
  assert.equal(diagnostic.quality.failures.some((check) => check.id === 'minResolutionRate'), true)
})

test('C — volume sous seuil → fail', () => {
  const diagnostic = build({ minStatuses: 850 }, { rowsResolved: 849, unresolved: 0, matchRate: 1, duplicatesDropped: 0 })
  assert.equal(diagnostic.metrics.statusesProduced, 849)
  assert.equal(diagnostic.quality.status, 'fail')
  assert.equal(diagnostic.quality.failures.some((check) => check.id === 'minStatuses'), true)
})

test('D — catégorie requise absente → fail', () => {
  const diagnostic = build(
    { requiredCategories: ['znieff'] },
    {
      rowsResolved: 1,
      unresolved: 0,
      matchRate: 1,
      duplicatesDropped: 0,
      statuses: [
        {
          cdRef: 1,
          region: 'BRE',
          category: 'other',
          label: 'Autre',
          value: 'Oui',
          sourceId: 'oeb-bretagne-znieff-csv-2026-01-29',
          scope: 'regional',
        },
      ],
    },
  )
  assert.equal(diagnostic.metrics.categories.znieff ?? 0, 0)
  assert.equal(diagnostic.quality.status, 'fail')
  assert.equal(diagnostic.quality.failures.some((check) => check.id === 'requiredCategory:znieff'), true)
})

test('E — sentinelle absente → fail', () => {
  const diagnostic = build({
    sentinels: [{ cdRef: 42, category: 'znieff', value: 'Oui', scope: 'regional' }],
  })
  assert.equal(diagnostic.quality.status, 'fail')
  assert.equal(diagnostic.quality.failures.some((check) => check.id === 'sentinel:42'), true)
})

test('F — sentinelle présente → check pass', () => {
  const diagnostic = build({
    sentinels: [{ cdRef: 97152, category: 'znieff', value: 'Oui', scope: 'regional' }],
  })
  const sentinel = diagnostic.quality.checks.find((check) => check.id === 'sentinel:97152')
  assert.equal(sentinel.passed, true)
  assert.equal(diagnostic.quality.status, 'pass')
})

test('G — sans quality → not_configured, aucun failure', () => {
  const diagnostic = build(undefined)
  assert.equal(diagnostic.quality.status, 'not_configured')
  assert.deepEqual(diagnostic.quality.checks, [])
  assert.deepEqual(diagnostic.quality.failures, [])
  assert.deepEqual(diagnostic.baseline, {})
})

test('H — seuil invalide est une erreur de configuration', () => {
  assert.throws(() => validateQualityConfig({ minResolutionRate: 1.2 }), /Seuil invalide: minResolutionRate=1.2/)
  assert.throws(
    () =>
      evaluateSourceQuality({
        source: sourceFixture({ minResolutionRate: 1.2 }),
        pkg: packageFixture(),
        metrics: { resolutionRate: 0.9, statusesProduced: 9, categories: { znieff: 9 } },
      }),
    /Seuil invalide: minResolutionRate=1.2/,
  )
})
