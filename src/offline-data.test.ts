import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  catalogFileUrl,
  createOfflineDataManager,
  allRegionalDatasetFiles,
  regionDatasetFiles,
  sharedDatasetFiles,
} from './offline-data'
import type { DataManifest } from './types'
import { METROPOLITAN_REGION_CODES } from './types'

const regions = METROPOLITAN_REGION_CODES.map((code) => ({ code, name: code }))
const file = (name: string, bytes = 8) => ({ file: `${name}-abcdef.json`, count: 1, bytes })
const manifest = {
  schemaVersion: 3 as const,
  official: true as const,
  generatedAt: '2026-09-08',
  datasetVersion: 'current',
  taxrefVersion: '18',
  bdcVersion: '18',
  regions,
  sources: [],
  files: {
    taxa: { flora: file('taxa-flora', 100), fauna: file('taxa-fauna', 200) },
    statusDefinitions: file('status-definitions', 50),
    statusLinks: Object.fromEntries(
      ['flora', 'fauna'].map((realm) => [
        realm,
        Object.fromEntries(regions.map(({ code }) => [code, file(`status-links-${realm}-${code.toLowerCase()}`, 10)])),
      ]),
    ),
  },
} as unknown as DataManifest

const baseURI = 'https://example.test/tools/statuts/'
const urlFor = (name: string) => catalogFileUrl(name, baseURI)

function allFiles(): string[] {
  return [
    ...sharedDatasetFiles(manifest).map((item) => item.file),
    ...METROPOLITAN_REGION_CODES.flatMap((region) => regionDatasetFiles(manifest, region).map((item) => item.file)),
  ]
}

