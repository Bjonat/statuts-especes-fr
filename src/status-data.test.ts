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

  it('restitue StatusDefinition.document sur TaxonStatus sans modifier le lien compact', () => {
    const definitions: StatusDefinition[] = [
      {
        category: 'red_list_regional',
        label: 'Liste rouge régionale',
        value: 'VU',
        sourceId: 'bdc-v18',
        document: {
          cdDoc: '443486',
          citation: 'Citation test',
          url: 'https://example.test/doc',
        },
      },
    ]
    const links: StatusLink[] = [[53663, 0, 1]]

    expect(hydrateStatusLinks(definitions, links, 'CVL')).toEqual([
      {
        cdRef: 53663,
        region: 'CVL',
        category: 'red_list_regional',
        label: 'Liste rouge régionale',
        value: 'VU',
        sourceId: 'bdc-v18',
        document: {
          cdDoc: '443486',
          citation: 'Citation test',
          url: 'https://example.test/doc',
        },
        scope: 'regional',
      },
    ])
    expect(links[0]).toEqual([53663, 0, 1])
  })

  it('sans document : contrat historique inchangé', () => {
    const definitions: StatusDefinition[] = [
      {
        category: 'znieff',
        label: 'Déterminante ZNIEFF',
        value: 'Oui',
        sourceId: 'fixture-znieff-occ',
      },
    ]
    expect(hydrateStatusLinks(definitions, [[900001, 0, 1]], 'OCC')[0]).toEqual({
      cdRef: 900001,
      region: 'OCC',
      category: 'znieff',
      label: 'Déterminante ZNIEFF',
      value: 'Oui',
      sourceId: 'fixture-znieff-occ',
      scope: 'regional',
    })
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
