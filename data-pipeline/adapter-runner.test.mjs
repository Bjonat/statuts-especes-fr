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
]

const here = path.dirname(fileURLToPath(import.meta.url))
const PIPELINE_ID = 'oeb-bretagne-znieff-csv-2026-01-29'
const CHECKED_AT = '2026-09-03'

const TAXREF_TSV = [
  ['CD_NOM', 'CD_REF', 'REGNE', 'LB_NOM', 'NOM_COMPLET', 'NOM_VALIDE'].join('\t'),
  ['900001', '900001', 'Plantae', 'Fixture flora znieff', 'Fixture flora znieff', 'Fixture flora znieff'].join('\t'),
  ['900002', '900002', 'Animalia', 'Fixture fauna znieff', 'Fixture fauna znieff', 'Fixture fauna znieff'].join('\t'),
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
  '',
].join('\n')

const ZNIEFF_CSV = [
  'CD_NOM;NOM_SCIEN_VALIDE;NOM_SCIENTIFIQUE_TAXREF;NOM_FRANCAIS;ANNEE_EVALUATION;GROUP1_INPN;GROUP2_INPN;LISTE_ZNIEFF',
  '900001;Fixture flora znieff;;Flore fixture;2015;Trachéophytes;;',
  '900001;Fixture flora znieff;;Flore fixture doublon;2016;Trachéophytes;;',
  '900002;Fixture fauna znieff;;Faune fixture;2018;Oiseaux;;',
  ';Fixture name only plant;;;2014;;;Liste ZNIEFF fixture',
  '999999;Unknown fixture taxon;Unknown fixture taxon;Inconnu;;;',
  ';Fixture ambiguous plant;;;2020;Mousses;;',
  '900006;Fixture excluded fungus;;;2011;Champignons;;',
  '',
].join('\n')

function sourceFixture(overrides = {}) {
  return {
    id: 'oeb-bretagne-znieff',
    region: 'BRE',
    categories: ['znieff'],
    realms: ['flora', 'fauna'],
    state: 'IMPORTED',
    adapter: 'oeb-csv-znieff',
    name: 'Espèces déterminantes ZNIEFF Bretagne',
    producer: "Observatoire de l'environnement en Bretagne / CSRPN Bretagne",
    official: true,
    resources: [
      {
        kind: 'csv',
        url: 'https://example.test/znieff.csv',
        pipelineId: PIPELINE_ID,
        version: 'CSV 29/01/2026 - évaluations 2004-2020',
        publicationYear: 2026,
      },
    ],
    ...overrides,
  }
}

function registryFixture(sources) {
  return { schemaVersion: 1, sources }
}

