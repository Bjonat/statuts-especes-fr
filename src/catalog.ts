import { DEMO_DATA_WARNING, regions as demoRegions, sources as demoSources, statuses as demoStatuses, taxa as demoTaxa } from './demo'
import {
  bootstrapActiveManifest,
  createDatasetUpdateManager,
  installFirstActiveManifest,
  loadDatasetArray,
  tryFetchRemoteManifest,
} from './dataset-storage'
import type { DatasetUpdateManager } from './dataset-storage'
import { createOfflineDataManager } from './offline-data'
import type { OfflineDataManager } from './offline-data'
import { collectSourceIdsFromLinks, hydrateStatusLinks } from './status-data'
import type {
  DataManifest,
  Realm,
  Region,
  RegionCode,
  SourceDataset,
  StatusDefinition,
  StatusLink,
  Taxon,
  TaxonStatus,
} from './types'

const NATIONAL_SOURCE_IDS = new Set(['taxref-v18', 'bdc-v18'])

export { isCoverageDatasetFile, isDataManifest, isDatasetFile, parseDataManifest } from './manifest'

export interface DataStore {
  official: boolean
  warning?: string
  generatedAt: string
  datasetVersion: string
  regions: Region[]
  sources: SourceDataset[]
  loadTaxa(realm: Realm): Promise<Taxon[]>
  loadStatuses(realm: Realm, region: RegionCode): Promise<TaxonStatus[]>
  /** Socle national + sources citées dans les statuts flore/faune de la région. */
  listSourcesForRegion(region: RegionCode): Promise<SourceDataset[]>
  /** Gestionnaire hors ligne du jeu officiel. Null en démonstration. */
  offline: OfflineDataManager | null
  /** Mises à jour atomiques du jeu officiel. Null en démonstration. */
  updates: DatasetUpdateManager | null
}

function sortSources(sources: SourceDataset[]): SourceDataset[] {
  return [...sources].sort((left, right) => {
    const leftNational = NATIONAL_SOURCE_IDS.has(left.id) ? 0 : 1
    const rightNational = NATIONAL_SOURCE_IDS.has(right.id) ? 0 : 1
    if (leftNational !== rightNational) return leftNational - rightNational
    return left.name.localeCompare(right.name, 'fr')
  })
}

export type DataLoadFailureReason = 'offline_without_data' | 'manifest_unavailable' | 'manifest_invalid'

export type DataStoreLoadResult =
  | { state: 'available'; store: DataStore }
  | { state: 'download_required'; reason: Extract<DataLoadFailureReason, 'offline_without_data'> }
  | { state: 'recoverable_error'; reason: Exclude<DataLoadFailureReason, 'offline_without_data'> }

/** Seule voie runtime vers les fixtures. Ne pas appeler depuis loadDataStore(). */
export function createDemoDataStore(): DataStore {
  return {
    official: false,
    warning: DEMO_DATA_WARNING,
    generatedAt: '2026-08-21T00:00:00.000Z',
    datasetVersion: 'demo',
    regions: demoRegions,
    sources: demoSources,
    async loadTaxa(realm) {
      return demoTaxa.filter((taxon) => taxon.realm === realm)
    },
    async loadStatuses(realm, region) {
      const refs = new Set(demoTaxa.filter((taxon) => taxon.realm === realm).map((taxon) => taxon.cdRef))
      return demoStatuses.filter((status) => status.region === region && refs.has(status.cdRef))
    },
    async listSourcesForRegion(region) {
      const used = new Set(
        demoStatuses.filter((status) => status.region === region).map((status) => status.sourceId),
      )
      for (const id of NATIONAL_SOURCE_IDS) used.add(id)
      return sortSources(demoSources.filter((source) => used.has(source.id)))
    },
    offline: null,
    updates: null,
  }
}

export function createOfficialStore(manifest: DataManifest): DataStore {
  const taxaCache = new Map<Realm, Taxon[]>()
  const statusCache = new Map<string, TaxonStatus[]>()
  let definitionsPromise: Promise<StatusDefinition[]> | null = null
  const offline = createOfflineDataManager(manifest)
  const updates = createDatasetUpdateManager(
    () => manifest,
    async () => {
      const inventory = await offline.inspect()
      return inventory.regions
        .filter((region) => region.consultableOffline)
        .map((region) => region.region)
    },
  )

  function loadDefinitions(): Promise<StatusDefinition[]> {
    definitionsPromise ??= loadDatasetArray<StatusDefinition>(manifest, manifest.files.statusDefinitions)
    return definitionsPromise
  }

  async function loadTaxa(realm: Realm): Promise<Taxon[]> {
    const cached = taxaCache.get(realm)
    if (cached) return cached
    const rows = await loadDatasetArray<Taxon>(manifest, manifest.files.taxa[realm])
    taxaCache.set(realm, rows)
    return rows
  }

  async function loadStatuses(realm: Realm, region: RegionCode): Promise<TaxonStatus[]> {
    const key = `${realm}:${region}`
    const cached = statusCache.get(key)
    if (cached) return cached

    const [definitions, links] = await Promise.all([
      loadDefinitions(),
      loadDatasetArray<StatusLink>(manifest, manifest.files.statusLinks[realm][region]),
    ])
    const rows = hydrateStatusLinks(definitions, links, region)
    statusCache.set(key, rows)
    return rows
  }

  const sourceListCache = new Map<RegionCode, SourceDataset[]>()

  async function listSourcesForRegion(region: RegionCode): Promise<SourceDataset[]> {
    const cached = sourceListCache.get(region)
    if (cached) return cached

    const [definitions, floraLinks, faunaLinks] = await Promise.all([
      loadDefinitions(),
      loadDatasetArray<StatusLink>(manifest, manifest.files.statusLinks.flora[region]),
      loadDatasetArray<StatusLink>(manifest, manifest.files.statusLinks.fauna[region]),
    ])
    const used = new Set([
      ...collectSourceIdsFromLinks(definitions, floraLinks),
      ...collectSourceIdsFromLinks(definitions, faunaLinks),
      ...NATIONAL_SOURCE_IDS,
    ])
    const rows = sortSources(manifest.sources.filter((source) => used.has(source.id)))
    sourceListCache.set(region, rows)
    return rows
  }

  return {
    official: true,
    generatedAt: manifest.generatedAt,
    datasetVersion: manifest.datasetVersion,
    regions: manifest.regions,
    sources: manifest.sources,
    loadTaxa,
    loadStatuses,
    listSourcesForRegion,
    offline,
    updates,
  }
}

export async function loadOfficialStoreFromActive(): Promise<DataStore | null> {
  const active = await bootstrapActiveManifest()
  if (!active) return null
  return createOfficialStore(active)
}

/**
 * Charge uniquement le jeu officiel. Une panne ne produit jamais de store de démonstration.
 * La démo n’existe que via createDemoDataStore(), après un choix utilisateur.
 * Un manifeste actif local est ouvert sans fetch réseau.
 */
export async function loadDataStore(): Promise<DataStoreLoadResult> {
  const active = await bootstrapActiveManifest()
  if (active) {
    return { state: 'available', store: createOfficialStore(active) }
  }

  const remote = await tryFetchRemoteManifest()
  if (remote.ok) {
    await installFirstActiveManifest(remote.manifest)
    return { state: 'available', store: createOfficialStore(remote.manifest) }
  }

  if (remote.reason === 'invalid') {
    return { state: 'recoverable_error', reason: 'manifest_invalid' }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { state: 'download_required', reason: 'offline_without_data' }
  }
  return { state: 'recoverable_error', reason: 'manifest_unavailable' }
}
