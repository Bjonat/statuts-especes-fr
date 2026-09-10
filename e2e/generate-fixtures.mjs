/**
 * Génère deux jeux v3 synthétiques (A / B) avec de vrais SHA-256.
 * Taxons explicitement fictifs — ces fichiers ne sont pas un référentiel scientifique.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REGIONS = [
  { code: 'ARA', name: 'Auvergne-Rhône-Alpes' },
  { code: 'BFC', name: 'Bourgogne-Franche-Comté' },
  { code: 'BRE', name: 'Bretagne' },
  { code: 'CVL', name: 'Centre-Val de Loire' },
  { code: 'COR', name: 'Corse' },
  { code: 'GES', name: 'Grand Est' },
  { code: 'HDF', name: 'Hauts-de-France' },
  { code: 'IDF', name: 'Île-de-France' },
  { code: 'NOR', name: 'Normandie' },
  { code: 'NAQ', name: 'Nouvelle-Aquitaine' },
  { code: 'OCC', name: 'Occitanie' },
  { code: 'PDL', name: 'Pays de la Loire' },
  { code: 'PAC', name: "Provence-Alpes-Côte d'Azur" },
]

const REALMS = ['flora', 'fauna']

const FLORA_A = [
  {
    cdRef: 900001,
    realm: 'flora',
    scientificName: 'Planta fictiva',
    vernacularNames: ['Plante fictive de test'],
    synonyms: ['Herba falsa'],
    family: 'Testaceae',
  },
  {
    cdRef: 900002,
    realm: 'flora',
    scientificName: 'Taxon testus',
    vernacularNames: ['Taxon de test'],
    synonyms: [],
    family: 'Testaceae',
  },
  {
    cdRef: 900004,
    realm: 'flora',
    scientificName: 'Flora vacua',
    vernacularNames: ['Plante sans statut de test'],
    synonyms: [],
    family: 'Testaceae',
  },
  {
    cdRef: 900005,
    realm: 'flora',
    scientificName: 'Status orbus',
    vernacularNames: ['Statut orphelin de test'],
    synonyms: [],
    family: 'Testaceae',
  },
  {
    cdRef: 900006,
    realm: 'flora',
    scientificName: 'Documenta gemina',
    vernacularNames: ['Taxon à deux documents de test'],
    synonyms: [],
    family: 'Testaceae',
  },
]

const FLORA_B = [
  ...FLORA_A,
  {
    cdRef: 900003,
    realm: 'flora',
    scientificName: 'Herba imaginaria',
    vernacularNames: ['Herbe imaginaire de test'],
    synonyms: [],
    family: 'Testaceae',
  },
]

const FAUNA = [
  {
    cdRef: 900101,
    realm: 'fauna',
    scientificName: 'Animalia testensis',
    vernacularNames: ['Animal de test'],
    synonyms: [],
    family: 'Testidae',
  },
]

function sources(datasetVersion, checkedAt) {
  return [
    {
      id: 'taxref-v18',
      name: 'TAXREF (fixture E2E)',
      producer: 'E2E synthétique',
      version: datasetVersion,
      official: true,
      checkedAt,
    },
    {
      id: 'bdc-v18',
      name: 'BDC Statuts (fixture E2E)',
      producer: 'E2E synthétique',
      version: datasetVersion,
      official: true,
      checkedAt,
    },
    {
      id: 'fixture-lrr-occ',
      name: 'Fixture LRR Occitanie',
      producer: 'Producteur E2E LRR',
      version: datasetVersion,
      publicationYear: 2026,
      official: true,
      checkedAt,
    },
    {
      id: 'fixture-znieff-occ',
      name: 'Fixture ZNIEFF Occitanie',
      producer: 'Autre producteur E2E',
      version: 'test-2',
      official: true,
    },
    {
      id: 'fixture-naq-synth',
      name: 'Fixture NAQ synthétique',
      producer: 'Producteur E2E NAQ',
      version: datasetVersion,
      official: true,
      checkedAt,
    },
  ]
}

function definitions(marker) {
  return [
    {
      category: 'red_list_regional',
      label: 'Liste rouge régionale (fixture)',
      value: `VU — fixture ${marker}`,
      sourceId: 'fixture-lrr-occ',
      document: {
        cdDoc: 'fixture-doc-1',
        citation: 'Citation fictive explicite du document fixture-doc-1',
        url: 'https://example.test/fixture-doc-1',
      },
    },
    {
      category: 'znieff',
      label: 'Déterminante ZNIEFF (fixture Midi-Pyrénées)',
      value: 'Oui — Midi-Pyrénées (fixture)',
      sourceId: 'fixture-znieff-occ',
    },
    {
      category: 'znieff',
      label: 'Déterminante ZNIEFF (fixture Languedoc-Roussillon)',
      value: 'Oui — Languedoc-Roussillon (fixture)',
      sourceId: 'fixture-znieff-occ',
    },
    {
      category: 'protection_regional',
      label: 'Protection régionale (fixture)',
      value: `Protégée — fixture ${marker}`,
      sourceId: 'fixture-naq-synth',
    },
    {
      category: 'red_list_regional',
      label: 'Liste rouge régionale faune (fixture)',
      value: `NT — fixture ${marker}`,
      sourceId: 'fixture-lrr-occ',
    },
    {
      category: 'other',
      label: 'Statut orphelin de test',
      value: 'Présent — sans métadonnée de source',
      sourceId: 'fixture-source-absente',
      document: {
        cdDoc: 'fixture-doc-orphan',
        citation: 'Citation orpheline de test',
        url: 'https://example.test/fixture-doc-orphan',
      },
    },
    {
      category: 'red_list_regional',
      label: 'Liste rouge régionale jumelle (fixture)',
      value: `VU — jumeau ${marker}`,
      sourceId: 'fixture-lrr-occ',
      document: {
        cdDoc: 'fixture-doc-twin-a',
        citation: 'Citation jumelle A',
        url: 'https://example.test/fixture-doc-twin-a',
      },
    },
    {
      category: 'red_list_regional',
      label: 'Liste rouge régionale jumelle (fixture)',
      value: `VU — jumeau ${marker}`,
      sourceId: 'fixture-lrr-occ',
      document: {
        cdDoc: 'fixture-doc-twin-b',
        citation: 'Citation jumelle B',
      },
    },
  ]
}

function writeHashed(dir, prefix, data) {
  const body = JSON.stringify(data)
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12)
  const file = `${prefix}-${hash}.json`
  if (!/^[a-z0-9-]+-[a-f0-9]{12}\.json$/i.test(file)) {
    throw new Error(`Nom de fichier non conforme : ${file}`)
  }
  writeFileSync(join(dir, file), body)
  return { file, count: data.length, bytes: Buffer.byteLength(body) }
}

function buildVersion(outDir, spec) {
  mkdirSync(outDir, { recursive: true })
  const flora = writeHashed(outDir, 'taxa-flora', spec.flora)
  const fauna = writeHashed(outDir, 'taxa-fauna', spec.fauna)
  const statusDefinitions = writeHashed(outDir, 'status-definitions', spec.definitions)

  const occFloraLinks = [
    [900001, 0, 1],
    [900001, 1, 2, 'Midi-Pyrénées'],
    [900001, 2, 2, 'Languedoc-Roussillon'],
    [900002, 0, 1],
    [900005, 5, 1],
    [900006, 6, 1],
    [900006, 7, 1],
    ...spec.extraOccFloraLinks,
  ]
  const occFaunaLinks = [[900101, 4, 1]]
  const naqFloraLinks = [[900001, 3, 1]]
  const naqFaunaLinks = [[900101, 3, 1]]

  const statusLinks = { flora: {}, fauna: {} }
  for (const realm of REALMS) {
    for (const region of REGIONS) {
      let rows = []
      if (region.code === 'OCC' && realm === 'flora') rows = occFloraLinks
      if (region.code === 'OCC' && realm === 'fauna') rows = occFaunaLinks
      if (region.code === 'NAQ' && realm === 'flora') rows = naqFloraLinks
      if (region.code === 'NAQ' && realm === 'fauna') rows = naqFaunaLinks
      statusLinks[realm][region.code] = writeHashed(
        outDir,
        `status-links-${realm}-${region.code.toLowerCase()}`,
        rows,
      )
    }
  }

  const manifest = {
    schemaVersion: 3,
    generatedAt: spec.generatedAt,
    datasetVersion: spec.datasetVersion,
    official: true,
    taxrefVersion: 'e2e-taxref',
    bdcVersion: 'e2e-bdc',
    regions: REGIONS,
    sources: spec.sources,
    files: {
      taxa: { flora, fauna },
      statusDefinitions,
      statusLinks,
    },
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest))
  return manifest
}

export function generateFixtures(rootDir) {
  rmSync(rootDir, { recursive: true, force: true })
  mkdirSync(rootDir, { recursive: true })

  const aDir = join(rootDir, 'a')
  const bDir = join(rootDir, 'b')

  const a = buildVersion(aDir, {
    datasetVersion: 'e2e-a',
    generatedAt: '2026-09-09T10:00:00Z',
    flora: FLORA_A,
    fauna: FAUNA,
    definitions: definitions('e2e-a'),
    sources: sources('e2e-a', '2026-09-09'),
    extraOccFloraLinks: [],
  })

  const b = buildVersion(bDir, {
    datasetVersion: 'e2e-b',
    generatedAt: '2026-09-10T10:00:00Z',
    flora: FLORA_B,
    fauna: FAUNA,
    definitions: definitions('e2e-b'),
    sources: sources('e2e-b', '2026-09-10'),
    extraOccFloraLinks: [[900003, 0, 1]],
  })

  writeFileSync(
    join(rootDir, 'index.json'),
    `${JSON.stringify(
      {
        synthetic: true,
        warning: 'Fixtures E2E synthétiques. Ne pas utiliser comme assertion scientifique.',
        versions: {
          a: { datasetVersion: a.datasetVersion, generatedAt: a.generatedAt },
          b: { datasetVersion: b.datasetVersion, generatedAt: b.generatedAt },
        },
      },
      null,
      2,
    )}\n`,
  )

  return { a, b }
}

if (process.argv[1]?.endsWith('generate-fixtures.mjs')) {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'generated')
  const { a, b } = generateFixtures(outDir)
  console.log(`Fixtures E2E générées dans ${outDir}`)
  console.log(`A ${a.datasetVersion} ${a.generatedAt}`)
  console.log(`B ${b.datasetVersion} ${b.generatedAt}`)
}
