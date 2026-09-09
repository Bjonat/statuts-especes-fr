import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { createHash } from 'node:crypto'
import { createDemoDataStore, loadDataStore } from './catalog'
import { METROPOLITAN_REGION_CODES } from './types'

const EMPTY_JSON = '[]'
const EMPTY_HASH = createHash('sha256').update(EMPTY_JSON).digest('hex').slice(0, 12)

const regions = METROPOLITAN_REGION_CODES.map((code) => ({ code, name: code }))
const file = (name: string, bytes?: number) =>
  bytes === undefined
    ? { file: `${name}-${EMPTY_HASH}.json`, count: 0 }
    : { file: `${name}-${EMPTY_HASH}.json`, count: 0, bytes }
const manifest = {
  schemaVersion: 3, official: true, generatedAt: '2026-09-08',
  datasetVersion: 'current', taxrefVersion: '18', bdcVersion: '18',
  regions, sources: [],
  files: {
    taxa: { flora: file('taxa-flora'), fauna: file('taxa-fauna') },
    statusDefinitions: file('status-definitions'),
    statusLinks: Object.fromEntries(['flora', 'fauna'].map((realm) => [
      realm, Object.fromEntries(regions.map(({ code }) => [code, file(`status-links-${realm}-${code.toLowerCase()}`)])),
    ])),
  },
}
const manifestWithBytes = {
  ...manifest,
  files: {
    taxa: { flora: file('taxa-flora', 10), fauna: file('taxa-fauna', 20) },
    statusDefinitions: file('status-definitions', 30),
    statusLinks: Object.fromEntries(['flora', 'fauna'].map((realm) => [
      realm, Object.fromEntries(regions.map(({ code }) => [code, file(`status-links-${realm}-${code.toLowerCase()}`, 4)])),
    ])),
  },
}
const baseURI = 'https://example.test/tools/statuts/'
const urlFor = (name: string) => new URL(`data/${name}`, baseURI).toString()
const files = [
  ...Object.values(manifest.files.taxa),
  manifest.files.statusDefinitions,
  ...Object.values(manifest.files.statusLinks).flatMap((links) => Object.values(links)),
].map(({ file }) => urlFor(file))

function expectNoDemoStore(result: Awaited<ReturnType<typeof loadDataStore>>): void {
  expect(result.state).not.toBe('available')
  expect(result).not.toHaveProperty('store')
}

async function loadOfficialStore() {
  const result = await loadDataStore()
  expect(result.state).toBe('available')
  if (result.state !== 'available') throw new Error('expected available official store')
  expect(result.store.official).toBe(true)
  expect(result.store.datasetVersion).not.toBe('demo')
  expect(result.store.offline).not.toBeNull()
  return result.store
}

