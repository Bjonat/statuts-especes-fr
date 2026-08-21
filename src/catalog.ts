import { DEMO_DATA_WARNING, regions, sources, statuses, taxa } from './demo'
import type { Catalog } from './types'

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
    const url = new URL('data/catalog.json', document.baseURI)
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) return demoCatalog

    const data: unknown = await response.json()
    return isCatalog(data) ? data : demoCatalog
  } catch {
    return demoCatalog
  }
}
