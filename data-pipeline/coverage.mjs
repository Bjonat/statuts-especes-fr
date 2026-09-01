import { REGIONS } from './regions.mjs'

/** Couverture des référentiels — pas l’applicabilité juridique d’un statut à un taxon. */
export const COVERAGE_SCHEMA_VERSION = 1

export const COVERAGE_DISCLAIMER =
  'Cette matrice décrit les référentiels que le système déclare ou prouve couvrir (région × règne × catégorie × groupe). Elle ne dit pas si un statut s’applique juridiquement à un taxon.'

export const REGISTER_STATES = new Set([
  'READY',
  'IMPORTED',
  'READY_WHEN_AVAILABLE',
  'PARTIAL',
  'PENDING_PUBLICATION',
  'RESEARCH_REQUIRED',
  'DO_NOT_IMPORT',
  'WITNESS',
])

export const REALMS = new Set(['flora', 'fauna'])

export const STATUS_CATEGORIES = new Set([
  'red_list_national',
  'red_list_regional',
  'protection_national',
  'protection_regional',
  'znieff',
  'regional_responsibility',
  'pna',
  'rarity',
  'indigenous_status',
  'other',
])

const REGION_BY_CODE = new Map(REGIONS.map((region) => [region.code, region]))

const CATEGORY_LABELS = {
  red_list_national: 'Liste rouge nationale',
  red_list_regional: 'Liste rouge régionale',
  protection_national: 'Protection nationale',
  protection_regional: 'Protection régionale',
  znieff: 'ZNIEFF',
  regional_responsibility: 'Responsabilité régionale',
  pna: 'PNA',
  rarity: 'Rareté',
  indigenous_status: 'Indigénat',
  other: 'Autre',
}

const NATIONAL_SOURCES = [
  {
    id: 'taxref-v18',
    role: 'taxonomy',
    version: 'v18',
    name: 'TAXREF',
  },
  {
    id: 'bdc-v18',
    role: 'national_statuses',
    version: 'v18',
    name: 'BDC-Statuts',
  },
]

export class CoverageRegistryError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CoverageRegistryError'
  }
}

