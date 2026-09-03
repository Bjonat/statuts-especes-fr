import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runAdapter } from './run-adapter.mjs'
import { validateRegionalPackage } from './regional.mjs'
import { validateSourceDiagnostic } from './diagnostics.mjs'

const HISTORICAL_DIAGNOSTIC_KEYS = [
  'rows',
  'matched',
  'cd_nom',
  'name',
  'excluded_realm',
  'unmatched',
  'ambiguous',
  'flora',
  'fauna',
  'unresolvedSample',
  'matchRate',
  'years',
  'groups',
  'values',
]

const here = path.dirname(fileURLToPath(import.meta.url))
const PIPELINE_ID = 'oeb-bretagne-lrr-csv-2026-01-29'
const CHECKED_AT = '2026-09-03'

const TAXREF_TSV = [
  ['CD_NOM', 'CD_REF', 'REGNE', 'LB_NOM', 'NOM_COMPLET', 'NOM_VALIDE'].join('\t'),
  ['900001', '900001', 'Plantae', 'Fixture flora lrr', 'Fixture flora lrr', 'Fixture flora lrr'].join('\t'),
  ['900002', '900002', 'Animalia', 'Fixture fauna lrr', 'Fixture fauna lrr', 'Fixture fauna lrr'].join('\t'),
  ['900003', '900003', 'Plantae', 'Fixture name only plant', 'Fixture name only plant', 'Fixture name only plant'].join(
    '\t',
  ),
  ['900004', '900004', 'Plantae', 'Fixture ambiguous plant', 'Fixture ambiguous plant', 'Fixture ambiguous plant'].join(
    '\t',
  ),
  ['900005', '900005', 'Plantae', 'Fixture ambiguous plant', 'Fixture ambiguous plant A', 'Fixture ambiguous plant A'].join(
    '\t',
  ),
  ['900006', '900006', 'Fungi', 'Fixture excluded fungus', 'Fixture excluded fungus', 'Fixture excluded fungus'].join(
    '\t',
  ),
  ['900007', '900007', 'Animalia', 'Fixture dual bird', 'Fixture dual bird', 'Fixture dual bird'].join('\t'),
  '',
].join('\n')

const LRR_CSV = [
  'CODE_NOM_TAXREF;CD_NOM;NOM_SCIENTIFIQUE_TAXREF;NOM_SCIEN_VALIDE;NOM_VERNACULAIRE;RESULTAT_EVALUATION;ANNEE_EVALUATION;GROUPE_ESPECE',
  '900001;;Fixture flora lrr;;;CR;2015;Flore vasculaire',
  '900001;;Fixture flora lrr;;;CR;2015;Flore vasculaire',
  '900001;;Fixture flora lrr;;;vu;2015;Flore vasculaire',
  '900002;;Fixture fauna lrr;;;EN;2018;Mammifères',
  ';;Fixture name only plant;;;LC;2014;Flore vasculaire',
  '900099;;Ignored empty result;;;;2010;Flore vasculaire',
  '900007;;Fixture dual bird;;;DD;2015;Oiseaux migrateurs',
  '900007;;Fixture dual bird;;;EN;2023;Oiseaux nicheurs',
  '900007;;Fixture dual bird;;;EN;2023;Oiseaux nicheurs',
  '900006;;Fixture excluded fungus;;;NT;2011;Champignons',
  '999999;;Unknown fixture taxon;;Inconnu;NE;;',
  ';;Fixture ambiguous plant;;;DD;2020;Mousses',
  '',
].join('\n')

function sourceFixture(overrides = {}) {
  return {
    id: 'oeb-bretagne-lrr',
    region: 'BRE',
    categories: ['red_list_regional'],
    realms: ['flora', 'fauna'],
    state: 'IMPORTED',
    adapter: 'oeb-csv-lrr',
    name: 'Listes rouges régionales Bretagne',
    producer: "Observatoire de l'environnement en Bretagne / observatoires régionaux faune-flore",
    official: true,
    resources: [
      {
        kind: 'csv',
        url: 'https://example.test/lrr.csv',
        pipelineId: PIPELINE_ID,
        version: 'CSV 29/01/2026 - données mises à jour OEB 2025',
        publicationYear: 2026,
      },
    ],
    ...overrides,
  }
}

function passingQuality() {
  return {
    minStatuses: 6,
    minResolutionRate: 0.6,
    requiredCategories: ['red_list_regional'],
    sentinels: [{ cdRef: 900001, category: 'red_list_regional', value: 'CR', scope: 'regional' }],
  }
}

function registryFixture(sources) {
  return { schemaVersion: 1, sources }
}

