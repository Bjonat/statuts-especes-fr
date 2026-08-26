import { describe, expect, it } from 'vitest'
import { collectSourceIdsFromLinks, hydrateStatusLinks } from './status-data'
import type { StatusDefinition, StatusLink } from './types'

describe('hydrateStatusLinks', () => {
  it('reconstruit un statut complet à partir du dictionnaire et du lien', () => {
    const definitions: StatusDefinition[] = [
      {
        category: 'protection_regional',
        label: 'Protection régionale',
        value: 'PR - Protégée',
        sourceId: 'bdc-v18',
      },
    ]
    const links: StatusLink[] = [[106634, 0, 2, 'ancienne région Aquitaine']]

    expect(hydrateStatusLinks(definitions, links, 'NAQ')).toEqual([
      {
        cdRef: 106634,
        region: 'NAQ',
        category: 'protection_regional',
        label: 'Protection régionale',
        value: 'PR - Protégée',
        sourceId: 'bdc-v18',
        scope: 'partial',
        scopeLabel: 'ancienne région Aquitaine',
      },
    ])
  })

  it('échoue si le lien référence une définition absente', () => {
    expect(() => hydrateStatusLinks([], [[3571, 42, 0]], 'CVL')).toThrow('Définition de statut #42 introuvable')
  })
})

describe('collectSourceIdsFromLinks', () => {
  it('collecte les sourceId cités sans hydrater les taxons', () => {
    const definitions: StatusDefinition[] = [
      { category: 'red_list_regional', label: 'LRR', value: 'VU', sourceId: 'bdc-v18' },
      { category: 'znieff', label: 'ZNIEFF', value: 'Oui', sourceId: 'dreal-cvl-znieff-2026-04' },
      { category: 'protection_national', label: 'Protection', value: 'Oui', sourceId: 'bdc-v18' },
    ]
    const links: StatusLink[] = [
      [1, 0, 1],
      [2, 1, 1],
      [3, 2, 0],
      [4, 1, 1],
    ]
    expect([...collectSourceIdsFromLinks(definitions, links)].sort()).toEqual([
      'bdc-v18',
      'dreal-cvl-znieff-2026-04',
    ])
  })
})
