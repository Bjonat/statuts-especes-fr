import { METROPOLITAN_REGION_CODES } from './types'
import type { DataManifest, DatasetFile, Realm, Region, RegionCode } from './types'

export class DatasetIntegrityError extends Error {
  readonly reason = 'integrity' as const

  constructor(message: string) {
    super(message)
    this.name = 'DatasetIntegrityError'
  }
}

export function isDatasetFile(value: unknown): value is DatasetFile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { file?: unknown; count?: unknown; bytes?: unknown }
  if (typeof candidate.file !== 'string' || !/^[a-z0-9-]+-[a-f0-9]+\.json$/i.test(candidate.file)) return false
  if (typeof candidate.count !== 'number' || !Number.isInteger(candidate.count) || candidate.count < 0) return false
  if (candidate.bytes !== undefined) {
    if (
      typeof candidate.bytes !== 'number' ||
      !Number.isFinite(candidate.bytes) ||
      !Number.isInteger(candidate.bytes) ||
      candidate.bytes < 0
    ) {
      return false
    }
  }
  return true
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

export function isDataManifest(value: unknown): value is DataManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DataManifest>
  if (
    candidate.schemaVersion !== 3 ||
    candidate.official !== true ||
    typeof candidate.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.generatedAt)) ||
    typeof candidate.datasetVersion !== 'string' ||
    candidate.datasetVersion.length === 0 ||
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

export function parseDataManifest(value: unknown): DataManifest | null {
  return isDataManifest(value) ? value : null
}

export function datasetFileHashSuffix(fileName: string): string | null {
  const match = fileName.match(/-([a-f0-9]+)\.json$/i)
  return match ? match[1].toLowerCase() : null
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyDatasetBuffer<T>(buffer: ArrayBuffer, file: DatasetFile): Promise<T[]> {
  const suffix = datasetFileHashSuffix(file.file)
  if (!suffix) {
    throw new DatasetIntegrityError(`Nom de fichier non hashé : ${file.file}`)
  }
  const hex = await sha256Hex(buffer)
  if (!hex.startsWith(suffix)) {
    throw new DatasetIntegrityError(`Hash SHA-256 invalide pour ${file.file}`)
  }
  if (file.bytes !== undefined && buffer.byteLength !== file.bytes) {
    throw new DatasetIntegrityError(`Taille inattendue pour ${file.file}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(buffer))
  } catch {
    throw new DatasetIntegrityError(`JSON invalide pour ${file.file}`)
  }
  if (!Array.isArray(parsed)) {
    throw new DatasetIntegrityError(`Tableau attendu pour ${file.file}`)
  }
  if (parsed.length !== file.count) {
    throw new DatasetIntegrityError(`Nombre d’entrées inattendu pour ${file.file}`)
  }
  return parsed as T[]
}
