import assert from 'node:assert/strict'
import test from 'node:test'
import { UNPUBLISHABLE_SOURCE_IDS, mergeRegionalPackages, validateRegionalPackage } from './regional.mjs'

const taxa = [
  { cdRef: 100, realm: 'flora' },
  { cdRef: 101, realm: 'flora' },
  { cdRef: 200, realm: 'fauna' },
]

function packageFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    source: {
      id: 'dreal-occ-znieff-2024',
      name: 'Espèces déterminantes ZNIEFF Occitanie',
      producer: 'DREAL Occitanie / CSRPN',
      version: '2024',
      official: true,
      checkedAt: '2026-08-21',
    },
    replaces: [{ region: 'OCC', category: 'znieff', realm: 'flora' }],
    statuses: [
      {
        cdRef: 100,
        region: 'OCC',
        category: 'znieff',
        label: 'Déterminante ZNIEFF',
        value: 'Oui',
        sourceId: 'dreal-occ-znieff-2024',
        scope: 'regional',
      },
    ],
    ...overrides,
  }
}

test('un paquet régional officiel valide respecte le contrat commun', () => {
  assert.equal(validateRegionalPackage(packageFixture()).source.id, 'dreal-occ-znieff-2024')
})

test('une source régionale non officielle est refusée', () => {
  const pkg = packageFixture()
  pkg.source.official = false
  assert.throws(() => validateRegionalPackage(pkg), /marquée officielle/)
})

test('une source régionale ne peut pas embarquer de champ url documentaire', () => {
  const pkg = packageFixture()
  pkg.source.url = 'https://example.test/source.xlsx'
  assert.throws(() => validateRegionalPackage(pkg), /champ url documentaire/)
})

test('une liste régionale autoritaire remplace la même catégorie BDC pour son règne uniquement', () => {
  const base = [
    { cdRef: 100, region: 'OCC', category: 'znieff', label: 'ZNIEFF BDC', value: 'Oui', sourceId: 'bdc-v18', scope: 'regional' },
    { cdRef: 200, region: 'OCC', category: 'znieff', label: 'ZNIEFF BDC', value: 'Oui', sourceId: 'bdc-v18', scope: 'regional' },
    { cdRef: 100, region: 'OCC', category: 'red_list_regional', label: 'Liste rouge régionale', value: 'LC', sourceId: 'bdc-v18', scope: 'regional' },
  ]

  const merged = mergeRegionalPackages(base, taxa, [packageFixture()])
  assert.equal(merged.statuses.some((status) => status.cdRef === 100 && status.category === 'znieff' && status.sourceId === 'bdc-v18'), false)
  assert.equal(merged.statuses.some((status) => status.cdRef === 100 && status.category === 'znieff' && status.sourceId === 'dreal-occ-znieff-2024'), true)
  assert.equal(merged.statuses.some((status) => status.cdRef === 200 && status.category === 'znieff' && status.sourceId === 'bdc-v18'), true)
  assert.equal(merged.statuses.some((status) => status.cdRef === 100 && status.category === 'red_list_regional'), true)
})

test('un override ciblé ne retire BDC que pour les CD_REF explicitement couverts', () => {
  const base = [
    { cdRef: 100, region: 'OCC', category: 'red_list_regional', label: 'LRR BDC', value: 'VU', sourceId: 'bdc-v18', scope: 'regional' },
    { cdRef: 101, region: 'OCC', category: 'red_list_regional', label: 'LRR BDC', value: 'LC', sourceId: 'bdc-v18', scope: 'regional' },
  ]
  const pkg = packageFixture({
    replaces: [{ region: 'OCC', category: 'red_list_regional', realm: 'flora', cdRefs: [100] }],
    statuses: [{
      cdRef: 100,
      region: 'OCC',
      category: 'red_list_regional',
      label: 'Liste rouge régionale',
      value: 'EN',
      sourceId: 'dreal-occ-znieff-2024',
      scope: 'regional',
    }],
  })

  const merged = mergeRegionalPackages(base, taxa, [pkg])
  assert.equal(merged.statuses.some((status) => status.cdRef === 100 && status.sourceId === 'bdc-v18'), false)
  assert.equal(merged.statuses.some((status) => status.cdRef === 100 && status.value === 'EN'), true)
  assert.equal(merged.statuses.some((status) => status.cdRef === 101 && status.sourceId === 'bdc-v18'), true)
})

