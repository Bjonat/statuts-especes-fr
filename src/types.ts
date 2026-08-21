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
}

export type StatusCategory =
  | 'red_list_national'
  | 'red_list_regional'
  | 'protection_national'
  | 'protection_regional'
  | 'znieff'
  | 'rarity'
  | 'indigenous_status'
  | 'other'

export interface TaxonStatus {
  cdRef: number
  region: RegionCode
  category: StatusCategory
  label: string
  value: string
  sourceId: string
}

export interface SourceDataset {
  id: string
  name: string
  producer: string
  version: string
  publicationYear?: number
  official: boolean
}