export function regionCodes() {
  return REGIONS.map((region) => region.code)
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function validateReadySourcesRegistry(registry) {
  if (!registry || typeof registry !== 'object') {
    throw new CoverageRegistryError('Registre : objet attendu')
  }
  if (registry.schemaVersion !== 1) {
    throw new CoverageRegistryError(`Registre : schemaVersion invalide (${registry.schemaVersion})`)
  }
  if (!Array.isArray(registry.sources)) {
    throw new CoverageRegistryError('Registre : sources doit être un tableau')
  }

  const seen = new Set()
  registry.sources.forEach((source, index) => {
    const where = source?.id ? `Source ${source.id}` : `Source #${index}`
    if (!asNonEmptyString(source?.id)) {
      throw new CoverageRegistryError(`${where} : id manquant`)
    }
    if (seen.has(source.id)) {
      throw new CoverageRegistryError(`${where} : id dupliqué`)
    }
    seen.add(source.id)

    if (!REGION_BY_CODE.has(source.region)) {
      throw new CoverageRegistryError(`${where} : région inconnue (${source.region})`)
    }
    if (!Array.isArray(source.categories) || source.categories.length === 0) {
      throw new CoverageRegistryError(`${where} : categories manquant`)
    }
    for (const category of source.categories) {
      if (!STATUS_CATEGORIES.has(category)) {
        throw new CoverageRegistryError(`${where} : catégorie inconnue (${category})`)
      }
    }
    if (!Array.isArray(source.realms) || source.realms.length === 0) {
      throw new CoverageRegistryError(`${where} : realms manquant`)
    }
    for (const realm of source.realms) {
      if (!REALMS.has(realm)) {
        throw new CoverageRegistryError(`${where} : règne inconnu (${realm})`)
      }
    }
    if (!REGISTER_STATES.has(source.state)) {
      throw new CoverageRegistryError(`${where} : état non reconnu (${source.state})`)
    }
    if (source.resources !== undefined && !Array.isArray(source.resources)) {
      throw new CoverageRegistryError(`${where} : resources doit être un tableau`)
    }
    for (const resource of source.resources ?? []) {
      if (!resource || typeof resource !== 'object') {
        throw new CoverageRegistryError(`${where} : ressource mal formée`)
      }
      if (resource.realm !== undefined && !REALMS.has(resource.realm)) {
        throw new CoverageRegistryError(`${where} : règne de ressource inconnu (${resource.realm})`)
      }
      if (resource.groups !== undefined && !Array.isArray(resource.groups)) {
        throw new CoverageRegistryError(`${where} : groups doit être un tableau`)
      }
    }
  })

  return registry
}

function resourceGroups(resource) {
  if (Array.isArray(resource.groups) && resource.groups.length) {
    return resource.groups.map((group) => asNonEmptyString(group)).filter(Boolean)
  }
  const single = asNonEmptyString(resource.group)
  return single ? [single] : []
}

function resourceRealms(resource, sourceRealms) {
  if (resource.realm) {
    return sourceRealms.includes(resource.realm) ? [resource.realm] : []
  }
  return sourceRealms
}

function regionalTuples(source) {
  const resources = source.resources?.length ? source.resources : [{}]
  const collected = new Map()

  for (const category of source.categories) {
    for (const resource of resources) {
      const realms = resourceRealms(resource, source.realms)
      const groups = resourceGroups(resource)
      const version = asNonEmptyString(resource.version)
      const pipelineId = asNonEmptyString(resource.pipelineId)
      const groupKeys = groups.length ? groups : [null]
      for (const realm of realms) {
        for (const group of groupKeys) {
          const key = `${realm}|${category}|${group ?? ''}`
          if (!collected.has(key)) {
            collected.set(key, {
              realm,
              category,
              group,
              versions: new Set(),
              // source.id = preuve source-wide si cet id est dans le manifeste.
              candidateDatasetIds: new Set([source.id]),
            })
          }
          const item = collected.get(key)
          item.versions.add(version)
          // pipelineId = preuve limitée aux tuples issus de CETTE ressource.
          if (pipelineId) item.candidateDatasetIds.add(pipelineId)
        }
      }
    }
  }

  return [...collected.values()].map((item) => {
    const versions = [...item.versions]
    return {
      realm: item.realm,
      category: item.category,
      group: item.group,
      version: versions.length === 1 ? versions[0] : null,
      candidateDatasetIds: [...item.candidateDatasetIds].sort(),
    }
  })
}

function datasetEvidenceFor(candidateIds, manifestSourceIds) {
  if (!manifestSourceIds) {
    return { datasetEvidence: 'unknown', matchedDatasetSourceIds: [] }
  }
  const matchedDatasetSourceIds = candidateIds.filter((id) => manifestSourceIds.has(id)).sort()
  if (matchedDatasetSourceIds.length) {
    return { datasetEvidence: 'present', matchedDatasetSourceIds }
  }
  return { datasetEvidence: 'unknown', matchedDatasetSourceIds: [] }
}

function compareNullable(left, right) {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  return String(left).localeCompare(String(right), 'fr')
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    return (
      left.region.localeCompare(right.region, 'fr') ||
      left.layer.localeCompare(right.layer, 'fr') ||
      left.realm.localeCompare(right.realm, 'fr') ||
      left.role.localeCompare(right.role, 'fr') ||
      compareNullable(left.category, right.category) ||
      compareNullable(left.group, right.group) ||
      left.sourceId.localeCompare(right.sourceId, 'fr') ||
      compareNullable(left.version, right.version)
    )
  })
}

function nationalEntries(manifestSourceIds) {
  const entries = []
  for (const region of REGIONS) {
    for (const realm of ['fauna', 'flora']) {
      for (const source of NATIONAL_SOURCES) {
        const evidence = datasetEvidenceFor([source.id], manifestSourceIds)
        entries.push({
          layer: 'national',
          role: source.role,
          region: region.code,
          realm,
          category: null,
          group: null,
          sourceId: source.id,
          sourceState: 'IMPORTED',
          version: source.version,
          publicationPolicy: null,
          declaration: 'declared',
          datasetEvidence: evidence.datasetEvidence,
          matchedDatasetSourceIds: evidence.matchedDatasetSourceIds,
        })
      }
    }
  }
  return entries
}

function regionalEntries(sources, manifestSourceIds) {
  const entries = []
  for (const source of sources) {
    for (const tuple of regionalTuples(source)) {
      const evidence = datasetEvidenceFor(tuple.candidateDatasetIds, manifestSourceIds)
      entries.push({
        layer: 'regional',
        role: 'regional_enrichment',
        region: source.region,
        realm: tuple.realm,
        category: tuple.category,
        group: tuple.group,
        sourceId: source.id,
        sourceState: source.state,
        version: tuple.version,
        publicationPolicy: asNonEmptyString(source.publicationPolicy),
        declaration: 'declared',
        datasetEvidence: evidence.datasetEvidence,
        matchedDatasetSourceIds: evidence.matchedDatasetSourceIds,
      })
    }
  }
  return entries
}

function readManifestSourceIds(manifest) {
  if (!manifest) return null
  if (manifest.schemaVersion !== 3) {
    throw new CoverageRegistryError(`Manifeste : schemaVersion invalide (${manifest.schemaVersion})`)
  }
  if (!Array.isArray(manifest.sources)) {
    throw new CoverageRegistryError('Manifeste : sources doit être un tableau')
  }
  return new Set(manifest.sources.map((source) => source.id).filter(Boolean))
}