test('les CD_REF ciblés doivent être valides, non vides et non dupliqués', () => {
  assert.throws(
    () => validateRegionalPackage(packageFixture({ replaces: [{ region: 'OCC', category: 'znieff', realm: 'flora', cdRefs: [] }] })),
    /tableau non vide/,
  )
  assert.throws(
    () => validateRegionalPackage(packageFixture({ replaces: [{ region: 'OCC', category: 'znieff', realm: 'flora', cdRefs: [100, 100] }] })),
    /dupliqué/,
  )
})

test('le témoin de schéma BFC 2023 reste explicite et non publiable', () => {
  assert.equal(UNPUBLISHABLE_SOURCE_IDS.has('arb-bfc-statuts-2023-12-19'), true)
  const pkg = packageFixture({
    source: {
      id: 'arb-bfc-statuts-2023-12-19',
      name: 'Statuts des espèces de Bourgogne-Franche-Comté',
      producer: 'DREAL Bourgogne-Franche-Comté / ARB BFC',
      version: '2023-12-19',
      official: true,
      checkedAt: '2026-08-22',
      publicationPolicy: 'schema-witness-smoke-only',
    },
    replaces: [{ region: 'BFC', category: 'red_list_regional', realm: 'fauna', cdRefs: [200] }],
    statuses: [{
      cdRef: 200,
      region: 'BFC',
      category: 'red_list_regional',
      label: 'Liste rouge régionale',
      value: 'VU',
      sourceId: 'arb-bfc-statuts-2023-12-19',
      scope: 'partial',
      scopeLabel: 'ancienne région Bourgogne',
    }],
  })
  assert.equal(validateRegionalPackage(pkg).source.id, 'arb-bfc-statuts-2023-12-19')
})

test('une LRR d’ancienne région BFC ne remplace que les CD_REF couverts et reste partielle', () => {
  const base = [
    { cdRef: 200, region: 'BFC', category: 'red_list_regional', label: 'LRR BDC', value: 'LC', sourceId: 'bdc-v18', scope: 'regional' },
    { cdRef: 201, region: 'BFC', category: 'red_list_regional', label: 'LRR BDC', value: 'NT', sourceId: 'bdc-v18', scope: 'regional' },
  ]
  const taxaWithFauna = [...taxa, { cdRef: 201, realm: 'fauna' }]
  const pkg = packageFixture({
    source: {
      id: 'arb-bfc-statuts-2023-12-19',
      name: 'Statuts des espèces de Bourgogne-Franche-Comté',
      producer: 'DREAL Bourgogne-Franche-Comté / ARB BFC',
      version: '2023-12-19',
      official: true,
      checkedAt: '2026-08-22',
    },
    replaces: [{ region: 'BFC', category: 'red_list_regional', realm: 'fauna', cdRefs: [200] }],
    statuses: [{
      cdRef: 200,
      region: 'BFC',
      category: 'red_list_regional',
      label: 'Liste rouge régionale',
      value: 'VU',
      sourceId: 'arb-bfc-statuts-2023-12-19',
      scope: 'partial',
      scopeLabel: 'ancienne région Bourgogne',
    }],
  })

  const merged = mergeRegionalPackages(base, taxaWithFauna, [pkg])
  assert.equal(merged.statuses.some((status) => status.cdRef === 200 && status.sourceId === 'bdc-v18'), false)
  assert.equal(merged.statuses.some((status) => status.cdRef === 200 && status.scope === 'partial' && status.value === 'VU'), true)
  assert.equal(merged.statuses.some((status) => status.cdRef === 201 && status.sourceId === 'bdc-v18'), true)
})

test('les CD_REF régionaux inconnus sont comptés et ignorés sans polluer le catalogue', () => {
  const pkg = packageFixture({
    statuses: [
      ...packageFixture().statuses,
      { cdRef: 999999, region: 'OCC', category: 'znieff', label: 'Déterminante ZNIEFF', value: 'Oui', sourceId: 'dreal-occ-znieff-2024', scope: 'regional' },
    ],
  })
  const merged = mergeRegionalPackages([], taxa, [pkg])
  assert.equal(merged.diagnostics[0].imported, 1)
  assert.equal(merged.diagnostics[0].unknownRefs, 1)
  assert.equal(merged.statuses.some((status) => status.cdRef === 999999), false)
})
