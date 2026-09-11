import {
  DatasetIntegrityError,
  isDatasetVersion,
  parseDataManifest,
  verifyDatasetBuffer,
} from './manifest'
import { METROPOLITAN_REGION_CODES } from './types'
import type { DataManifest, DatasetFile, RegionCode } from './types'

export { DatasetIntegrityError } from './manifest'

export const METADATA_CACHE_NAME = 'statuts-data-metadata'
export const LEGACY_MANIFEST_CACHE = 'statuts-data-manifest'
export const LEGACY_CATALOG_CACHE = 'statuts-data-catalogs'
export const DATASET_CACHE_PREFIX = 'statuts-data-catalogs-v-'

export const ACTIVE_MANIFEST_PATH = 'data/__active-manifest__'
export const PREVIOUS_MANIFEST_PATH = 'data/__previous-manifest__'

export type DatasetCheckStatus =
  | 'up_to_date'
  | 'update_available'
  | 'remote_older'
  | 'unavailable'
  | 'invalid'
  | 'storage_unavailable'

export type DatasetUpdateFailureReason =
  | 'network'
  | 'quota'
  | 'http'
  | 'aborted'
  | 'integrity'
  | 'storage'

export type DatasetUpdateProgress = {
  completedFiles: number
  totalFiles: number
  bytesCompleted: number
}

