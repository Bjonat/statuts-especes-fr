import {
  DatasetIntegrityError,
  catalogFileUrl,
  openDatasetCache,
  putVerifiedDatasetFile,
  regionDatasetFiles,
  sharedDatasetFiles,
  allRegionalDatasetFiles,
} from './dataset-storage'
import { METROPOLITAN_REGION_CODES } from './types'
import type { DataManifest, DatasetFile, RegionCode } from './types'

export { catalogFileUrl, sharedDatasetFiles, regionDatasetFiles, allRegionalDatasetFiles }
export { LEGACY_CATALOG_CACHE as OFFLINE_CATALOG_CACHE } from './dataset-storage'

export type OfflineAvailability = 'ready' | 'partial' | 'missing'

export type OfflinePrepareFailureReason = 'offline' | 'network' | 'http' | 'storage' | 'integrity'

export interface OfflineSharedStatus {
  availability: OfflineAvailability
  cachedFiles: number
  totalFiles: number
  bytesTotal?: number
  bytesCached?: number
}

export interface OfflineRegionStatus {
  region: RegionCode
  availability: OfflineAvailability
  consultableOffline: boolean
  cachedFiles: number
  totalFiles: number
  bytesTotal?: number
  bytesCached?: number
  bytesRemaining?: number
}

export interface OfflineInventory {
  datasetVersion: string
  storageAvailable: boolean
  shared: OfflineSharedStatus
  regions: OfflineRegionStatus[]
  readyRegionCount: number
}

export interface OfflineDownloadProgress {
  region: RegionCode
  completedFiles: number
  totalFiles: number
  bytesCompleted?: number
  bytesTotal?: number
}

export type OfflinePrepareResult =
  | { outcome: 'complete'; inventory: OfflineInventory }
  | { outcome: 'cancelled'; inventory: OfflineInventory }
  | { outcome: 'failed'; reason: OfflinePrepareFailureReason; inventory: OfflineInventory }

export interface OfflineRemoveResult {
  inventory: OfflineInventory
}

export interface OfflineDataManager {
  inspect(): Promise<OfflineInventory>
  prepareRegion(
    region: RegionCode,
    options?: {
      signal?: AbortSignal
      onProgress?: (progress: OfflineDownloadProgress) => void
    },
  ): Promise<OfflinePrepareResult>
  removeRegion(region: RegionCode): Promise<OfflineRemoveResult>
}

function sumKnownBytes(files: DatasetFile[]): number | undefined {
  if (files.some((file) => typeof file.bytes !== 'number')) return undefined
  return files.reduce((total, file) => total + (file.bytes ?? 0), 0)
}

function availabilityFor(cached: number, total: number): OfflineAvailability {
  if (cached <= 0) return 'missing'
  if (cached >= total) return 'ready'
  return 'partial'
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function isQuotaError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'QuotaExceededError') ||
    (error instanceof Error && error.name === 'QuotaExceededError')
  )
}

function emptyInventory(manifest: DataManifest, storageAvailable: boolean): OfflineInventory {
  return {
    datasetVersion: manifest.datasetVersion,
    storageAvailable,
    shared: {
      availability: 'missing',
      cachedFiles: 0,
      totalFiles: 3,
    },
    regions: METROPOLITAN_REGION_CODES.map((region) => ({
      region,
      availability: 'missing' as const,
      consultableOffline: false,
      cachedFiles: 0,
      totalFiles: 2,
    })),
    readyRegionCount: 0,
  }
}

async function cachedFileSet(cache: Cache, files: DatasetFile[]): Promise<Set<string>> {
  const present = new Set<string>()
  for (const file of files) {
    const url = catalogFileUrl(file.file)
    try {
      if (await cache.match(url)) present.add(file.file)
    } catch {
      throw new Error('cache_match_failed')
    }
  }
  return present
}