describe('offline catalog readiness', () => {
  let entries: Map<string, Response>
  let cache: { match: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
  let network: { onLine: boolean; connection: { saveData: boolean } }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    entries = new Map(files.map((url) => [url, Response.json([])]))
    cache = {
      match: vi.fn(async (url: string) => entries.get(url)?.clone()),
      put: vi.fn(async (url: string, response: Response) => { entries.set(url, response) }),
      delete: vi.fn(async (url: string) => entries.delete(url)),
    }
    network = { onLine: false, connection: { saveData: false } }
    const storage = new Map([['offlineDatasetVersion', manifest.datasetVersion]])
    const metadataEntries = new Map<string, Response>()
    const metadataCache = {
      match: vi.fn(async (url: string) => metadataEntries.get(url)?.clone()),
      put: vi.fn(async (url: string, response: Response) => { metadataEntries.set(url, response) }),
      delete: vi.fn(async (url: string) => metadataEntries.delete(url)),
    }
    const emptyCache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => false),
    }
    vi.stubGlobal('document', { baseURI })
    vi.stubGlobal('navigator', network)
    vi.stubGlobal('window', { caches: {} })
    vi.stubGlobal('caches', {
      open: vi.fn(async (name: string) => {
        if (name.startsWith('statuts-data-catalogs-v-') || name === 'statuts-data-catalogs') return cache
        if (name === 'statuts-data-metadata') return metadataCache
        return emptyCache
      }),
      keys: async () => [],
      delete: async () => true,
    })
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
    })
    fetchMock = vi.fn(async (url: URL | string) => {
      if (String(url).endsWith('manifest.json')) return Response.json(manifest)
      if (!network.onLine) throw new TypeError('offline')
      return Response.json([])
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('rejects a stale readiness marker when one regional file was evicted', async () => {
    entries.delete(files.at(-1)!)
    const store = await loadOfficialStore()
    const inventory = await store.offline!.inspect()
    expect(inventory.readyRegionCount).toBe(12)
    const pac = inventory.regions.find((region) => region.region === 'PAC')
    expect(pac?.consultableOffline).toBe(false)
    expect(pac?.availability).toBe('partial')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('repairs the missing regional file online without re-fetching the rest', async () => {
    const missing = files.at(-1)!
    entries.delete(missing)
    network.onLine = true
    const store = await loadOfficialStore()
    const result = await store.offline!.prepareRegion('PAC')
    expect(result.outcome).toBe('complete')
    expect(result.inventory.regions.find((region) => region.region === 'PAC')?.consultableOffline).toBe(true)
    expect(cache.put).toHaveBeenCalledTimes(1)
    expect(entries.has(missing)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('accepts a complete cache offline without any readiness marker', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    const store = await loadOfficialStore()
    const inventory = await store.offline!.inspect()
    expect(inventory.shared.availability).toBe('ready')
    expect(inventory.readyRegionCount).toBe(13)
    expect(inventory.regions.every((region) => region.consultableOffline)).toBe(true)
    expect(cache.match).toHaveBeenCalledTimes(29)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('inspects completeness even in save-data mode and does not download during inspect', async () => {
    network.onLine = true
    network.connection.saveData = true
    const store = await loadOfficialStore()
    expect((await store.offline!.inspect()).readyRegionCount).toBe(13)
    entries.delete(files[0])
    expect((await store.offline!.inspect()).shared.availability).not.toBe('ready')
    expect((await store.offline!.inspect()).readyRegionCount).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns no ready region when Cache Storage is unavailable despite a readiness marker', async () => {
    vi.stubGlobal('window', {})
    const store = await loadOfficialStore()
    const inventory = await store.offline!.inspect()
    expect(inventory.storageAvailable).toBe(false)
    expect(inventory.readyRegionCount).toBe(0)
    expect(inventory.regions.every((region) => !region.consultableOffline)).toBe(true)
  })

  it('does not mark a region ready if writing the missing file exceeds quota', async () => {
    network.onLine = true
    entries.delete(files[0])
    cache.put.mockRejectedValue(new DOMException('quota', 'QuotaExceededError'))
    const store = await loadOfficialStore()
    const result = await store.offline!.prepareRegion('OCC')
    expect(result.outcome).toBe('failed')
    if (result.outcome !== 'failed') throw new Error('expected failed')
    expect(result.reason).toBe('storage')
    expect(result.inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(false)
  })

  it('does not mark a region ready on a network failure or HTTP error', async () => {
    network.onLine = true
    entries.delete(files[0])
    const store = await loadOfficialStore()
    fetchMock.mockRejectedValueOnce(new TypeError('network failure'))
    const networkResult = await store.offline!.prepareRegion('OCC')
    expect(networkResult.outcome).toBe('failed')
    if (networkResult.outcome !== 'failed') throw new Error('expected failed')
    expect(networkResult.reason).toBe('network')
    expect(networkResult.inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(false)

    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
    const httpResult = await store.offline!.prepareRegion('OCC')
    expect(httpResult.outcome).toBe('failed')
    if (httpResult.outcome !== 'failed') throw new Error('expected failed')
    expect(httpResult.reason).toBe('http')
    expect(httpResult.inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(false)
  })
})

describe('official catalog bootstrap', () => {
  let network: { onLine: boolean }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    network = { onLine: true }
    vi.stubGlobal('document', { baseURI })
    vi.stubGlobal('navigator', network)
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('loads a valid official manifest as available', async () => {
    fetchMock.mockResolvedValue(Response.json(manifest))
    const result = await loadDataStore()
    expect(result.state).toBe('available')
    if (result.state !== 'available') throw new Error('expected available')
    expect(result.store.official).toBe(true)
    expect(result.store.datasetVersion).toBe('current')
    expect(result.store.offline).not.toBeNull()
  })

  it('accepts a v3 manifest that includes optional bytes', async () => {
    fetchMock.mockResolvedValue(Response.json(manifestWithBytes))
    const result = await loadDataStore()
    expect(result.state).toBe('available')
  })

  it('accepts a legacy v3 manifest without bytes', async () => {
    fetchMock.mockResolvedValue(Response.json(manifest))
    const result = await loadDataStore()
    expect(result.state).toBe('available')
  })

  it('rejects negative bytes as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({
      ...manifest,
      files: { ...manifest.files, statusDefinitions: { ...manifest.files.statusDefinitions, bytes: -1 } },
    }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
    expectNoDemoStore(result)
  })

  it('rejects non-integer bytes as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({
      ...manifest,
      files: { ...manifest.files, taxa: { ...manifest.files.taxa, flora: { ...manifest.files.taxa.flora, bytes: 1.5 } } },
    }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
  })

  it('rejects non-numeric bytes as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({
      ...manifest,
      files: { ...manifest.files, taxa: { ...manifest.files.taxa, fauna: { ...manifest.files.taxa.fauna, bytes: '12' } } },
    }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
  })

  it('treats HTTP 503 as a recoverable error without creating a demo store', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_unavailable' })
    expectNoDemoStore(result)
  })

  it('treats a fetch throw while offline as download_required', async () => {
    network.onLine = false
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'download_required', reason: 'offline_without_data' })
    expectNoDemoStore(result)
  })

  it('treats a fetch throw while online as a recoverable error', async () => {
    network.onLine = true
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_unavailable' })
    expectNoDemoStore(result)
  })

  it('treats invalid JSON as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
    expectNoDemoStore(result)
  })

  it('treats a wrong schemaVersion as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...manifest, schemaVersion: 2 }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
    expectNoDemoStore(result)
  })

  it('treats a structurally incomplete manifest as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...manifest, files: { taxa: manifest.files.taxa } }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
    expectNoDemoStore(result)
  })

  it('rejects a negative count as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({
      ...manifest,
      files: { ...manifest.files, statusDefinitions: { ...manifest.files.statusDefinitions, count: -1 } },
    }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
    expectNoDemoStore(result)
  })

  it('rejects a non-integer count as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({
      ...manifest,
      files: { ...manifest.files, taxa: { ...manifest.files.taxa, flora: { ...manifest.files.taxa.flora, count: 1.5 } } },
    }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
  })

  it('rejects an unusable generatedAt as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...manifest, generatedAt: 'not-a-date' }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
    expectNoDemoStore(result)
  })

  it('accepts a DatasetFile whose SHA suffix is exactly 12 hex', async () => {
    fetchMock.mockResolvedValue(Response.json({
      ...manifest,
      files: {
        ...manifest.files,
        taxa: { ...manifest.files.taxa, flora: { file: 'taxa-flora-012345abcdef.json', count: 0 } },
      },
    }))
    const result = await loadDataStore()
    expect(result.state).toBe('available')
  })

  it('rejects a 1-hex DatasetFile suffix as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({
      ...manifest,
      files: {
        ...manifest.files,
        taxa: { ...manifest.files.taxa, flora: { file: 'taxa-flora-a.json', count: 0 } },
      },
    }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
    expectNoDemoStore(result)
  })

  it('rejects an 11-hex DatasetFile suffix as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({
      ...manifest,
      files: {
        ...manifest.files,
        taxa: { ...manifest.files.taxa, flora: { file: 'taxa-flora-012345abcde.json', count: 0 } },
      },
    }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
  })

  it('rejects a 13-hex DatasetFile suffix as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({
      ...manifest,
      files: {
        ...manifest.files,
        taxa: { ...manifest.files.taxa, flora: { file: 'taxa-flora-012345abcdef0.json', count: 0 } },
      },
    }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
  })

  it('rejects an empty datasetVersion as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...manifest, datasetVersion: '' }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
    expectNoDemoStore(result)
  })

  it('rejects a datasetVersion with a forbidden character as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...manifest, datasetVersion: 'a/b' }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
    expectNoDemoStore(result)
  })

  it('rejects a datasetVersion longer than 80 characters as manifest_invalid', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...manifest, datasetVersion: `${'x'.repeat(81)}` }))
    const result = await loadDataStore()
    expect(result).toEqual({ state: 'recoverable_error', reason: 'manifest_invalid' })
    expectNoDemoStore(result)
  })

  it('creates a demo store only through createDemoDataStore()', () => {
    const store = createDemoDataStore()
    expect(store.official).toBe(false)
    expect(store.datasetVersion).toBe('demo')
    expect(store.offline).toBeNull()
  })

  it('does not fall back to demo when official manifest loading fails', async () => {
    const failures: Array<{ name: string; setup: () => void }> = [
      {
        name: '503',
        setup: () => {
          network.onLine = true
          fetchMock.mockResolvedValue(new Response('', { status: 503 }))
        },
      },
      {
        name: 'throw online',
        setup: () => {
          network.onLine = true
          fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
        },
      },
      {
        name: 'throw offline',
        setup: () => {
          network.onLine = false
          fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
        },
      },
      {
        name: 'invalid json',
        setup: () => {
          fetchMock.mockResolvedValue(new Response('not json', { status: 200 }))
        },
      },
      {
        name: 'invalid schema',
        setup: () => {
          fetchMock.mockResolvedValue(Response.json({ ...manifest, schemaVersion: 2 }))
        },
      },
    ]

    for (const failure of failures) {
      failure.setup()
      const result = await loadDataStore()
      expectNoDemoStore(result)
      if (result.state === 'available') throw new Error(`${failure.name} opened official/demo data`)
    }
  })
})
