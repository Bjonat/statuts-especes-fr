import { describe, expect, it } from 'vitest'
import { hydrateStatusLinks } from './status-data'
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