/**
 * Construit la matrice de couverture.
 * `declaration` vient uniquement du registre (+ socle national injecté).
 * `datasetEvidence` n’est `present` que sur une correspondance d’identifiant explicite.
 */
export function buildCoverage(registry, manifest = null) {
  validateReadySourcesRegistry(registry)
  const manifestSourceIds = readManifestSourceIds(manifest)
  const entries = sortEntries([
    ...nationalEntries(manifestSourceIds),
    ...regionalEntries(registry.sources, manifestSourceIds),
  ])

  return {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    kind: 'source-coverage',
    disclaimer: COVERAGE_DISCLAIMER,
    registry: {
      schemaVersion: registry.schemaVersion,
      checkedAt: asNonEmptyString(registry.checkedAt),
      sourceCount: registry.sources.length,
    },
    dataset: manifest
      ? {
          schemaVersion: manifest.schemaVersion,
          datasetVersion: asNonEmptyString(manifest.datasetVersion),
          generatedAt: asNonEmptyString(manifest.generatedAt),
          taxrefVersion: asNonEmptyString(manifest.taxrefVersion),
          bdcVersion: asNonEmptyString(manifest.bdcVersion),
        }
      : null,
    regions: REGIONS.map(({ code, name }) => ({ code, name })),
    entries,
  }
}

export function serializeCoverageJson(coverage) {
  return `${JSON.stringify(coverage, null, 2)}\n`
}

function cell(value) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value).replace(/\|/g, '/')
}

function categoryLabel(category) {
  if (!category) return '—'
  return CATEGORY_LABELS[category] ?? category
}

function datasetLabel(evidence) {
  if (evidence === 'present') return 'présent'
  return 'inconnu'
}

function stateLabel(state) {
  if (state === 'WITNESS') return 'WITNESS (non publiable)'
  return state
}

function roleLabel(role) {
  if (role === 'taxonomy') return 'Taxonomie'
  if (role === 'national_statuses') return 'Statuts nationaux'
  return 'Enrichissement régional'
}

export function renderCoverageMarkdown(coverage) {
  const lines = [
    '# Couverture des sources',
    '',
    COVERAGE_DISCLAIMER,
    '',
    'Fichier généré. Ne pas éditer à la main. Source : `data-pipeline/regions/ready-sources.json`.',
    '',
    `- Registre vérifié le : ${coverage.registry.checkedAt ?? '—'}`,
    `- Sources régionales déclarées : ${coverage.registry.sourceCount}`,
    coverage.dataset
      ? `- Preuves dataset : manifeste ${coverage.dataset.datasetVersion ?? '—'} (TAXREF ${coverage.dataset.taxrefVersion ?? '—'} / BDC ${coverage.dataset.bdcVersion ?? '—'})`
      : '- Preuves dataset : absentes (génération registre seul ; `datasetEvidence` = inconnu sauf correspondance exacte si un manifeste est fourni)',
    '',
    'Les identifiants du registre sont souvent des identifiants « parapluie ». Une preuve `présent` n’est posée que si un identifiant candidat figure tel quel dans le manifeste : `source.id` vaut pour tous les tuples de la source ; un `pipelineId` de ressource ne vaut que pour les tuples issus de cette ressource.',
    '',
  ]

  for (const region of coverage.regions) {
    const national = coverage.entries.filter((entry) => entry.region === region.code && entry.layer === 'national')
    const regional = coverage.entries.filter((entry) => entry.region === region.code && entry.layer === 'regional')

    lines.push(`## ${region.name} (\`${region.code}\`)`, '')
    lines.push('### Socle national', '')
    lines.push('| Règne | Rôle | Source | Version | État | Dataset |')
    lines.push('|---|---|---|---|---|---|')
    for (const entry of national) {
      lines.push(
        `| ${entry.realm} | ${roleLabel(entry.role)} | \`${entry.sourceId}\` | ${cell(entry.version)} | ${stateLabel(entry.sourceState)} | ${datasetLabel(entry.datasetEvidence)} |`,
      )
    }
    lines.push('', '### Enrichissement régional', '')

    if (!regional.length) {
      lines.push('Aucun enrichissement régional déclaré dans le registre pour cette région.', '')
      continue
    }

    lines.push('| Règne | Catégorie | Groupe | Source | Version | État | Dataset |')
    lines.push('|---|---|---|---|---|---|---|')
    for (const entry of regional) {
      lines.push(
        `| ${entry.realm} | ${categoryLabel(entry.category)} | ${cell(entry.group)} | \`${entry.sourceId}\` | ${cell(entry.version)} | ${stateLabel(entry.sourceState)} | ${datasetLabel(entry.datasetEvidence)} |`,
      )
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}
