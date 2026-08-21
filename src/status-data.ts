import type { RegionCode, StatusDefinition, StatusLink, StatusScope, TaxonStatus } from './types'

const SCOPE_BY_CODE: Record<StatusLink[2], StatusScope> = {
  0: 'national',
  1: 'regional',
  2: 'partial',
}

export function hydrateStatusLinks(
  definitions: StatusDefinition[],
  links: StatusLink[],
  region: RegionCode,
): TaxonStatus[] {
  return links.map(([cdRef, definitionId, scopeCode, scopeLabel]) => {
    const definition = definitions[definitionId]
    if (!definition) throw new Error(`Définition de statut #${definitionId} introuvable`)

    return {
      cdRef,
      region,
      ...definition,
      scope: SCOPE_BY_CODE[scopeCode],
      ...(scopeLabel ? { scopeLabel } : {}),
    }
  })
}