describe('offline data manager', () => {
  let entries: Map<string, Response>
  let cache: { match: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
  let network: { onLine: boolean }
  let fetchMock: ReturnType<typeof vi.fn>

  function seedFiles(names: string[]): void {
    for (const name of names) entries.set(urlFor(name), Response.json([]))
  }

  beforeEach(() => {
    entries = new Map()
    cache = {
      match: vi.fn(async (url: string) => entries.get(url)?.clone()),
      put: vi.fn(async (url: string, response: Response) => {
        entries.set(url, response)
      }),
      delete: vi.fn(async (url: string) => entries.delete(url)),
    }
    network = { onLine: true }
    vi.stubGlobal('document', { baseURI })
    vi.stubGlobal('navigator', network)
    vi.stubGlobal('window', { caches: {} })
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) })
    fetchMock = vi.fn(async (url: URL | string) => {
      const href = String(url)
      if (href.includes('HEAD') || (typeof url === 'object' && 'method' in url)) {
        throw new Error('HEAD must not be used')
      }
      return new Response('[]', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('reports an empty inventory without fetching', async () => {
    const inventory = await createOfflineDataManager(manifest).inspect()
    expect(inventory.shared.availability).toBe('missing')
    expect(inventory.shared.cachedFiles).toBe(0)
    expect(inventory.shared.totalFiles).toBe(3)
    expect(inventory.regions).toHaveLength(13)
    expect(inventory.regions.every((region) => region.availability === 'missing')).toBe(true)
    expect(inventory.regions.every((region) => region.consultableOffline === false)).toBe(true)
    expect(inventory.readyRegionCount).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('recognizes a complete #40 cache as 13 ready regions without fetching', async () => {
    seedFiles(allFiles())
    const inventory = await createOfflineDataManager(manifest).inspect()
    expect(inventory.shared.availability).toBe('ready')
    expect(inventory.readyRegionCount).toBe(13)
    expect(inventory.regions.every((region) => region.consultableOffline)).toBe(true)
    expect(inventory.regions.every((region) => region.availability === 'ready')).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cache.match).toHaveBeenCalledTimes(29)
  })

  it('marks only OCC ready when shared + OCC links are cached', async () => {
    seedFiles([
      ...sharedDatasetFiles(manifest).map((item) => item.file),
      ...regionDatasetFiles(manifest, 'OCC').map((item) => item.file),
    ])
    const inventory = await createOfflineDataManager(manifest).inspect()
    expect(inventory.shared.availability).toBe('ready')
    expect(inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(true)
    expect(inventory.regions.filter((region) => region.region !== 'OCC').every((region) => region.availability === 'missing')).toBe(true)
    expect(inventory.readyRegionCount).toBe(1)
  })

  it('does not mark all regions partial just because the shared base is cached', async () => {
    seedFiles(sharedDatasetFiles(manifest).map((item) => item.file))
    const inventory = await createOfflineDataManager(manifest).inspect()
    expect(inventory.shared.availability).toBe('ready')
    expect(inventory.regions.every((region) => region.availability === 'missing')).toBe(true)
    expect(inventory.readyRegionCount).toBe(0)
  })

  it('marks a region partial when one of two regional files is cached', async () => {
    seedFiles([
      ...sharedDatasetFiles(manifest).map((item) => item.file),
      regionDatasetFiles(manifest, 'OCC')[0].file,
    ])
    const occ = (await createOfflineDataManager(manifest).inspect()).regions.find((region) => region.region === 'OCC')
    expect(occ?.availability).toBe('partial')
    expect(occ?.consultableOffline).toBe(false)
    expect(occ?.cachedFiles).toBe(1)
  })

  it('marks OCC not consultable when both regional files exist but shared is incomplete', async () => {
    seedFiles([
      manifest.files.taxa.flora.file,
      ...regionDatasetFiles(manifest, 'OCC').map((item) => item.file),
    ])
    const inventory = await createOfflineDataManager(manifest).inspect()
    const occ = inventory.regions.find((region) => region.region === 'OCC')
    expect(inventory.shared.availability).toBe('partial')
    expect(occ?.availability).toBe('partial')
    expect(occ?.consultableOffline).toBe(false)
    expect(occ?.cachedFiles).toBe(2)
  })

  it('downloads 5 files when preparing the first region on an empty cache', async () => {
    const progress: Array<{ completedFiles: number; totalFiles: number }> = []
    const result = await createOfflineDataManager(manifest).prepareRegion('OCC', {
      onProgress: (update) => progress.push({ completedFiles: update.completedFiles, totalFiles: update.totalFiles }),
    })
    expect(result.outcome).toBe('complete')
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(cache.put).toHaveBeenCalledTimes(5)
    expect(result.inventory.readyRegionCount).toBe(1)
    expect(result.inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(true)
    expect(progress.at(-1)).toEqual({ completedFiles: 5, totalFiles: 5 })
  })

  it('downloads only the two regional files when preparing a second region', async () => {
    seedFiles([
      ...sharedDatasetFiles(manifest).map((item) => item.file),
      ...regionDatasetFiles(manifest, 'OCC').map((item) => item.file),
    ])
    const result = await createOfflineDataManager(manifest).prepareRegion('NAQ')
    expect(result.outcome).toBe('complete')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(cache.put).toHaveBeenCalledTimes(2)
    expect(result.inventory.readyRegionCount).toBe(2)
  })

  it('skips files already in cache and never re-fetches them', async () => {
    seedFiles(allFiles())
    const result = await createOfflineDataManager(manifest).prepareRegion('OCC')
    expect(result.outcome).toBe('complete')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('keeps completed files after a user abort and does not mark the region ready', async () => {
    const controller = new AbortController()
    const result = await createOfflineDataManager(manifest).prepareRegion('OCC', {
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.completedFiles >= 2) controller.abort()
      },
    })
    expect(result.outcome).toBe('cancelled')
    expect(result.inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(false)
    expect(entries.size).toBe(2)
  })

  it('resumes by fetching only the remaining files', async () => {
    const firstTwo = [
      ...sharedDatasetFiles(manifest).slice(0, 2).map((item) => item.file),
    ]
    seedFiles(firstTwo)
    const result = await createOfflineDataManager(manifest).prepareRegion('OCC')
    expect(result.outcome).toBe('complete')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(true)
  })

  it('keeps completed files after an HTTP error', async () => {
    let downloads = 0
    fetchMock.mockImplementation(async () => {
      downloads += 1
      if (downloads === 3) return new Response('', { status: 503 })
      return new Response('[]', { status: 200 })
    })
    const result = await createOfflineDataManager(manifest).prepareRegion('OCC')
    expect(result.outcome).toBe('failed')
    if (result.outcome !== 'failed') throw new Error('expected failed')
    expect(result.reason).toBe('http')
    expect(entries.size).toBe(2)
    expect(result.inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(false)
  })

  it('keeps completed files after a quota error and does not mark the region ready', async () => {
    let puts = 0
    cache.put.mockImplementation(async (url: string, response: Response) => {
      puts += 1
      if (puts === 3) throw new DOMException('quota', 'QuotaExceededError')
      entries.set(url, response)
    })
    const result = await createOfflineDataManager(manifest).prepareRegion('OCC')
    expect(result.outcome).toBe('failed')
    if (result.outcome !== 'failed') throw new Error('expected failed')
    expect(result.reason).toBe('storage')
    expect(entries.size).toBe(2)
    expect(result.inventory.regions.find((region) => region.region === 'OCC')?.consultableOffline).toBe(false)
  })

  it('does not treat an explicit prepare as blocked by saveData', async () => {
    vi.stubGlobal('navigator', { onLine: true, connection: { saveData: true } })
    const result = await createOfflineDataManager(manifest).prepareRegion('OCC')
    expect(result.outcome).toBe('complete')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('removes only the two current-manifest regional URLs and keeps the shared base', async () => {
    seedFiles([
      ...sharedDatasetFiles(manifest).map((item) => item.file),
      ...regionDatasetFiles(manifest, 'OCC').map((item) => item.file),
      ...regionDatasetFiles(manifest, 'NAQ').map((item) => item.file),
    ])
    const result = await createOfflineDataManager(manifest).removeRegion('OCC')
    expect(result.inventory.regions.find((region) => region.region === 'OCC')?.availability).toBe('missing')
    expect(result.inventory.regions.find((region) => region.region === 'NAQ')?.consultableOffline).toBe(true)
    expect(result.inventory.shared.availability).toBe('ready')
    expect(cache.delete.mock.calls.map((call) => call[0]).sort()).toEqual(
      regionDatasetFiles(manifest, 'OCC').map((item) => urlFor(item.file)).sort(),
    )
    expect(cache.delete.mock.calls.every((call) => typeof call[0] === 'string')).toBe(true)
    expect(cache.delete.mock.calls.some((call) => String(call[0]).includes('*'))).toBe(false)
  })

  it('removes the shared base after the last regional files of the current manifest', async () => {
    seedFiles([
      ...sharedDatasetFiles(manifest).map((item) => item.file),
      ...regionDatasetFiles(manifest, 'OCC').map((item) => item.file),
    ])
    const result = await createOfflineDataManager(manifest).removeRegion('OCC')
    expect(result.inventory.shared.availability).toBe('missing')
    expect(result.inventory.readyRegionCount).toBe(0)
    const deleted = cache.delete.mock.calls.map((call) => call[0])
    for (const file of [...regionDatasetFiles(manifest, 'OCC'), ...sharedDatasetFiles(manifest)]) {
      expect(deleted).toContain(urlFor(file.file))
    }
  })

  it('keeps the shared base if cache.match fails before another region is proven present', async () => {
    seedFiles([
      ...sharedDatasetFiles(manifest).map((item) => item.file),
      ...regionDatasetFiles(manifest, 'OCC').map((item) => item.file),
      ...regionDatasetFiles(manifest, 'NAQ').map((item) => item.file),
    ])
    const occUrls = new Set(regionDatasetFiles(manifest, 'OCC').map((item) => urlFor(item.file)))
    cache.match.mockImplementation(async (url: string) => {
      if (!occUrls.has(url) && allRegionalDatasetFiles(manifest).some((item) => urlFor(item.file) === url)) {
        throw new Error('cache match failed')
      }
      return entries.get(url)?.clone()
    })
    await createOfflineDataManager(manifest).removeRegion('OCC')
    const deleted = cache.delete.mock.calls.map((call) => String(call[0]))
    for (const file of sharedDatasetFiles(manifest)) {
      expect(deleted).not.toContain(urlFor(file.file))
      expect(entries.has(urlFor(file.file))).toBe(true)
    }
  })

  it('keeps the shared base if deleting a regional file throws', async () => {
    seedFiles([
      ...sharedDatasetFiles(manifest).map((item) => item.file),
      ...regionDatasetFiles(manifest, 'OCC').map((item) => item.file),
    ])
    cache.delete.mockImplementation(async (url: string) => {
      if (regionDatasetFiles(manifest, 'OCC').some((item) => urlFor(item.file) === url)) {
        throw new Error('cache delete failed')
      }
      entries.delete(url)
    })
    await createOfflineDataManager(manifest).removeRegion('OCC')
    const deleted = cache.delete.mock.calls.map((call) => String(call[0]))
    for (const file of sharedDatasetFiles(manifest)) {
      expect(deleted).not.toContain(urlFor(file.file))
      expect(entries.has(urlFor(file.file))).toBe(true)
    }
  })

  it('never reports a ready region when Cache Storage is unavailable', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('caches', undefined)
    const inventory = await createOfflineDataManager(manifest).inspect()
    expect(inventory.storageAvailable).toBe(false)
    expect(inventory.readyRegionCount).toBe(0)
    expect(inventory.regions.every((region) => !region.consultableOffline)).toBe(true)
  })

  it('never issues a HEAD request to estimate volumes', async () => {
    seedFiles(allFiles())
    await createOfflineDataManager(manifest).inspect()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(/HEAD/)
  })
})