async function withWorkspace(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bre-lrr-adapter-'))
  const taxrefPath = path.join(dir, 'TAXREFv18.txt')
  const inputPath = path.join(dir, 'bre-lrr.csv')
  const outputPath = path.join(dir, 'out', 'bre-lrr.json')
  const diagnosticsPath = path.join(dir, 'diagnostics', 'oeb-bretagne-lrr.json')
  await writeFile(taxrefPath, TAXREF_TSV, 'utf8')
  await writeFile(inputPath, LRR_CSV, 'utf8')
  try {
    return await run({ dir, taxrefPath, inputPath, outputPath, diagnosticsPath })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function expectedSha(csv) {
  return createHash('sha256').update(csv, 'utf8').digest('hex')
}

test('le pilote LRR produit un paquet schemaVersion 1 validé', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    const pkg = await runAdapter({
      registry: registryFixture([sourceFixture()]),
      sourceId: 'oeb-bretagne-lrr',
      taxrefPath,
      inputPath,
      outputPath,
      diagnosticsPath,
      checkedAt: CHECKED_AT,
    })

    assert.equal(pkg.schemaVersion, 1)
    assert.equal(validateRegionalPackage(pkg).source.id, PIPELINE_ID)
    assert.equal(pkg.source.id, PIPELINE_ID)
    assert.equal(pkg.source.name, 'Listes rouges régionales Bretagne')
    assert.equal(
      pkg.source.producer,
      "Observatoire de l'environnement en Bretagne / observatoires régionaux faune-flore",
    )
    assert.equal(pkg.source.version, 'CSV 29/01/2026 - données mises à jour OEB 2025')
    assert.equal(pkg.source.publicationYear, 2026)
    assert.equal(pkg.source.official, true)
    assert.equal(pkg.source.checkedAt, CHECKED_AT)
    assert.equal(pkg.source.sha256, expectedSha(LRR_CSV))
    assert.equal(pkg.source.sha256.length, 64)

    const floraCr = {
      cdRef: 900001,
      region: 'BRE',
      category: 'red_list_regional',
      label: 'Liste rouge régionale',
      value: 'CR',
      sourceId: PIPELINE_ID,
      scope: 'regional',
    }
    const floraVu = { ...floraCr, value: 'VU' }
    const faunaEn = {
      cdRef: 900002,
      region: 'BRE',
      category: 'red_list_regional',
      label: 'Liste rouge régionale',
      value: 'EN',
      sourceId: PIPELINE_ID,
      scope: 'regional',
    }
    const nameLc = {
      cdRef: 900003,
      region: 'BRE',
      category: 'red_list_regional',
      label: 'Liste rouge régionale',
      value: 'LC',
      sourceId: PIPELINE_ID,
      scope: 'regional',
    }
    const birdDd = {
      cdRef: 900007,
      region: 'BRE',
      category: 'red_list_regional',
      label: 'Liste rouge régionale',
      value: 'DD',
      sourceId: PIPELINE_ID,
      scope: 'regional',
    }
    const birdEn = { ...birdDd, value: 'EN' }

    assert.deepEqual(pkg.statuses, [floraCr, floraVu, faunaEn, nameLc, birdDd, birdEn])
    assert.equal(pkg.statuses.filter((status) => status.cdRef === 900007).length, 2)
    assert.equal(pkg.statuses.filter((status) => status.cdRef === 900007 && status.value === 'EN').length, 1)
    assert.equal(pkg.statuses.filter((status) => status.cdRef === 900001 && status.value === 'CR').length, 1)
    assert.deepEqual(pkg.replaces, [
      { region: 'BRE', category: 'red_list_regional', realm: 'flora', cdRefs: [900001, 900003] },
      { region: 'BRE', category: 'red_list_regional', realm: 'fauna', cdRefs: [900002, 900007] },
    ])
    assert.deepEqual(pkg.diagnostics, {
      rows: 11,
      matched: 8,
      cd_nom: 7,
      name: 1,
      excluded_realm: 1,
      unmatched: 1,
      ambiguous: 1,
      flora: 4,
      fauna: 4,
      unresolvedSample: [
        { taxon: 'Unknown fixture taxon', code: '999999', reason: 'unmatched' },
        { taxon: 'Fixture ambiguous plant', code: '', reason: 'ambiguous' },
      ],
      matchRate: 0.8,
      years: { 2014: 1, 2015: 4, 2018: 1, 2023: 2 },
      groups: {
        'Flore vasculaire': 4,
        Mammifères: 1,
        'Oiseaux migrateurs': 1,
        'Oiseaux nicheurs': 2,
      },
      values: { CR: 2, DD: 1, EN: 3, LC: 1, VU: 1 },
    })

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.deepEqual(written, pkg)
    assert.deepEqual(Object.keys(pkg.diagnostics), HISTORICAL_DIAGNOSTIC_KEYS)
    for (const key of ['schemaVersion', 'quality', 'checks', 'baseline']) {
      assert.equal(key in pkg.diagnostics, false)
    }

    const sidecar = JSON.parse(await readFile(diagnosticsPath, 'utf8'))
    assert.equal(validateSourceDiagnostic(sidecar).quality.status, 'not_configured')
    assert.equal(sidecar.metrics.rowsRead, 11)
    assert.equal(sidecar.metrics.rowsConsidered, 10)
    assert.equal(sidecar.metrics.rowsResolved, 8)
    assert.equal(sidecar.metrics.duplicatesDropped, 2)
    assert.equal(sidecar.metrics.statusesProduced, 6)
    assert.equal(sidecar.metrics.resolutionRate, 0.8)
    assert.equal(sidecar.input.sha256, pkg.source.sha256)
  })
})