function buildInventory(manifest: DataManifest, present: Set<string>): OfflineInventory {
  const sharedFiles = sharedDatasetFiles(manifest)
  const sharedCachedFiles = sharedFiles.filter((file) => present.has(file.file))
  const sharedReady = sharedCachedFiles.length === sharedFiles.length
  const sharedBytesTotal = sumKnownBytes(sharedFiles)
  const sharedBytesCached = sumKnownBytes(sharedCachedFiles)

  const regions: OfflineRegionStatus[] = METROPOLITAN_REGION_CODES.map((region) => {
    const files = regionDatasetFiles(manifest, region)
    const cached = files.filter((file) => present.has(file.file))
    const cachedFiles = cached.length
    const regionalReady = cachedFiles === files.length
    let availability: OfflineAvailability
    if (cachedFiles === 0) availability = 'missing'
    else if (regionalReady && sharedReady) availability = 'ready'
    else availability = 'partial'

    const bytesTotal = sumKnownBytes(files)
    const bytesCached = sumKnownBytes(cached)
    const missing = files.filter((file) => !present.has(file.file))
    const bytesRemaining = sumKnownBytes(missing)

    return {
      region,
      availability,
      consultableOffline: sharedReady && regionalReady,
      cachedFiles,
      totalFiles: files.length,
      ...(bytesTotal !== undefined ? { bytesTotal } : {}),
      ...(bytesCached !== undefined ? { bytesCached } : {}),
      ...(bytesRemaining !== undefined ? { bytesRemaining } : {}),
    }
  })

  return {
    datasetVersion: manifest.datasetVersion,
    storageAvailable: true,
    shared: {
      availability: availabilityFor(sharedCachedFiles.length, sharedFiles.length),
      cachedFiles: sharedCachedFiles.length,
      totalFiles: sharedFiles.length,
      ...(sharedBytesTotal !== undefined ? { bytesTotal: sharedBytesTotal } : {}),
      ...(sharedBytesCached !== undefined ? { bytesCached: sharedBytesCached } : {}),
    },
    regions,
    readyRegionCount: regions.filter((region) => region.consultableOffline).length,
  }
}

async function inspectManifest(manifest: DataManifest): Promise<OfflineInventory> {
  const cache = await openDatasetCache(manifest.datasetVersion)
  if (!cache) return emptyInventory(manifest, false)

  try {
    const present = await cachedFileSet(cache, [
      ...sharedDatasetFiles(manifest),
      ...allRegionalDatasetFiles(manifest),
    ])
    return buildInventory(manifest, present)
  } catch {
    return emptyInventory(manifest, false)
  }
}

function requiredFilesForRegion(manifest: DataManifest, region: RegionCode): DatasetFile[] {
  return [...sharedDatasetFiles(manifest), ...regionDatasetFiles(manifest, region)]
}

