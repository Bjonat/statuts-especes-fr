export interface LegacyRegion {
  code: string
  name: string
  coversWholeRegion: boolean
  departments?: string[]
}

export interface MetropolitanRegion {
  code: string
  name: string
  inseeCode: string
  departments: string[]
  legacyRegions: LegacyRegion[]
}

export const REGIONS: MetropolitanRegion[]

export function resolveScope(
  cdSig: unknown,
  region: MetropolitanRegion,
): { scope: 'national' | 'regional' | 'partial'; scopeLabel: string } | null

export function normalizeDepartment(value: string): string
export function normalizeTerritoryName(value: string): string
export function assertDepartmentInRegion(regionCode: string, department: string): string
export function partialScopeApplicability(input: {
  regionCode: string
  department: string
  scopeLabel?: string
}): 'applicable' | 'not_applicable' | 'indeterminate'
