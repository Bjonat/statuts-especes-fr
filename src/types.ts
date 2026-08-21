export type Realm = 'flora' | 'fauna'

export const METROPOLITAN_REGION_CODES = [
  'ARA',
  'BFC',
  'BRE',
  'CVL',
  'COR',
  'GES',
  'HDF',
  'IDF',
  'NOR',
  'NAQ',
  'OCC',
  'PDL',
  'PAC',
] as const

export type RegionCode = (typeof METROPOLITAN_REGION_CODES)[number]

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
}

export interface StatusDefinition {
  category: StatusCategory
  label: string
  value: string
  sourceId: string
}

export type StatusScopeCode = 0 | 1 | 2
export type StatusLink = [cdRef: number, definitionId: number, scopeCode: StatusScopeCode, scopeLabel?: string]

export interface SourceDataset {
  id: string
  name: string
  producer: string
  version: string
  publicationYear?: number
  official: boolean
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
  schemaVersion: 3
  generatedAt: string
  datasetVersion: string
  official: true
  taxrefVersion: string
  bdcVersion: string
  regions: Region[]
  sources: SourceDataset[]
  files: {
    taxa: Record<Realm, DatasetFile>
    statusDefinitions: DatasetFile
    statusLinks: Record<Realm, Record<RegionCode, DatasetFile>>
  }
}
