import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { createHash } from 'node:crypto'
import { createOfflineDataManager } from './offline-data'
import { loadDataStore } from './catalog'
import {
  ACTIVE_MANIFEST_PATH,
  LEGACY_CATALOG_CACHE,
  LEGACY_MANIFEST_CACHE,
  METADATA_CACHE_NAME,
  PREVIOUS_MANIFEST_PATH,
  checkForUpdate,
  cleanupObsoleteCatalogCaches,
  commitActivation,
  datasetCacheName,
  prepareAndActivateCandidate,
  readActiveManifest,
  readPreviousManifest,
  requiredUpdateFiles,
  writeActiveManifest,
} from './dataset-storage'
import { verifyDatasetBuffer } from './manifest'
import type { DataManifest, DatasetFile } from './types'
import { METROPOLITAN_REGION_CODES } from './types'

const baseURI = 'https://example.test/tools/statuts/'
const EMPTY_JSON = '[]'
const OTHER_JSON = '[0]'
const EMPTY_HASH = createHash('sha256').update(EMPTY_JSON).digest('hex').slice(0, 12)

function hashJson(json: string): string {
  return createHash('sha256').update(json).digest('hex').slice(0, 12)
}

function hashedFile(stem: string, json: string, count: number): DatasetFile {
  return {
    file: `${stem}-${hashJson(json)}.json`,
    count,
    bytes: new TextEncoder().encode(json).byteLength,
  }
}

function bytesOf(json: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(json)
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
}

function makeManifest(version: string, generatedAt: string, json: string, count: number): DataManifest {
  const regions = METROPOLITAN_REGION_CODES.map((code) => ({ code, name: code }))
  return {
    schemaVersion: 3,
    official: true,
    generatedAt,
    datasetVersion: version,
    taxrefVersion: '18',
    bdcVersion: '18',
    regions,
    sources: [],
    files: {
      taxa: { flora: hashedFile('taxa-flora', json, count), fauna: hashedFile('taxa-fauna', json, count) },
      statusDefinitions: hashedFile('status-definitions', json, count),
      statusLinks: Object.fromEntries(
        ['flora', 'fauna'].map((realm) => [
          realm,
          Object.fromEntries(
            regions.map(({ code }) => [code, hashedFile(`status-links-${realm}-${code.toLowerCase()}`, json, count)]),
          ),
        ]),
      ),
    },
  } as unknown as DataManifest
}

const manifestA = makeManifest('version-a', '2026-09-09T10:00:00.000Z', EMPTY_JSON, 0)
const manifestB = makeManifest('version-b', '2026-09-10T10:00:00.000Z', OTHER_JSON, 1)
const manifestC = makeManifest('version-c', '2026-09-11T10:00:00.000Z', '[1]', 1)