export function createOfflineDataManager(manifest: DataManifest): OfflineDataManager {
  let preparing = false

  async function inspect(): Promise<OfflineInventory> {
    return inspectManifest(manifest)
  }

  async function prepareRegion(
    region: RegionCode,
    options?: {
      signal?: AbortSignal
      onProgress?: (progress: OfflineDownloadProgress) => void
    },
  ): Promise<OfflinePrepareResult> {
    if (preparing) {
      return { outcome: 'cancelled', inventory: await inspect() }
    }
    preparing = true

    const cancelledResult = async (): Promise<OfflinePrepareResult> => ({
      outcome: 'cancelled',
      inventory: await inspect(),
    })

    try {
      if (options?.signal?.aborted) return cancelledResult()

      const cache = await openDatasetCache(manifest.datasetVersion)
      if (!cache) {
        return { outcome: 'failed', reason: 'storage', inventory: await inspect() }
      }

      const required = requiredFilesForRegion(manifest, region)
      let present: Set<string>
      try {
        present = await cachedFileSet(cache, required)
      } catch {
        return { outcome: 'failed', reason: 'storage', inventory: emptyInventory(manifest, false) }
      }

      const missing = required.filter((file) => !present.has(file.file))
      const emit = (completedFiles: number) => {
        const completed = missing.filter((file) => present.has(file.file))
        const bytesCompleted = sumKnownBytes(completed)
        const bytesTotal = sumKnownBytes(missing)
        options?.onProgress?.({
          region,
          completedFiles,
          totalFiles: missing.length,
          ...(bytesCompleted !== undefined ? { bytesCompleted } : {}),
          ...(bytesTotal !== undefined ? { bytesTotal } : {}),
        })
      }

      emit(0)

      for (const file of missing) {
        if (options?.signal?.aborted) return cancelledResult()

        const url = catalogFileUrl(file.file)
        if (await cache.match(url)) {
          present.add(file.file)
          emit(missing.filter((item) => present.has(item.file)).length)
          continue
        }

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return { outcome: 'failed', reason: 'offline', inventory: await inspect() }
        }

        let response: Response
        try {
          response = await fetch(url, { cache: 'no-store', signal: options?.signal })
        } catch (error) {
          if (isAbortError(error) || options?.signal?.aborted) return cancelledResult()
          const offline = typeof navigator !== 'undefined' && navigator.onLine === false
          return { outcome: 'failed', reason: offline ? 'offline' : 'network', inventory: await inspect() }
        }

        if (options?.signal?.aborted) return cancelledResult()
        if (!response.ok) {
          return { outcome: 'failed', reason: 'http', inventory: await inspect() }
        }

        let buffer: ArrayBuffer
        try {
          buffer = await response.arrayBuffer()
        } catch (error) {
          if (isAbortError(error) || options?.signal?.aborted) return cancelledResult()
          return { outcome: 'failed', reason: 'network', inventory: await inspect() }
        }

        try {
          await putVerifiedDatasetFile(cache, file, buffer)
        } catch (error) {
          if (error instanceof DatasetIntegrityError) {
            return { outcome: 'failed', reason: 'integrity', inventory: await inspect() }
          }
          if (isQuotaError(error)) {
            return { outcome: 'failed', reason: 'storage', inventory: await inspect() }
          }
          return { outcome: 'failed', reason: 'storage', inventory: await inspect() }
        }

        present.add(file.file)
        emit(missing.filter((item) => present.has(item.file)).length)
      }

      const inventory = await inspect()
      const regionStatus = inventory.regions.find((item) => item.region === region)
      if (!regionStatus?.consultableOffline) {
        return { outcome: 'failed', reason: 'storage', inventory }
      }
      return { outcome: 'complete', inventory }
    } finally {
      preparing = false
    }
  }

  async function removeRegion(region: RegionCode): Promise<OfflineRemoveResult> {
    const cache = await openDatasetCache(manifest.datasetVersion)
    if (!cache) {
      return { inventory: emptyInventory(manifest, false) }
    }

    // Shared cleanup is fail-safe and limited to this active versioned cache.
    let sharedCleanupSafe = true

    for (const file of regionDatasetFiles(manifest, region)) {
      try {
        await cache.delete(catalogFileUrl(file.file))
      } catch {
        sharedCleanupSafe = false
      }
    }

    let remainingRegional = false
    if (sharedCleanupSafe) {
      for (const file of allRegionalDatasetFiles(manifest)) {
        try {
          if (await cache.match(catalogFileUrl(file.file))) {
            remainingRegional = true
            break
          }
        } catch {
          sharedCleanupSafe = false
          break
        }
      }
    }

    if (sharedCleanupSafe && !remainingRegional) {
      for (const file of sharedDatasetFiles(manifest)) {
        try {
          await cache.delete(catalogFileUrl(file.file))
        } catch {
          // Keep going; inspect() reports whatever is actually left.
        }
      }
    }

    return { inventory: await inspect() }
  }

  return { inspect, prepareRegion, removeRegion }
}