async function withWorkspace(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bre-znieff-adapter-'))
  const taxrefPath = path.join(dir, 'TAXREFv18.txt')
  const inputPath = path.join(dir, 'bre-znieff.csv')
  const outputPath = path.join(dir, 'out', 'bre-znieff.json')
  const diagnosticsPath = path.join(dir, 'diagnostics', 'oeb-bretagne-znieff.json')
  await writeFile(taxrefPath, TAXREF_TSV, 'utf8')
  await writeFile(inputPath, ZNIEFF_CSV, 'utf8')
  try {
    return await run({ dir, taxrefPath, inputPath, outputPath, diagnosticsPath })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function expectedSha(csv) {
  return createHash('sha256').update(csv, 'utf8').digest('hex')
}

test('le pilote IMPORTED produit un paquet ZNIEFF schemaVersion 1 validé', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    const pkg = await runAdapter({
      registry: registryFixture([sourceFixture()]),
      sourceId: 'oeb-bretagne-znieff',
      taxrefPath,
      inputPath,
      outputPath,
      diagnosticsPath,
      checkedAt: CHECKED_AT,
    })

    assert.equal(pkg.schemaVersion, 1)
    assert.equal(validateRegionalPackage(pkg).source.id, PIPELINE_ID)
    assert.equal(pkg.source.id, PIPELINE_ID)
    assert.equal(pkg.source.name, 'Espèces déterminantes ZNIEFF Bretagne')
    assert.equal(pkg.source.producer, "Observatoire de l'environnement en Bretagne / CSRPN Bretagne")
    assert.equal(pkg.source.version, 'CSV 29/01/2026 - évaluations 2004-2020')
    assert.equal(pkg.source.publicationYear, 2026)
    assert.equal(pkg.source.official, true)
    assert.equal(pkg.source.checkedAt, CHECKED_AT)
    assert.equal(pkg.source.sha256, expectedSha(ZNIEFF_CSV))
    assert.equal(pkg.source.sha256.length, 64)

    assert.deepEqual(pkg.statuses, [
      {
        cdRef: 900001,
        region: 'BRE',
        category: 'znieff',
        label: 'Déterminante ZNIEFF',
        value: 'Oui',
        sourceId: PIPELINE_ID,
        scope: 'regional',
      },
      {
        cdRef: 900002,
        region: 'BRE',
        category: 'znieff',
        label: 'Déterminante ZNIEFF',
        value: 'Oui',
        sourceId: PIPELINE_ID,
        scope: 'regional',
      },
      {
        cdRef: 900003,
        region: 'BRE',
        category: 'znieff',
        label: 'Déterminante ZNIEFF',
        value: 'Oui',
        sourceId: PIPELINE_ID,
        scope: 'regional',
      },
    ])
    assert.equal(pkg.statuses.some((status) => status.cdRef === 900001), true)
    assert.equal(pkg.statuses.filter((status) => status.cdRef === 900001).length, 1)
    assert.deepEqual(pkg.replaces, [
      { region: 'BRE', category: 'znieff', realm: 'flora', cdRefs: [900001, 900003] },
      { region: 'BRE', category: 'znieff', realm: 'fauna', cdRefs: [900002] },
    ])
    assert.deepEqual(pkg.diagnostics, {
      rows: 7,
      matched: 4,
      cd_nom: 3,
      name: 1,
      excluded_realm: 1,
      unmatched: 1,
      ambiguous: 1,
      flora: 3,
      fauna: 1,
      unresolvedSample: [
        { taxon: 'Unknown fixture taxon', code: '999999', reason: 'unmatched' },
        { taxon: 'Fixture ambiguous plant', code: '', reason: 'ambiguous' },
      ],
      matchRate: 0.666667,
      years: ['2014', '2015', '2016', '2018'],
      groups: ['Liste ZNIEFF fixture', 'Oiseaux', 'Trachéophytes'],
    })

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.deepEqual(written, pkg)
    assert.deepEqual(Object.keys(pkg.diagnostics), HISTORICAL_DIAGNOSTIC_KEYS)
    for (const key of ['schemaVersion', 'quality', 'checks', 'baseline']) {
      assert.equal(key in pkg.diagnostics, false)
    }

    const sidecar = JSON.parse(await readFile(diagnosticsPath, 'utf8'))
    assert.equal(validateSourceDiagnostic(sidecar).quality.status, 'not_configured')
    assert.equal(sidecar.metrics.resolutionRate, pkg.diagnostics.matchRate)
    assert.equal(sidecar.metrics.duplicatesDropped, 1)
    assert.equal(sidecar.metrics.statusesProduced, 3)
  })
})

test('une source sans quality produit le paquet et un sidecar not_configured', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    await runAdapter({
      registry: registryFixture([sourceFixture()]),
      sourceId: 'oeb-bretagne-znieff',
      taxrefPath,
      inputPath,
      outputPath,
      diagnosticsPath,
      checkedAt: CHECKED_AT,
    })
    await access(outputPath)
    const sidecar = JSON.parse(await readFile(diagnosticsPath, 'utf8'))
    assert.equal(sidecar.quality.status, 'not_configured')
    assert.deepEqual(sidecar.quality.failures, [])
  })
})

test('un échec qualité écrit le sidecar et bloque le paquet', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    await assert.rejects(
      () =>
        runAdapter({
          registry: registryFixture([sourceFixture({ quality: { minResolutionRate: 0.99 } })]),
          sourceId: 'oeb-bretagne-znieff',
          taxrefPath,
          inputPath,
          outputPath,
          diagnosticsPath,
          checkedAt: CHECKED_AT,
        }),
      /QUALITY FAIL oeb-bretagne-znieff/,
    )
    const sidecar = JSON.parse(await readFile(diagnosticsPath, 'utf8'))
    assert.equal(sidecar.quality.status, 'fail')
    assert.equal(sidecar.quality.failures.some((check) => check.id === 'minResolutionRate'), true)
    await assert.rejects(() => access(outputPath), { code: 'ENOENT' })
  })
})