test('une source LRR avec quality satisfaite écrit paquet et sidecar pass', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    const pkg = await runAdapter({
      registry: registryFixture([sourceFixture({ quality: passingQuality() })]),
      sourceId: 'oeb-bretagne-lrr',
      taxrefPath,
      inputPath,
      outputPath,
      diagnosticsPath,
      checkedAt: CHECKED_AT,
    })
    await access(outputPath)
    const sidecar = JSON.parse(await readFile(diagnosticsPath, 'utf8'))
    assert.equal(sidecar.quality.status, 'pass')
    assert.equal(sidecar.metrics.categories.red_list_regional, 6)
    assert.equal(
      sidecar.quality.checks.some((check) => check.id === 'sentinel:900001' && check.passed),
      true,
    )
    assert.equal(sidecar.metrics.resolutionRate, pkg.diagnostics.matchRate)
  })
})

test('un échec qualité LRR écrit le sidecar et bloque le paquet', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    await assert.rejects(
      () =>
        runAdapter({
          registry: registryFixture([
            sourceFixture({
              quality: {
                minResolutionRate: 0.99,
                sentinels: [{ cdRef: 97152, category: 'red_list_regional', value: 'CR', scope: 'regional' }],
              },
            }),
          ]),
          sourceId: 'oeb-bretagne-lrr',
          taxrefPath,
          inputPath,
          outputPath,
          diagnosticsPath,
          checkedAt: CHECKED_AT,
        }),
      /QUALITY FAIL oeb-bretagne-lrr/,
    )
    const sidecar = JSON.parse(await readFile(diagnosticsPath, 'utf8'))
    assert.equal(sidecar.quality.status, 'fail')
    assert.equal(sidecar.quality.failures.some((check) => check.id === 'minResolutionRate'), true)
    assert.equal(sidecar.quality.failures.some((check) => check.id === 'sentinel:97152'), true)
    await assert.rejects(() => access(outputPath), { code: 'ENOENT' })
  })
})

test('un adaptateur LRR diagnostiqué sans diagnosticsPath est refusé avant écriture', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    await assert.rejects(
      () =>
        runAdapter({
          registry: registryFixture([sourceFixture()]),
          sourceId: 'oeb-bretagne-lrr',
          taxrefPath,
          inputPath,
          outputPath,
          checkedAt: CHECKED_AT,
        }),
      /diagnosticsPath obligatoire pour l'adaptateur oeb-csv-lrr/,
    )
    await assert.rejects(() => access(outputPath), { code: 'ENOENT' })
    await assert.rejects(() => access(diagnosticsPath), { code: 'ENOENT' })
  })
})

test('parité Python historique LRR sur les fixtures synthétiques', async (t) => {
  const probe = spawnSync('python3', ['-c', 'import importlib; print("ok")'], { encoding: 'utf8' })
  if (probe.status !== 0) {
    t.skip('python3 indisponible')
    return
  }

  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    const candidate = await runAdapter({
      registry: registryFixture([sourceFixture()]),
      sourceId: 'oeb-bretagne-lrr',
      taxrefPath,
      inputPath,
      outputPath,
      diagnosticsPath,
      checkedAt: CHECKED_AT,
    })

    const python = spawnSync(
      'python3',
      [
        '-c',
        `
import json, sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(path.join(here, 'regions/bre'))})
from build_oeb import read_csv_rows, wanted_from_rows, taxref_lookup, build_lrr
csv_path = Path(${JSON.stringify(inputPath)})
rows = read_csv_rows(csv_path)
codes, names = wanted_from_rows(rows, ("CODE_NOM_TAXREF", "CD_NOM"), ("NOM_SCIENTIFIQUE_TAXREF", "NOM_SCIEN_VALIDE"))
by_cd_nom, accepted_names = taxref_lookup(Path(${JSON.stringify(taxrefPath)}), codes, names)
print(json.dumps(build_lrr(rows, by_cd_nom, accepted_names, csv_path, ${JSON.stringify(CHECKED_AT)}), ensure_ascii=False))
`,
      ],
      { encoding: 'utf8', maxBuffer: 2_000_000 },
    )
    assert.equal(python.status, 0, python.stderr || python.stdout)
    const legacy = JSON.parse(python.stdout)
    assert.deepEqual(candidate, legacy)
  })
})
