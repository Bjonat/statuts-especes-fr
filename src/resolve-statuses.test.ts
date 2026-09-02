import { describe, expect, it } from 'vitest'
import { resolveStatuses } from './resolve-statuses'
import type { RegionCode, TaxonStatus } from './types'

function status(overrides: Partial<TaxonStatus> & Pick<TaxonStatus, 'cdRef' | 'region' | 'category'>): TaxonStatus {
  return {
    label: overrides.label ?? overrides.category,
    value: overrides.value ?? 'oui',
    sourceId: overrides.sourceId ?? 'bdc-v18',
    ...overrides,
  }
}

describe('resolveStatuses', () => {
  it('Alcedo atthis 3571 / CVL conserve la protection nationale', () => {
    const protection = status({
      cdRef: 3571,
      region: 'CVL',
      category: 'protection_national',
      label: 'Protection nationale',
      value: 'NI2',
      sourceId: 'bdc-v18',
      scope: 'national',
    })
    const other = status({
      cdRef: 3571,
      region: 'CVL',
      category: 'other',
      label: 'Directive Habitat',
      value: 'CDH4',
      sourceId: 'bdc-v18',
    })

    const result = resolveStatuses({ cdRef: 3571, region: 'CVL', statuses: [other, protection] })

    expect(result.outcome).toBe('resolved')
    expect(result.taxon).toEqual({ cdRef: 3571 })
    expect(result.territory).toEqual({ region: 'CVL' })
    expect(result.warnings).toEqual([])
    expect(result.statuses[0]).toBe(protection)
    expect(result.statuses[0]?.scope).toBe('national')
    expect(result.statuses[0]?.sourceId).toBe('bdc-v18')
    expect(result.statuses[0]?.value).toBe('NI2')
    expect(result.statuses.map((entry) => entry.category)).toEqual(['protection_national', 'other'])
  })

  it('Hyles euphorbiae 54843 / CVL : none_in_integrated_sources, pas de fuite HDF/NOR', () => {
    const hdf = status({
      cdRef: 54843,
      region: 'HDF',
      category: 'znieff',
      label: 'Déterminante ZNIEFF',
      value: 'Oui',
      sourceId: 'cbnhdf-digitale-znieff-hdf',
      scope: 'partial',
      scopeLabel: 'Hauts-de-France',
    })
    const nor = status({
      cdRef: 54843,
      region: 'NOR',
      category: 'znieff',
      label: 'Déterminante ZNIEFF',
      value: 'Oui',
      sourceId: 'cbn-nor-znieff',
      scope: 'partial',
    })

    const result = resolveStatuses({ cdRef: 54843, region: 'CVL', statuses: [hdf, nor] })

    expect(result.outcome).toBe('none_in_integrated_sources')
    expect(result.statuses).toEqual([])
    expect(result.sourceIds).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('Lotus angustissimus 106634 / NAQ conserve une portée partielle Aquitaine', () => {
    const lotus = status({
      cdRef: 106634,
      region: 'NAQ',
      category: 'protection_regional',
      label: 'Protection régionale',
      value: 'PR',
      sourceId: 'bdc-v18',
      scope: 'partial',
      scopeLabel: 'Aquitaine',
    })

    const result = resolveStatuses({ cdRef: 106634, region: 'NAQ', statuses: [lotus] })

    expect(result.outcome).toBe('resolved')
    expect(result.statuses).toHaveLength(1)
    expect(result.statuses[0]).toBe(lotus)
    expect(result.statuses[0]?.scope).toBe('partial')
    expect(result.statuses[0]?.scopeLabel).toBe('Aquitaine')
    expect(result.statuses[0]?.sourceId).toBe('bdc-v18')
  })

  it('exclut « Sans objet » dans le label et « SANS OBJET » dans la valeur', () => {
    const useful = status({
      cdRef: 1,
      region: 'CVL',
      category: 'znieff',
      label: 'Déterminante ZNIEFF',
      value: 'Oui',
      sourceId: 'bdc-v18',
    })
    const byLabel = status({
      cdRef: 1,
      region: 'CVL',
      category: 'other',
      label: 'Sans objet',
      value: 'X',
      sourceId: 'bdc-v18',
    })
    const byValue = status({
      cdRef: 1,
      region: 'CVL',
      category: 'other',
      label: 'Mention',
      value: 'SANS OBJET',
      sourceId: 'bdc-v18',
    })

    const result = resolveStatuses({ cdRef: 1, region: 'CVL', statuses: [byLabel, useful, byValue] })

    expect(result.outcome).toBe('resolved')
    expect(result.statuses).toEqual([useful])
  })

  it('reconnaît <em>Sans objet</em> comme inutile après nettoyage', () => {
    const useful = status({
      cdRef: 2,
      region: 'CVL',
      category: 'protection_national',
      label: 'Protection nationale',
      value: 'Oui',
    })
    const marked = status({
      cdRef: 2,
      region: 'CVL',
      category: 'other',
      label: '<em>Sans objet</em>',
      value: 'n/a',
    })

    const result = resolveStatuses({ cdRef: 2, region: 'CVL', statuses: [marked, useful] })

    expect(result.statuses).toEqual([useful])
    expect(result.statuses[0]?.label).toBe('Protection nationale')
  })

  it('0 statut utile, y compris uniquement des « sans objet », donne none_in_integrated_sources', () => {
    const result = resolveStatuses({
      cdRef: 3,
      region: 'CVL',
      statuses: [
        status({ cdRef: 3, region: 'CVL', category: 'other', label: 'Sans objet', value: 'x' }),
      ],
    })

    expect(result.outcome).toBe('none_in_integrated_sources')
    expect(result.statuses).toEqual([])
  })

  it('trie les catégories comme la PWA actuelle', () => {
    const disordered: TaxonStatus[] = [
      status({ cdRef: 10, region: 'CVL', category: 'other', label: 'Zebra' }),
      status({ cdRef: 10, region: 'CVL', category: 'znieff', label: 'ZNIEFF' }),
      status({ cdRef: 10, region: 'CVL', category: 'red_list_regional', label: 'LRR' }),
      status({ cdRef: 10, region: 'CVL', category: 'protection_regional', label: 'PR' }),
      status({ cdRef: 10, region: 'CVL', category: 'protection_national', label: 'PN' }),
      status({ cdRef: 10, region: 'CVL', category: 'red_list_national', label: 'LRN' }),
    ]

    const result = resolveStatuses({ cdRef: 10, region: 'CVL', statuses: disordered })

    expect(result.statuses.map((entry) => entry.category)).toEqual([
      'protection_national',
      'protection_regional',
      'red_list_national',
      'red_list_regional',
      'znieff',
      'other',
    ])
  })

  it('trie deux statuts other selon le libellé français', () => {
    const late = status({ cdRef: 11, region: 'CVL', category: 'other', label: 'Zostère' })
    const early = status({ cdRef: 11, region: 'CVL', category: 'other', label: 'Abeille' })

    const result = resolveStatuses({ cdRef: 11, region: 'CVL', statuses: [late, early] })

    expect(result.statuses.map((entry) => entry.label)).toEqual(['Abeille', 'Zostère'])
  })

  it('ne conserve que la région demandée', () => {
    const cvl = status({ cdRef: 20, region: 'CVL', category: 'znieff', label: 'A', sourceId: 'src-a' })
    const naq = status({ cdRef: 20, region: 'NAQ', category: 'znieff', label: 'B', sourceId: 'src-b' })

    const result = resolveStatuses({ cdRef: 20, region: 'CVL', statuses: [cvl, naq] })

    expect(result.statuses).toEqual([cvl])
    expect(result.sourceIds).toEqual(['src-a'])
  })

  it('ne conserve que le taxon demandé', () => {
    const alcedo = status({
      cdRef: 3571,
      region: 'CVL',
      category: 'protection_national',
      label: 'Protection nationale',
      value: 'NI2',
    })
    const hyles = status({
      cdRef: 54843,
      region: 'CVL',
      category: 'znieff',
      label: 'ZNIEFF',
      value: 'Oui',
    })

    const result = resolveStatuses({ cdRef: 3571, region: 'CVL', statuses: [hyles, alcedo] })

    expect(result.statuses).toEqual([alcedo])
  })

  it('ne mute pas le tableau d’entrée ni les objets source', () => {
    const first = status({ cdRef: 30, region: 'CVL', category: 'other', label: 'Zebra' })
    const second = status({
      cdRef: 30,
      region: 'CVL',
      category: 'protection_national',
      label: 'Protection nationale',
      value: 'Oui',
    })
    const statuses = [first, second]
    const before = [...statuses]
    const snapshot = structuredClone(statuses)

    resolveStatuses({ cdRef: 30, region: 'CVL', statuses })

    expect(statuses).toEqual(before)
    expect(statuses[0]).toBe(first)
    expect(statuses[1]).toBe(second)
    expect(statuses).toEqual(snapshot)
  })

  it('sourceIds uniques dans l’ordre de première apparition du résultat trié', () => {
    const a = status({
      cdRef: 40,
      region: 'CVL',
      category: 'protection_national',
      sourceId: 'bdc-v18',
      label: 'Protection nationale',
    })
    const b = status({
      cdRef: 40,
      region: 'CVL',
      category: 'znieff',
      sourceId: 'source-regionale',
      label: 'ZNIEFF',
    })
    const c = status({
      cdRef: 40,
      region: 'CVL',
      category: 'red_list_national',
      sourceId: 'bdc-v18',
      label: 'Liste rouge nationale',
    })

    const result = resolveStatuses({ cdRef: 40, region: 'CVL', statuses: [b, a, c] })

    expect(result.statuses.map((entry) => entry.sourceId)).toEqual(['bdc-v18', 'bdc-v18', 'source-regionale'])
    expect(result.sourceIds).toEqual(['bdc-v18', 'source-regionale'])
  })

  it('est déterministe', () => {
    const statuses = [
      status({ cdRef: 50, region: 'CVL', category: 'znieff', label: 'ZNIEFF' }),
      status({ cdRef: 50, region: 'CVL', category: 'protection_national', label: 'PN' }),
    ]
    const input = { cdRef: 50, region: 'CVL' as RegionCode, statuses }

    expect(resolveStatuses(input)).toEqual(resolveStatuses(input))
  })

  it('ne déduplique pas deux statuts utiles distincts', () => {
    const first = status({
      cdRef: 60,
      region: 'CVL',
      category: 'znieff',
      label: 'Déterminante ZNIEFF',
      value: 'Oui',
      sourceId: 'bdc-v18',
    })
    const second = status({
      cdRef: 60,
      region: 'CVL',
      category: 'znieff',
      label: 'Déterminante ZNIEFF',
      value: 'Oui',
      sourceId: 'dreal-cvl-znieff',
    })

    const result = resolveStatuses({ cdRef: 60, region: 'CVL', statuses: [first, second] })

    expect(result.statuses).toHaveLength(2)
    expect(result.statuses).toEqual(expect.arrayContaining([first, second]))
  })

  it('conserve les label et value originaux', () => {
    const raw = status({
      cdRef: 70,
      region: 'CVL',
      category: 'other',
      label: 'Libellé  &amp;  officiel',
      value: 'valeur   brute',
    })

    const result = resolveStatuses({ cdRef: 70, region: 'CVL', statuses: [raw] })

    expect(result.statuses[0]?.label).toBe('Libellé  &amp;  officiel')
    expect(result.statuses[0]?.value).toBe('valeur   brute')
  })
})