test('une source avec quality satisfaite écrit paquet et sidecar pass', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    const pkg = await runAdapter({
      registry: registryFixture([
        sourceFixture({
          quality: {
            minStatuses: 3,
            minResolutionRate: 0.6,
            requiredCategories: ['znieff'],
            sentinels: [{ cdRef: 900001, category: 'znieff', value: 'Oui', scope: 'regional' }],
          },
        }),
      ]),
      sourceId: 'oeb-bretagne-znieff',
      taxrefPath,
      inputPath,
      outputPath,
      diagnosticsPath,
      checkedAt: CHECKED_AT,
    })
    await access(outputPath)
    const sidecar = JSON.parse(await readFile(diagnosticsPath, 'utf8'))
    assert.equal(sidecar.quality.status, 'pass')
    assert.equal(sidecar.metrics.resolutionRate, pkg.diagnostics.matchRate)
  })
})

test('une source WITNESS est refusée et n’écrit aucun fichier', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    await assert.rejects(
      () =>
        runAdapter({
          registry: registryFixture([sourceFixture({ state: 'WITNESS' })]),
          sourceId: 'oeb-bretagne-znieff',
          taxrefPath,
          inputPath,
          outputPath,
          diagnosticsPath,
          checkedAt: CHECKED_AT,
        }),
      /WITNESS et ne peut pas être publiée/,
    )
    await assert.rejects(() => access(outputPath), { code: 'ENOENT' })
    await assert.rejects(() => access(diagnosticsPath), { code: 'ENOENT' })
  })
})

test('un adaptateur inconnu est refusé sans écrire le paquet', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath }) => {
    await assert.rejects(
      () =>
        runAdapter({
          registry: registryFixture([sourceFixture({ adapter: 'not-an-adapter' })]),
          sourceId: 'oeb-bretagne-znieff',
          taxrefPath,
          inputPath,
          outputPath,
          checkedAt: CHECKED_AT,
        }),
      /Adaptateur inconnu: not-an-adapter/,
    )
    await assert.rejects(() => access(outputPath), { code: 'ENOENT' })
  })
})

test('une source inconnue est refusée sans écrire le paquet', async () => {
  await withWorkspace(async ({ taxrefPath, inputPath, outputPath }) => {
    await assert.rejects(
      () =>
        runAdapter({
          registry: registryFixture([sourceFixture()]),
          sourceId: 'source-absente',
          taxrefPath,
          inputPath,
          outputPath,
          checkedAt: CHECKED_AT,
        }),
      /Source inconnue: source-absente/,
    )
    await assert.rejects(() => access(outputPath), { code: 'ENOENT' })
  })
})

test('parité Python historique sur les fixtures synthétiques', async (t) => {
  const probe = spawnSync('python3', ['-c', 'import importlib; print("ok")'], { encoding: 'utf8' })
  if (probe.status !== 0) {
    t.skip('python3 indisponible')
    return
  }

  await withWorkspace(async ({ taxrefPath, inputPath, outputPath, diagnosticsPath }) => {
    const candidate = await runAdapter({
      registry: registryFixture([sourceFixture()]),
      sourceId: 'oeb-bretagne-znieff',
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
from build_oeb import read_csv_rows, wanted_from_rows, taxref_lookup, build_znieff
csv_path = Path(${JSON.stringify(inputPath)})
rows = read_csv_rows(csv_path)
codes, names = wanted_from_rows(rows, ("CD_NOM",), ("NOM_SCIEN_VALIDE", "NOM_SCIENTIFIQUE_TAXREF"))
by_cd_nom, accepted_names = taxref_lookup(Path(${JSON.stringify(taxrefPath)}), codes, names)
print(json.dumps(build_znieff(rows, by_cd_nom, accepted_names, csv_path, ${JSON.stringify(CHECKED_AT)}), ensure_ascii=False))
`,
      ],
      { encoding: 'utf8', maxBuffer: 2_000_000 },
    )
    assert.equal(python.status, 0, python.stderr || python.stdout)
    const legacy = JSON.parse(python.stdout)
    assert.deepEqual(candidate, legacy)
  })
})
