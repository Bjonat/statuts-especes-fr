import { DEMO_DATA_WARNING, regions, sources, statuses, taxa } from './demo'
import type { Catalog } from './types'

interface DataManifest {
  schemaVersion: 1
  catalogFile: string
}

const demoCatalog: Catalog = {
  schemaVersion: 1,
  generatedAt: '2026-08-21T00:00:00.000Z',
  official: false,
  warning: DEMO_DATA_WARNING,
  regions,
  taxa,
  statuses,
  sources,
}

function isManifest(value: unknown): value is DataManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DataManifest>
  return candidate.schemaVersion === 1 && typeof candidate.catalogFile === 'string' && /^catalog-[a-f0-9]+\.json$/.test(candidate.catalogFile)
}

function isCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Catalog>
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.generatedAt === 'string' &&
    typeof candidate.official === 'boolean' &&
    Array.isArray(candidate.regions) &&
    Array.isArray(candidate.taxa) &&
    Array.isArray(candidate.statuses) &&
    Array.isArray(candidate.sources)
  )
}

export async function loadCatalog(): Promise<Catalog> {
  try {
    const manifestUrl = new URL('data/manifest.json', document.baseURI)
    const manifestResponse = await fetch(manifestUrl, { cache: 'no-cache' })
    if (!manifestResponse.ok) return demoCatalog

    const manifestData: unknown = await manifestResponse.json()
    if (!isManifest(manifestData)) return demoCatalog

    const catalogUrl = new URL(`data/${manifestData.catalogFile}`, document.baseURI)
    const catalogResponse = await fetch(catalogUrl)
    if (!catalogResponse.ok) return demoCatalog

    const catalogData: unknown = await catalogResponse.json()
    return isCatalog(catalogData) ? catalogData : demoCatalog
  } catch {
    return demoCatalog
  }
}
