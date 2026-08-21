export type Realm = 'flora' | 'fauna'

export type RegionCode = 'CVL' | 'NAQ' | 'OCC'

export interface Region {
  code: RegionCode
  name: string
}

export interface Taxon {
  cdRef: number
  realm: Realm
  scientificName: string
  vernacularNames: string[]
  synonyms: string[]
  family?: string
  rank?: string
  biogeographicStatus?: string
  sourceId?: string
}

export type StatusCategory =
  | 'red_list_national'
  | 'red_list_regional'
  | 'protection_national'
  | 'protection_regional'
  | 'znieff'
  | 'pna'
  | 'rarity'
  | 'indigenous_status'
  | 'other'

export type StatusScope = 'national' | 'regional' | 'partial'

export interface TaxonStatus {
  cdRef: number
  region: RegionCode
  category: StatusCategory
  label: string
  value: string
  sourceId: string
  scope?: StatusScope
  scopeLabel?: string
  citation?: string
  documentUrl?: string
}

export interface SourceDataset {
  id: string
  name: string
  producer: string
  version: string
  publicationYear?: number
  official: boolean
  url?: string
  checkedAt?: string
}

export interface Catalog {
  schemaVersion: 1
  generatedAt: string
  official: boolean
  warning?: string
  regions: Region[]
  taxa: Taxon[]
  statuses: TaxonStatus[]
  sources: SourceDataset[]
}

export interface DatasetFile {
  file: string
  count: number
}

export interface DataManifest {
  schemaVersion: 2
  generatedAt: string
  datasetVersion: string
  official: true
  taxrefVersion: string
  bdcVersion: string
  regions: Region[]
  sources: SourceDataset[]
  files: {
    taxa: Record<Realm, DatasetFile>
    statuses: Record<Realm, Record<RegionCode, DatasetFile>>
  }
}
