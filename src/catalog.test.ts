import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoDataStore, loadDataStore } from './catalog'
import { METROPOLITAN_REGION_CODES } from './types'

const regions = METROPOLITAN_REGION_CODES.map((code) => ({ code, name: code }))
const file = (name: string) => ({ file: `${name}-abcdef.json`, count: 0 })
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
  return result.store
}

describe('offline catalog readiness', () => {
  let entries: Map<string, Response>
  let cache: { match: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> }
  let network: { onLine: boolean; connection: { saveData: boolean } }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    entries = new Map(files.map((url) => [url, Response.json([])]))
    cache = {
      match: vi.fn(async (url: string) => entries.get(url)?.clone()),
      put: vi.fn(async (url: string, response: Response) => { entries.set(url, response) }),
    }
    network = { onLine: false, connection: { saveData: false } }
    const storage = new Map([['offlineDatasetVersion', manifest.datasetVersion]])
    vi.stubGlobal('document', { baseURI })
    vi.stubGlobal('navigator', network)
    vi.stubGlobal('window', { caches: {} })
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) })
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
    expect(store.official).toBe(true)
    expect(await store.primeOffline()).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('repairs the missing file online despite the old marker, respecting the subdirectory', async () => {
    const missing = files.at(-1)!
    entries.delete(missing)
    network.onLine = true
    const store = await loadOfficialStore()
    expect(await store.primeOffline()).toBe(true)
    expect(cache.put).toHaveBeenCalledTimes(1)
    expect(entries.has(missing)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('accepts a complete cache offline without any readiness marker', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    const store = await loadOfficialStore()
    expect(await store.primeOffline()).toBe(true)
    expect(cache.match).toHaveBeenCalledTimes(29)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('checks completeness even in save-data mode and does not download a missing file', async () => {
    network.onLine = true
    network.connection.saveData = true
    const store = await loadOfficialStore()
    expect(await store.primeOffline()).toBe(true)
    entries.delete(files[0])
    expect(await store.primeOffline()).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns false when Cache Storage is unavailable despite a readiness marker', async () => {
    vi.stubGlobal('window', {})
    const store = await loadOfficialStore()
    expect(await store.primeOffline()).toBe(false)
  })

  it('returns false if writing the missing file exceeds quota', async () => {
    network.onLine = true
    entries.delete(files[0])
    cache.put.mockRejectedValue(new DOMException('quota', 'QuotaExceededError'))
    const store = await loadOfficialStore()
    expect(await store.primeOffline()).toBe(false)
  })

  it('returns false on a network failure or HTTP error', async () => {
    network.onLine = true
    entries.delete(files[0])
    const store = await loadOfficialStore()
    fetchMock.mockRejectedValueOnce(new TypeError('network failure'))
    expect(await store.primeOffline()).toBe(false)
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
    expect(await store.primeOffline()).toBe(false)
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

  it('creates a demo store only through createDemoDataStore()', () => {
    const store = createDemoDataStore()
    expect(store.official).toBe(false)
    expect(store.datasetVersion).toBe('demo')
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
