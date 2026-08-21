import { DEMO_DATA_WARNING, regions as demoRegions, sources as demoSources, statuses as demoStatuses, taxa as demoTaxa } from './demo'
import { hydrateStatusLinks } from './status-data'
import { METROPOLITAN_REGION_CODES } from './types'
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

export interface DataStore {
  official: boolean
  warning?: string
  generatedAt: string
  datasetVersion: string
  regions: Region[]
  sources: SourceDataset[]
  loadTaxa(realm: Realm): Promise<Taxon[]>
  loadStatuses(realm: Realm, region: RegionCode): Promise<TaxonStatus[]>
  primeOffline(): Promise<boolean>
}

function isDatasetFile(value: unknown): value is { file: string; count: number } {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { file?: unknown; count?: unknown }
  return typeof candidate.file === 'string' && /^[a-z0-9-]+-[a-f0-9]+\.json$/i.test(candidate.file) && typeof candidate.count === 'number'
}

function isRegion(value: unknown): value is Region {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { code?: unknown; name?: unknown }
  return (
    typeof candidate.code === 'string' &&
    METROPOLITAN_REGION_CODES.includes(candidate.code as RegionCode) &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0
  )
}

function isManifest(value: unknown): value is DataManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DataManifest>
  if (
    candidate.schemaVersion !== 3 ||
    candidate.official !== true ||
    typeof candidate.generatedAt !== 'string' ||
    typeof candidate.datasetVersion !== 'string' ||
    !Array.isArray(candidate.regions) ||
    candidate.regions.length !== METROPOLITAN_REGION_CODES.length ||
    !candidate.regions.every(isRegion) ||
    !Array.isArray(candidate.sources) ||
    !candidate.files
  ) {
    return false
  }

  const regionSet = new Set(candidate.regions.map((region) => region.code))
  if (!METROPOLITAN_REGION_CODES.every((region) => regionSet.has(region))) return false

  const taxa = candidate.files.taxa
  const definitions = candidate.files.statusDefinitions
  const links = candidate.files.statusLinks
  if (
    !taxa ||
    !definitions ||
    !links ||
    !isDatasetFile(taxa.flora) ||
    !isDatasetFile(taxa.fauna) ||
    !isDatasetFile(definitions)
  ) {
    return false
  }

  return (['flora', 'fauna'] as Realm[]).every((realm) =>
    METROPOLITAN_REGION_CODES.every((region) => isDatasetFile(links[realm]?.[region])),
  )
}

async function fetchArray<T>(file: string): Promise<T[]> {
  const url = new URL(`data/${file}`, document.baseURI)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Jeu de données indisponible : ${file}`)
  const data: unknown = await response.json()
  if (!Array.isArray(data)) throw new Error(`Format de données invalide : ${file}`)
  return data as T[]
}

function createDemoStore(): DataStore {
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
    async primeOffline() {
      return true
    },
  }
}

function createOfficialStore(manifest: DataManifest): DataStore {
  const taxaCache = new Map<Realm, Taxon[]>()
  const statusCache = new Map<string, TaxonStatus[]>()
  let definitionsPromise: Promise<StatusDefinition[]> | null = null

  function loadDefinitions(): Promise<StatusDefinition[]> {
    definitionsPromise ??= fetchArray<StatusDefinition>(manifest.files.statusDefinitions.file)
    return definitionsPromise
  }

  async function loadTaxa(realm: Realm): Promise<Taxon[]> {
    const cached = taxaCache.get(realm)
    if (cached) return cached
    const rows = await fetchArray<Taxon>(manifest.files.taxa[realm].file)
    taxaCache.set(realm, rows)
    return rows
  }

  async function loadStatuses(realm: Realm, region: RegionCode): Promise<TaxonStatus[]> {
    const key = `${realm}:${region}`
    const cached = statusCache.get(key)
    if (cached) return cached

    const [definitions, links] = await Promise.all([
      loadDefinitions(),
      fetchArray<StatusLink>(manifest.files.statusLinks[realm][region].file),
    ])
    const rows = hydrateStatusLinks(definitions, links, region)
    statusCache.set(key, rows)
    return rows
  }

  async function primeOffline(): Promise<boolean> {
    if (localStorage.getItem('offlineDatasetVersion') === manifest.datasetVersion) return true
    if (!navigator.onLine || !('caches' in window)) return false

    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) return false

    const files = [
      manifest.files.taxa.flora.file,
      manifest.files.taxa.fauna.file,
      manifest.files.statusDefinitions.file,
      ...(['flora', 'fauna'] as Realm[]).flatMap((realm) =>
        METROPOLITAN_REGION_CODES.map((region) => manifest.files.statusLinks[realm][region].file),
      ),
    ]

    const cache = await caches.open('statuts-data-catalogs')
    for (const file of files) {
      const url = new URL(`data/${file}`, document.baseURI).toString()
      if (await cache.match(url)) continue
      const response = await fetch(url)
      if (!response.ok) return false
      await cache.put(url, response.clone())
    }

    localStorage.setItem('offlineDatasetVersion', manifest.datasetVersion)
    return true
  }

  return {
    official: true,
    generatedAt: manifest.generatedAt,
    datasetVersion: manifest.datasetVersion,
    regions: manifest.regions,
    sources: manifest.sources,
    loadTaxa,
    loadStatuses,
    primeOffline,
  }
}

export async function loadDataStore(): Promise<DataStore> {
  try {
    const manifestUrl = new URL('data/manifest.json', document.baseURI)
    const manifestResponse = await fetch(manifestUrl, { cache: 'no-cache' })
    if (!manifestResponse.ok) return createDemoStore()

    const manifestData: unknown = await manifestResponse.json()
    return isManifest(manifestData) ? createOfficialStore(manifestData) : createDemoStore()
  } catch {
    return createDemoStore()
  }
}