type FakeCache = {
  entries: Map<string, Response>
  match: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

function createFakeCache(initial?: Map<string, Response>): FakeCache {
  const entries = initial ?? new Map<string, Response>()
  return {
    entries,
    match: vi.fn(async (url: string) => entries.get(String(url))?.clone()),
    put: vi.fn(async (url: string, response: Response) => {
      entries.set(String(url), response.clone())
    }),
    delete: vi.fn(async (url: string) => entries.delete(String(url))),
  }
}

describe('dataset storage', () => {
  let stores: Map<string, FakeCache>
  let network: { onLine: boolean }
  let fetchMock: ReturnType<typeof vi.fn>
  let payloads: Map<string, string>

  function urlFor(fileName: string): string {
    return new URL(`data/${fileName}`, baseURI).href
  }

  function seedVersion(manifest: DataManifest, json: string, files?: DatasetFile[]): void {
    const cache = openVersion(manifest.datasetVersion)
    for (const file of files ?? [
      manifest.files.taxa.flora,
      manifest.files.taxa.fauna,
      manifest.files.statusDefinitions,
      ...METROPOLITAN_REGION_CODES.flatMap((region) => [
        manifest.files.statusLinks.flora[region],
        manifest.files.statusLinks.fauna[region],
      ]),
    ]) {
      cache.entries.set(urlFor(file.file), new Response(json, { headers: { 'Content-Type': 'application/json' } }))
    }
  }

  function openVersion(version: string): FakeCache {
    const name = datasetCacheName(version)
    if (!stores.has(name)) stores.set(name, createFakeCache())
    return stores.get(name)!
  }

  function metadata(): FakeCache {
    if (!stores.has(METADATA_CACHE_NAME)) stores.set(METADATA_CACHE_NAME, createFakeCache())
    return stores.get(METADATA_CACHE_NAME)!
  }

  beforeEach(() => {
    stores = new Map()
    network = { onLine: true }
    payloads = new Map()
    vi.stubGlobal('document', { baseURI })
    vi.stubGlobal('navigator', network)
    vi.stubGlobal('window', { caches: {} })
    vi.stubGlobal('caches', {
      open: vi.fn(async (name: string) => {
        if (!stores.has(name)) stores.set(name, createFakeCache())
        return stores.get(name)!
      }),
      keys: async () => [...stores.keys()],
      delete: vi.fn(async (name: string) => stores.delete(name)),
    })
    fetchMock = vi.fn(async (url: URL | string) => {
      const href = String(url)
      if (href.endsWith('manifest.json')) {
        const body = payloads.get('manifest')
        if (!body) throw new TypeError('Failed to fetch')
        return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      const fileName = href.split('/').pop() ?? ''
      const body = payloads.get(fileName)
      if (body === undefined) throw new TypeError('Failed to fetch')
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  async function persistActive(manifest: DataManifest): Promise<void> {
    expect(await writeActiveManifest(manifest)).toBe(true)
  }

  it('loads the persisted active manifest offline without fetching it', async () => {
    await persistActive(manifestA)
    seedVersion(manifestA, EMPTY_JSON, [
      ...[manifestA.files.taxa.flora, manifestA.files.taxa.fauna, manifestA.files.statusDefinitions],
      manifestA.files.statusLinks.flora.OCC,
      manifestA.files.statusLinks.fauna.OCC,
    ])
    network.onLine = false
    const result = await loadDataStore()
    expect(result.state).toBe('available')
    if (result.state !== 'available') throw new Error('expected available')
    expect(result.store.datasetVersion).toBe('version-a')
    expect(fetchMock).not.toHaveBeenCalled()
    const inventory = await result.store.offline!.inspect()
    expect(inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(true)
  })

  it('registers a valid remote manifest as the first active version', async () => {
    payloads.set('manifest', JSON.stringify(manifestA))
    const result = await loadDataStore()
    expect(result.state).toBe('available')
    if (result.state !== 'available') throw new Error('expected available')
    expect(result.store.datasetVersion).toBe('version-a')
    const active = await readActiveManifest()
    expect(active?.datasetVersion).toBe('version-a')
  })

  it('migrates a legacy PWA-02 manifest while offline', async () => {
    const legacyManifest = createFakeCache()
    legacyManifest.entries.set(
      urlFor('manifest.json'),
      new Response(JSON.stringify(manifestA), { headers: { 'Content-Type': 'application/json' } }),
    )
    stores.set(LEGACY_MANIFEST_CACHE, legacyManifest)
    network.onLine = false
    const result = await loadDataStore()
    expect(result.state).toBe('available')
    if (result.state !== 'available') throw new Error('expected available')
    expect(result.store.datasetVersion).toBe('version-a')
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await readActiveManifest())?.datasetVersion).toBe('version-a')
  })

  it('migrates a partial legacy OCC cache into the versioned cache without fetching', async () => {
    const legacyManifest = createFakeCache()
    legacyManifest.entries.set(urlFor('manifest.json'), Response.json(manifestA))
    stores.set(LEGACY_MANIFEST_CACHE, legacyManifest)
    const legacyCatalog = createFakeCache()
    const occFiles = [
      manifestA.files.taxa.flora,
      manifestA.files.taxa.fauna,
      manifestA.files.statusDefinitions,
      manifestA.files.statusLinks.flora.OCC,
      manifestA.files.statusLinks.fauna.OCC,
    ]
    for (const file of occFiles) {
      legacyCatalog.entries.set(urlFor(file.file), new Response(EMPTY_JSON))
    }
    stores.set(LEGACY_CATALOG_CACHE, legacyCatalog)
    network.onLine = false
    const result = await loadDataStore()
    expect(result.state).toBe('available')
    if (result.state !== 'available') throw new Error('expected available')
    const inventory = await result.store.offline!.inspect()
    expect(inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(true)
    expect(inventory.readyRegionCount).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
    const versioned = openVersion(manifestA.datasetVersion)
    for (const file of occFiles) {
      expect(versioned.entries.has(urlFor(file.file))).toBe(true)
    }
  })

  it('migrates a complete 29-file legacy cache to 13/13 ready regions without redownload', async () => {
    const legacyManifest = createFakeCache()
    legacyManifest.entries.set(urlFor('manifest.json'), Response.json(manifestA))
    stores.set(LEGACY_MANIFEST_CACHE, legacyManifest)
    const legacyCatalog = createFakeCache()
    const allFiles = [
      manifestA.files.taxa.flora,
      manifestA.files.taxa.fauna,
      manifestA.files.statusDefinitions,
      ...METROPOLITAN_REGION_CODES.flatMap((region) => [
        manifestA.files.statusLinks.flora[region],
        manifestA.files.statusLinks.fauna[region],
      ]),
    ]
    for (const file of allFiles) {
      legacyCatalog.entries.set(urlFor(file.file), new Response(EMPTY_JSON))
    }
    stores.set(LEGACY_CATALOG_CACHE, legacyCatalog)
    network.onLine = false
    const result = await loadDataStore()
    expect(result.state).toBe('available')
    if (result.state !== 'available') throw new Error('expected available')
    const inventory = await result.store.offline!.inspect()
    expect(inventory.readyRegionCount).toBe(13)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports up_to_date when the remote version matches active', async () => {
    await persistActive(manifestA)
    payloads.set('manifest', JSON.stringify(manifestA))
    const result = await checkForUpdate(manifestA)
    expect(result.status).toBe('up_to_date')
    expect((await readActiveManifest())?.datasetVersion).toBe('version-a')
  })

  it('reports update_available without changing the active manifest', async () => {
    await persistActive(manifestA)
    payloads.set('manifest', JSON.stringify(manifestB))
    const result = await checkForUpdate(manifestA)
    expect(result.status).toBe('update_available')
    expect(result.remote?.datasetVersion).toBe('version-b')
    expect((await readActiveManifest())?.datasetVersion).toBe('version-a')
    expect(fetchMock.mock.calls.every((call) => String(call[0]).endsWith('manifest.json'))).toBe(true)
  })

  it('keeps the active version when the remote manifest is unavailable', async () => {
    await persistActive(manifestA)
    const result = await checkForUpdate(manifestA)
    expect(result.status).toBe('unavailable')
    expect((await readActiveManifest())?.datasetVersion).toBe('version-a')
  })

  it('keeps the active version when the remote manifest is invalid', async () => {
    await persistActive(manifestA)
    payloads.set('manifest', JSON.stringify({ schemaVersion: 2 }))
    const result = await checkForUpdate(manifestA)
    expect(result.status).toBe('invalid')
    expect((await readActiveManifest())?.datasetVersion).toBe('version-a')
  })

  it('does not present a older remote as a normal update', async () => {
    await persistActive(manifestB)
    payloads.set('manifest', JSON.stringify(manifestA))
    const result = await checkForUpdate(manifestB)
    expect(result.status).toBe('remote_older')
    expect((await readActiveManifest())?.datasetVersion).toBe('version-b')
  })

  it('stages five files for OCC-only protection and seven for OCC+NAQ', () => {
    expect(requiredUpdateFiles(manifestB, ['OCC'])).toHaveLength(5)
    expect(requiredUpdateFiles(manifestB, ['OCC', 'NAQ'])).toHaveLength(7)
    expect(requiredUpdateFiles(manifestB, [])).toHaveLength(0)
  })

  it('maps distinct accepted datasetVersion values to distinct cache names', () => {
    const versions = [
      'version-a',
      'version-b',
      'version-c',
      '35647eeda4b2',
      'current',
      'a.b',
      'a_b',
      'a-b',
      'x'.repeat(80),
      `${'x'.repeat(79)}y`,
    ]
    const names = versions.map((version) => datasetCacheName(version))
    expect(new Set(names).size).toBe(versions.length)
    expect(datasetCacheName('version-a')).toBe('statuts-data-catalogs-v-version-a')
    expect(datasetCacheName('35647eeda4b2')).toBe('statuts-data-catalogs-v-35647eeda4b2')
    expect(() => datasetCacheName('a/b')).toThrow(/datasetVersion invalide/)
    expect(() => datasetCacheName('')).toThrow(/datasetVersion invalide/)
    expect(() => datasetCacheName('x'.repeat(81))).toThrow(/datasetVersion invalide/)
  })

  it('interrupts a candidate after two files and leaves active A intact', async () => {
    await persistActive(manifestA)
    seedVersion(manifestA, EMPTY_JSON, [
      manifestA.files.taxa.flora,
      manifestA.files.taxa.fauna,
      manifestA.files.statusDefinitions,
      manifestA.files.statusLinks.flora.OCC,
      manifestA.files.statusLinks.fauna.OCC,
    ])
    payloads.set('manifest', JSON.stringify(manifestB))
    for (const file of requiredUpdateFiles(manifestB, ['OCC'])) {
      payloads.set(file.file, OTHER_JSON)
    }
    const controller = new AbortController()
    await expect(
      prepareAndActivateCandidate(manifestA, manifestB, ['OCC'], {
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.completedFiles >= 2) controller.abort()
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect((await readActiveManifest())?.datasetVersion).toBe('version-a')
    expect(await readPreviousManifest()).toBeNull()
    const occA = await createOfflineDataManager(manifestA).inspect()
    expect(occA.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(true)
    expect(openVersion(manifestB.datasetVersion).entries.size).toBe(2)
  })

  it('aborts at completedFiles === totalFiles before writing active B', async () => {
    await persistActive(manifestA)
    seedVersion(manifestA, EMPTY_JSON, [
      manifestA.files.taxa.flora,
      manifestA.files.taxa.fauna,
      manifestA.files.statusDefinitions,
      manifestA.files.statusLinks.flora.OCC,
      manifestA.files.statusLinks.fauna.OCC,
    ])
    for (const file of requiredUpdateFiles(manifestB, ['OCC'])) {
      payloads.set(file.file, OTHER_JSON)
    }
    const metadataPuts: Array<{ url: string; datasetVersion: string }> = []
    const meta = metadata()
    meta.put.mockImplementation(async (url: string, response: Response) => {
      const body = JSON.parse(await response.clone().text()) as { datasetVersion?: string }
      metadataPuts.push({ url: String(url), datasetVersion: String(body.datasetVersion ?? '') })
      meta.entries.set(String(url), response.clone())
    })
    const controller = new AbortController()
    await expect(
      prepareAndActivateCandidate(manifestA, manifestB, ['OCC'], {
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.completedFiles === progress.totalFiles) controller.abort()
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    const activeUrl = new URL(ACTIVE_MANIFEST_PATH, baseURI).href
    expect(metadataPuts.some((entry) => entry.url === activeUrl && entry.datasetVersion === 'version-b')).toBe(false)
    expect((await readActiveManifest())?.datasetVersion).toBe('version-a')
    expect(await readPreviousManifest()).toBeNull()
    const occA = await createOfflineDataManager(manifestA).inspect()
    expect(occA.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(true)
    expect(openVersion(manifestA.datasetVersion).entries.size).toBe(5)
    expect(openVersion(manifestB.datasetVersion).entries.size).toBe(5)
  })

  it('reloads the active A inventory after an interrupted candidate', async () => {
    await persistActive(manifestA)
    seedVersion(manifestA, EMPTY_JSON, [
      manifestA.files.taxa.flora,
      manifestA.files.taxa.fauna,
      manifestA.files.statusDefinitions,
      manifestA.files.statusLinks.flora.OCC,
      manifestA.files.statusLinks.fauna.OCC,
    ])
    openVersion(manifestB.datasetVersion).entries.set(
      urlFor(manifestB.files.taxa.flora.file),
      new Response(OTHER_JSON),
    )
    network.onLine = false
    const result = await loadDataStore()
    expect(result.state).toBe('available')
    if (result.state !== 'available') throw new Error('expected available')
    expect(result.store.datasetVersion).toBe('version-a')
    expect((await result.store.offline!.inspect()).regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(true)
  })

  it('resumes a candidate by skipping already valid staged files', async () => {
    await persistActive(manifestA)
    const required = requiredUpdateFiles(manifestB, ['OCC'])
    const cacheB = openVersion(manifestB.datasetVersion)
    cacheB.entries.set(urlFor(required[0].file), new Response(OTHER_JSON))
    cacheB.entries.set(urlFor(required[1].file), new Response(OTHER_JSON))
    for (const file of required) payloads.set(file.file, OTHER_JSON)
    await prepareAndActivateCandidate(manifestA, manifestB, ['OCC'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((await readActiveManifest())?.datasetVersion).toBe('version-b')
    expect((await readPreviousManifest())?.datasetVersion).toBe('version-a')
  })

  it('refuses a corrupt candidate file and keeps A active', async () => {
    await persistActive(manifestA)
    seedVersion(manifestA, EMPTY_JSON, [
      manifestA.files.taxa.flora,
      manifestA.files.taxa.fauna,
      manifestA.files.statusDefinitions,
      manifestA.files.statusLinks.flora.OCC,
      manifestA.files.statusLinks.fauna.OCC,
    ])
    const required = requiredUpdateFiles(manifestB, ['OCC'])
    for (const file of required) payloads.set(file.file, OTHER_JSON)
    payloads.set(required[0].file, '{"nope":true}')
    await expect(prepareAndActivateCandidate(manifestA, manifestB, ['OCC'])).rejects.toMatchObject({
      reason: 'integrity',
    })
    expect((await readActiveManifest())?.datasetVersion).toBe('version-a')
    expect(await readPreviousManifest()).toBeNull()
    const occA = await createOfflineDataManager(manifestA).inspect()
    expect(occA.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(true)
  })

  it('activates B after a complete candidate and keeps cache A', async () => {
    await persistActive(manifestA)
    seedVersion(manifestA, EMPTY_JSON, [
      manifestA.files.taxa.flora,
      manifestA.files.taxa.fauna,
      manifestA.files.statusDefinitions,
      manifestA.files.statusLinks.flora.OCC,
      manifestA.files.statusLinks.fauna.OCC,
    ])
    for (const file of requiredUpdateFiles(manifestB, ['OCC'])) payloads.set(file.file, OTHER_JSON)
    await prepareAndActivateCandidate(manifestA, manifestB, ['OCC'])
    expect((await readActiveManifest())?.datasetVersion).toBe('version-b')
    expect((await readPreviousManifest())?.datasetVersion).toBe('version-a')
    expect(stores.has(datasetCacheName('version-a'))).toBe(true)
    expect(stores.has(datasetCacheName('version-b'))).toBe(true)
    const occB = await createOfflineDataManager(manifestB).inspect()
    expect(occB.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(true)
  })

  it('writes previous A before active B and never writes B before validation', async () => {
    await persistActive(manifestA)
    for (const file of requiredUpdateFiles(manifestB, [])) payloads.set(file.file, OTHER_JSON)
    const order: string[] = []
    const meta = metadata()
    meta.put.mockImplementation(async (url: string, response: Response) => {
      order.push(String(url))
      meta.entries.set(String(url), response.clone())
    })
    await prepareAndActivateCandidate(manifestA, manifestB, [])
    const previousUrl = new URL(PREVIOUS_MANIFEST_PATH, baseURI).href
    const activeUrl = new URL(ACTIVE_MANIFEST_PATH, baseURI).href
    expect(order.indexOf(previousUrl)).toBeGreaterThan(-1)
    expect(order.indexOf(activeUrl)).toBeGreaterThan(order.indexOf(previousUrl))
  })

  it('does not activate B when writing previous fails', async () => {
    await persistActive(manifestA)
    openVersion(manifestA.datasetVersion)
    const meta = metadata()
    meta.put.mockImplementation(async (url: string, response: Response) => {
      if (String(url).includes('previous')) throw new Error('previous put failed')
      meta.entries.set(String(url), response.clone())
    })
    await expect(prepareAndActivateCandidate(manifestA, manifestB, [])).rejects.toMatchObject({ reason: 'storage' })
    expect((await readActiveManifest())?.datasetVersion).toBe('version-a')
    expect(stores.has(datasetCacheName('version-a'))).toBe(true)
  })

  it('does not activate B when writing active fails', async () => {
    await persistActive(manifestA)
    openVersion(manifestA.datasetVersion)
    const meta = metadata()
    meta.put.mockImplementation(async (url: string, response: Response) => {
      if (String(url).includes('active')) throw new Error('active put failed')
      meta.entries.set(String(url), response.clone())
    })
    await expect(prepareAndActivateCandidate(manifestA, manifestB, [])).rejects.toMatchObject({ reason: 'storage' })
    expect((await readActiveManifest())?.datasetVersion).toBe('version-a')
    expect(stores.has(datasetCacheName('version-a'))).toBe(true)
  })

  it('cleans obsolete versioned caches after a successful activation', async () => {
    stores.set(datasetCacheName('version-a'), createFakeCache())
    stores.set(datasetCacheName('version-b'), createFakeCache())
    stores.set(datasetCacheName('version-c'), createFakeCache())
    await persistActive(manifestB)
    await commitActivation(manifestB, manifestC)
    await cleanupObsoleteCatalogCaches(manifestC.datasetVersion, manifestB.datasetVersion)
    expect(stores.has(datasetCacheName('version-a'))).toBe(false)
    expect(stores.has(datasetCacheName('version-b'))).toBe(true)
    expect(stores.has(datasetCacheName('version-c'))).toBe(true)
  })

  it('does not treat a candidate cache as the active inventory', async () => {
    await persistActive(manifestA)
    seedVersion(manifestB, OTHER_JSON, requiredUpdateFiles(manifestB, ['OCC']))
    const inventory = await createOfflineDataManager(manifestA).inspect()
    expect(inventory.readyRegionCount).toBe(0)
    expect(inventory.datasetVersion).toBe('version-a')
  })
})

describe('dataset file verification', () => {
  const validJson = '[{"ok":true}]'
  const validFile = hashedFile('taxa-flora', validJson, 1)

  it('accepts a matching SHA-256 suffix', async () => {
    await expect(verifyDatasetBuffer(bytesOf(validJson), validFile)).resolves.toEqual([
      { ok: true },
    ])
  })

  it('rejects a SHA-256 mismatch', async () => {
    const file = { ...validFile, file: `taxa-flora-${EMPTY_HASH}.json` }
    await expect(verifyDatasetBuffer(bytesOf(validJson), file)).rejects.toMatchObject({
      reason: 'integrity',
    })
  })

  it('accepts an exact byte length', async () => {
    await expect(
      verifyDatasetBuffer(bytesOf(validJson), {
        ...validFile,
        bytes: new TextEncoder().encode(validJson).byteLength,
      }),
    ).resolves.toHaveLength(1)
  })

  it('rejects an incorrect byte length', async () => {
    await expect(
      verifyDatasetBuffer(bytesOf(validJson), { ...validFile, bytes: 1 }),
    ).rejects.toMatchObject({ reason: 'integrity' })
  })

  it('rejects invalid JSON', async () => {
    const json = '{not json'
    const file = hashedFile('taxa-flora', json, 0)
    await expect(verifyDatasetBuffer(bytesOf(json), file)).rejects.toMatchObject({
      reason: 'integrity',
    })
  })

  it('rejects a JSON object instead of an array', async () => {
    const json = '{"nope":true}'
    const file = hashedFile('taxa-flora', json, 0)
    await expect(verifyDatasetBuffer(bytesOf(json), file)).rejects.toMatchObject({
      reason: 'integrity',
    })
  })

  it('rejects an incorrect count', async () => {
    await expect(
      verifyDatasetBuffer(bytesOf(validJson), { ...validFile, count: 4 }),
    ).rejects.toMatchObject({ reason: 'integrity' })
  })
})
