import type { RegionCode, StatusCategory, TaxonStatus } from './types'

export type ResolveStatusesOutcome = 'resolved' | 'none_in_integrated_sources'

export interface ResolveStatusesInput {
  cdRef: number
  region: RegionCode
  statuses: TaxonStatus[]
}

export interface ResolveStatusesResult {
  taxon: {
    cdRef: number
  }
  territory: {
    region: RegionCode
  }
  statuses: TaxonStatus[]
  sourceIds: string[]
  warnings: string[]
  outcome: ResolveStatusesOutcome
}

const STATUS_LABELS: Partial<Record<StatusCategory, string>> = {
  red_list_national: 'Liste rouge nationale',
  red_list_regional: 'Liste rouge régionale',
  protection_national: 'Protection nationale',
  protection_regional: 'Protection régionale',
  znieff: 'Déterminante ZNIEFF',
  regional_responsibility: 'Responsabilité biologique régionale',
  pna: "Plan national d'actions",
  rarity: 'Rareté',
  indigenous_status: 'Indigénat',
}

const STATUS_ORDER: StatusCategory[] = [
  'protection_national',
  'protection_regional',
  'red_list_national',
  'red_list_regional',
  'znieff',
  'regional_responsibility',
  'pna',
  'rarity',
  'indigenous_status',
  'other',
]

function cleanDisplayText(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/<\/?(?:em|i|strong|b)>/gi, '')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function shortStatusLabel(status: TaxonStatus): string {
  const mapped = STATUS_LABELS[status.category]
  if (mapped) return mapped

  const label = cleanDisplayText(status.label)
  if (/sans objet/i.test(label)) return 'Sans objet'
  if (/réglement/i.test(label)) return 'Réglementation'
  if (label.length <= 52) return label
  return 'Autre statut'
}

function usefulStatus(status: TaxonStatus): boolean {
  const label = cleanDisplayText(status.label)
  const value = cleanDisplayText(status.value)
  return !/sans objet/i.test(label) && !/sans objet/i.test(value)
}

function uniqueSourceIds(statuses: TaxonStatus[]): string[] {
  const sourceIds: string[] = []
  for (const status of statuses) {
    if (!sourceIds.includes(status.sourceId)) sourceIds.push(status.sourceId)
  }
  return sourceIds
}

/**
 * Détermine les statuts utiles d’un taxon pour un territoire déjà chargé.
 * Pur, synchrone : pas de DOM, I/O, couverture runtime ni interprétation juridique.
 */
export function resolveStatuses({ cdRef, region, statuses }: ResolveStatusesInput): ResolveStatusesResult {
  const resolved = statuses
    .filter((status) => status.cdRef === cdRef && status.region === region && usefulStatus(status))
    .sort((left, right) => {
      const category = STATUS_ORDER.indexOf(left.category) - STATUS_ORDER.indexOf(right.category)
      if (category !== 0) return category
      return shortStatusLabel(left).localeCompare(shortStatusLabel(right), 'fr')
    })

  return {
    taxon: { cdRef },
    territory: { region },
    statuses: resolved,
    sourceIds: uniqueSourceIds(resolved),
    warnings: [],
    outcome: resolved.length > 0 ? 'resolved' : 'none_in_integrated_sources',
  }
}