export function datasetCacheName(datasetVersion: string): string {
  if (!isDatasetVersion(datasetVersion)) {
    throw new Error(`datasetVersion invalide : ${datasetVersion}`)
  }
  return `${DATASET_CACHE_PREFIX}${datasetVersion}`
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

export function catalogFileUrl(file: string, baseURI = document.baseURI): string {
  return new URL(`data/${file}`, baseURI).toString()
}

export function sharedDatasetFiles(manifest: DataManifest): DatasetFile[] {
  const files = [manifest.files.taxa.flora, manifest.files.taxa.fauna, manifest.files.statusDefinitions]
  if (manifest.files.sourceCoverage) files.push(manifest.files.sourceCoverage)
  return files
}

export function regionDatasetFiles(manifest: DataManifest, region: RegionCode): DatasetFile[] {
  return [manifest.files.statusLinks.flora[region], manifest.files.statusLinks.fauna[region]]
}

export function allRegionalDatasetFiles(manifest: DataManifest): DatasetFile[] {
  return METROPOLITAN_REGION_CODES.flatMap((region) => regionDatasetFiles(manifest, region))
}

export function activeManifestUrl(): string {
  return new URL(ACTIVE_MANIFEST_PATH, document.baseURI).href
}

export function previousManifestUrl(): string {
  return new URL(PREVIOUS_MANIFEST_PATH, document.baseURI).href
}

export function cachesApiAvailable(): boolean {
  return typeof window !== 'undefined' && 'caches' in window && typeof caches?.open === 'function'
}

function jsonBufferResponse(buffer: ArrayBuffer): Response {
  return new Response(buffer, { headers: { 'Content-Type': 'application/json' } })
}

function manifestResponse(manifest: DataManifest): Response {
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function openNamedCache(name: string): Promise<Cache | null> {
  if (!cachesApiAvailable()) return null
  try {
    return await caches.open(name)
  } catch {
    return null
  }
}

export async function namedCacheExists(name: string): Promise<boolean> {
  if (!cachesApiAvailable()) return false
  try {
    const keys = await caches.keys()
    return keys.includes(name)
  } catch {
    return false
  }
}

export async function openMetadataCache(): Promise<Cache | null> {
  return openNamedCache(METADATA_CACHE_NAME)
}

export async function openDatasetCache(datasetVersion: string): Promise<Cache | null> {
  return openNamedCache(datasetCacheName(datasetVersion))
}

async function readManifestFromCache(cache: Cache | null, url: string): Promise<DataManifest | null> {
  if (!cache) return null
  try {
    const response = await cache.match(url)
    if (!response) return null
    return parseDataManifest(await response.json())
  } catch {
    return null
  }
}

export async function readActiveManifest(): Promise<DataManifest | null> {
  return readManifestFromCache(await openMetadataCache(), activeManifestUrl())
}

export async function readPreviousManifest(): Promise<DataManifest | null> {
  return readManifestFromCache(await openMetadataCache(), previousManifestUrl())
}

export async function writeActiveManifest(manifest: DataManifest): Promise<boolean> {
  const cache = await openMetadataCache()
  if (!cache) return false
  try {
    await cache.put(activeManifestUrl(), manifestResponse(manifest))
    return true
  } catch {
    return false
  }
}

export async function writePreviousManifest(manifest: DataManifest): Promise<boolean> {
  const cache = await openMetadataCache()
  if (!cache) return false
  try {
    await cache.put(previousManifestUrl(), manifestResponse(manifest))
    return true
  } catch {
    return false
  }
}

export type RemoteManifestResult =
  | { ok: true; manifest: DataManifest }
  | { ok: false; reason: 'unavailable' | 'invalid' }

export async function tryFetchRemoteManifest(init: RequestInit = {}): Promise<RemoteManifestResult> {
  try {
    const response = await fetch('data/manifest.json', { cache: 'no-store', ...init })
    if (!response.ok) return { ok: false, reason: 'unavailable' }
    let data: unknown
    try {
      data = await response.json()
    } catch {
      return { ok: false, reason: 'invalid' }
    }
    const parsed = parseDataManifest(data)
    if (!parsed) return { ok: false, reason: 'invalid' }
    return { ok: true, manifest: parsed }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

export async function putVerifiedDatasetFile(
  cache: Cache,
  file: DatasetFile,
  buffer: ArrayBuffer,
): Promise<void> {
  await verifyDatasetBuffer(buffer, file)
  await cache.put(catalogFileUrl(file.file), jsonBufferResponse(buffer))
}

export async function cachedFileIsValid(cache: Cache | null, file: DatasetFile): Promise<boolean> {
  if (!cache) return false
  try {
    const response = await cache.match(catalogFileUrl(file.file))
    if (!response) return false
    await verifyDatasetBuffer(await response.arrayBuffer(), file)
    return true
  } catch {
    return false
  }
}

export async function loadDatasetArray<T>(
  manifest: DataManifest,
  file: DatasetFile,
  signal?: AbortSignal,
): Promise<T[]> {
  const url = catalogFileUrl(file.file)
  const cache = await openDatasetCache(manifest.datasetVersion)

  if (cache) {
    try {
      const cached = await cache.match(url)
      if (cached) {
        try {
          return await verifyDatasetBuffer<T>(await cached.arrayBuffer(), file)
        } catch {
          /* corrupt cache entry: fall through to network when possible */
        }
      }
    } catch {
      /* match failure is not fatal while online */
    }
  }

  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  if (!online) {
    throw new Error(`Donnée indisponible hors ligne (${file.file}).`)
  }

  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(`Impossible de charger ${file.file} (${response.status}).`)
  }
  const buffer = await response.arrayBuffer()
  const data = await verifyDatasetBuffer<T>(buffer, file)
  if (cache) {
    try {
      await cache.put(url, jsonBufferResponse(buffer))
    } catch {
      /* persistence is optional when online */
    }
  }
  return data
}

async function migrateLegacyManifest(): Promise<DataManifest | null> {
  if (!(await namedCacheExists(LEGACY_MANIFEST_CACHE))) return null
  const cache = await openNamedCache(LEGACY_MANIFEST_CACHE)
  if (!cache) return null
  try {
    const response = await cache.match(new URL('data/manifest.json', document.baseURI).href)
    if (!response) return null
    return parseDataManifest(await response.json())
  } catch {
    return null
  }
}

export async function migrateLegacyCatalogFiles(manifest: DataManifest): Promise<void> {
  if (!(await namedCacheExists(LEGACY_CATALOG_CACHE))) return
  const legacy = await openNamedCache(LEGACY_CATALOG_CACHE)
  if (!legacy) return
  const versioned = await openDatasetCache(manifest.datasetVersion)
  if (!versioned) return

  const files = [...sharedDatasetFiles(manifest), ...allRegionalDatasetFiles(manifest)]
  for (const file of files) {
    const url = catalogFileUrl(file.file)
    let response: Response | undefined
    try {
      response = await legacy.match(url)
    } catch {
      continue
    }
    if (!response) continue
    try {
      const buffer = await response.arrayBuffer()
      await putVerifiedDatasetFile(versioned, file, buffer)
      try {
        await legacy.delete(url)
      } catch {
        /* keep legacy if delete fails after verified copy */
      }
    } catch {
      /* keep legacy; do not copy invalid files */
    }
  }
}

export async function migrateLegacyDataset(): Promise<DataManifest | null> {
  const existing = await readActiveManifest()
  if (existing) return existing
  const legacy = await migrateLegacyManifest()
  if (!legacy) return null
  await migrateLegacyCatalogFiles(legacy)
  await writeActiveManifest(legacy)
  return legacy
}

export async function bootstrapActiveManifest(): Promise<DataManifest | null> {
  const active = await readActiveManifest()
  if (active) return active
  return migrateLegacyDataset()
}

export async function installFirstActiveManifest(manifest: DataManifest): Promise<boolean> {
  const existing = await readActiveManifest()
  if (existing) return true
  return writeActiveManifest(manifest)
}

export function requiredUpdateFiles(
  candidate: DataManifest,
  protectedRegions: RegionCode[],
): DatasetFile[] {
  if (protectedRegions.length === 0) return []
  const seen = new Set<string>()
  const files: DatasetFile[] = []
  const add = (file: DatasetFile) => {
    if (seen.has(file.file)) return
    seen.add(file.file)
    files.push(file)
  }
  for (const file of sharedDatasetFiles(candidate)) add(file)
  for (const region of protectedRegions) {
    for (const file of regionDatasetFiles(candidate, region)) add(file)
  }
  return files
}

export function compareManifestFreshness(
  active: DataManifest,
  remote: DataManifest,
): 'same' | 'newer' | 'older' {
  if (remote.datasetVersion === active.datasetVersion) return 'same'
  const remoteAt = Date.parse(remote.generatedAt)
  const activeAt = Date.parse(active.generatedAt)
  if (Number.isFinite(remoteAt) && Number.isFinite(activeAt) && remoteAt < activeAt) {
    return 'older'
  }
  return 'newer'
}

export async function checkForUpdate(active: DataManifest): Promise<{
  status: DatasetCheckStatus
  remote: DataManifest | null
}> {
  const result = await tryFetchRemoteManifest()
  if (!result.ok) {
    return { status: result.reason === 'invalid' ? 'invalid' : 'unavailable', remote: null }
  }
  if (!cachesApiAvailable()) {
    return { status: 'storage_unavailable', remote: result.manifest }
  }
  const freshness = compareManifestFreshness(active, result.manifest)
  if (freshness === 'same') return { status: 'up_to_date', remote: result.manifest }
  if (freshness === 'older') return { status: 'remote_older', remote: result.manifest }
  return { status: 'update_available', remote: result.manifest }
}

export async function validateRequiredFilesInCache(
  candidate: DataManifest,
  files: DatasetFile[],
): Promise<boolean> {
  if (files.length === 0) return true
  const cache = await openDatasetCache(candidate.datasetVersion)
  if (!cache) return false
  for (const file of files) {
    if (!(await cachedFileIsValid(cache, file))) return false
  }
  return true
}

function attachReason(error: Error, reason: DatasetUpdateFailureReason): Error {
  ;(error as Error & { reason: DatasetUpdateFailureReason }).reason = reason
  return error
}

export function datasetUpdateFailureReason(error: unknown): DatasetUpdateFailureReason {
  if (error instanceof DatasetIntegrityError) return 'integrity'
  if (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return 'aborted'
  }
  const reason = (error as { reason?: DatasetUpdateFailureReason } | null)?.reason
  if (
    reason === 'network' ||
    reason === 'quota' ||
    reason === 'http' ||
    reason === 'aborted' ||
    reason === 'integrity' ||
    reason === 'storage'
  ) {
    return reason
  }
  if (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'QuotaExceededError') ||
    (error instanceof Error && error.name === 'QuotaExceededError')
  ) {
    return 'quota'
  }
  return 'network'
}

export async function stageRequiredFiles(
  candidate: DataManifest,
  files: DatasetFile[],
  options: {
    signal?: AbortSignal
    onProgress?: (progress: DatasetUpdateProgress) => void
  } = {},
): Promise<void> {
  if (files.length === 0) {
    options.onProgress?.({ completedFiles: 0, totalFiles: 0, bytesCompleted: 0 })
    return
  }
  const cache = await openDatasetCache(candidate.datasetVersion)
  if (!cache) {
    throw attachReason(new Error('Cache Storage indisponible.'), 'storage')
  }

  let done = 0
  let bytes = 0
  options.onProgress?.({ completedFiles: done, totalFiles: files.length, bytesCompleted: bytes })

  for (const file of files) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    if (await cachedFileIsValid(cache, file)) {
      done += 1
      bytes += file.bytes ?? 0
      options.onProgress?.({ completedFiles: done, totalFiles: files.length, bytesCompleted: bytes })
      continue
    }
    let response: Response
    try {
      response = await fetch(catalogFileUrl(file.file), {
        cache: 'no-store',
        signal: options.signal,
      })
    } catch (error) {
      if (datasetUpdateFailureReason(error) === 'aborted' || options.signal?.aborted) {
        throw error instanceof Error ? error : new DOMException('Aborted', 'AbortError')
      }
      throw attachReason(error instanceof Error ? error : new Error(String(error)), 'network')
    }
    if (!response.ok) {
      throw attachReason(new Error(`HTTP ${response.status}`), 'http')
    }
    const buffer = await response.arrayBuffer()
    try {
      await putVerifiedDatasetFile(cache, file, buffer)
    } catch (error) {
      if (error instanceof DatasetIntegrityError) throw error
      throw attachReason(error instanceof Error ? error : new Error(String(error)), 'quota')
    }
    done += 1
    bytes += buffer.byteLength
    options.onProgress?.({ completedFiles: done, totalFiles: files.length, bytesCompleted: bytes })
  }
}

export async function commitActivation(
  previous: DataManifest | null,
  candidate: DataManifest,
): Promise<void> {
  if (previous) {
    const previousWritten = await writePreviousManifest(previous)
    if (!previousWritten) {
      throw attachReason(new Error('Impossible d’enregistrer la version précédente.'), 'storage')
    }
  }
  const activeWritten = await writeActiveManifest(candidate)
  if (!activeWritten) {
    throw attachReason(new Error('Impossible d’activer la nouvelle version.'), 'storage')
  }
}

export async function cleanupObsoleteCatalogCaches(
  activeVersion: string,
  previousVersion: string | null,
): Promise<void> {
  if (!cachesApiAvailable()) return
  const keep = new Set(
    [datasetCacheName(activeVersion), previousVersion ? datasetCacheName(previousVersion) : ''].filter(Boolean),
  )
  let keys: string[]
  try {
    keys = await caches.keys()
  } catch {
    return
  }
  for (const name of keys) {
    if (!name.startsWith(DATASET_CACHE_PREFIX)) continue
    if (keep.has(name)) continue
    try {
      await caches.delete(name)
    } catch {
      /* leftover caches are acceptable */
    }
  }
}

export async function prepareAndActivateCandidate(
  active: DataManifest,
  candidate: DataManifest,
  protectedRegions: RegionCode[],
  options: {
    signal?: AbortSignal
    onProgress?: (progress: DatasetUpdateProgress) => void
  } = {},
): Promise<DataManifest> {
  const files = requiredUpdateFiles(candidate, protectedRegions)
  await stageRequiredFiles(candidate, files, options)
  throwIfAborted(options.signal)
  const valid = await validateRequiredFilesInCache(candidate, files)
  if (!valid) {
    throw new DatasetIntegrityError('La nouvelle version n’a pas pu être vérifiée.')
  }
  throwIfAborted(options.signal)
  await commitActivation(active, candidate)
  await cleanupObsoleteCatalogCaches(candidate.datasetVersion, active.datasetVersion)
  return candidate
}

export type DatasetUpdateCheck = {
  status: DatasetCheckStatus
  remote: DataManifest | null
  protectedRegions: RegionCode[]
  requiredFiles: DatasetFile[]
  requiredBytes: number
}

export type DatasetUpdateManager = {
  checkForUpdate(): Promise<DatasetUpdateCheck>
  prepareAndActivate(
    candidate: DataManifest,
    options?: {
      signal?: AbortSignal
      onProgress?: (progress: DatasetUpdateProgress) => void
    },
  ): Promise<DataManifest>
}

export function createDatasetUpdateManager(
  getActive: () => DataManifest,
  inspectProtected: () => Promise<RegionCode[]>,
): DatasetUpdateManager {
  return {
    async checkForUpdate() {
      const active = getActive()
      const protectedRegions = await inspectProtected()
      const result = await checkForUpdate(active)
      const requiredFiles = result.remote
        ? requiredUpdateFiles(result.remote, protectedRegions)
        : []
      return {
        ...result,
        protectedRegions,
        requiredFiles,
        requiredBytes: requiredFiles.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
      }
    },
    async prepareAndActivate(candidate, options) {
      const active = getActive()
      const protectedRegions = await inspectProtected()
      return prepareAndActivateCandidate(active, candidate, protectedRegions, options)
    },
  }
}
