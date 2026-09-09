import { describe, expect, it } from 'vitest'

import type { SourceDataset, TaxonStatus } from './types'
import {
  MISSING_STATUS_SOURCE_MESSAGE,
  findStatusSource,
  formatSourceCheckedAt,
  safeDocumentHref,
  statusDocumentView,
  statusSourceFields,
  statusSourceView,
} from './source-display'

function source(overrides: Partial<SourceDataset> & Pick<SourceDataset, 'id'>): SourceDataset {
  return {
    name: 'Nom par défaut',
    producer: 'Producteur par défaut',
    version: '0',
    official: false,
    ...overrides,
  }
}

function status(overrides: Partial<TaxonStatus> = {}): TaxonStatus {
  return {
    cdRef: 1,
    region: 'OCC',
    category: 'red_list_regional',
    label: 'Liste rouge régionale',
    value: 'VU',
    sourceId: 'fixture-lrr-occ',
    ...overrides,
  }
}

const lrr = source({
  id: 'fixture-lrr-occ',
  name: 'Fixture LRR Occitanie',
  producer: 'Producteur E2E LRR',
  version: 'e2e-a',
  publicationYear: 2026,
  official: true,
  checkedAt: '2026-09-09',
})

const znieff = source({
  id: 'fixture-znieff-occ',
  name: 'Fixture ZNIEFF Occitanie',
  producer: 'Autre producteur E2E',
  version: 'test-2',
  official: true,
})

describe('findStatusSource', () => {
  it('résout uniquement par status.sourceId === SourceDataset.id', () => {
    expect(findStatusSource(status({ sourceId: 'fixture-lrr-occ' }), [znieff, lrr])).toEqual(lrr)
    expect(findStatusSource(status({ sourceId: 'fixture-znieff-occ' }), [znieff, lrr])).toEqual(znieff)
  })

  it('ne déduit jamais une source depuis la catégorie, le libellé, la valeur ou la région', () => {
    const lookalike = source({
      id: 'autre-id',
      name: 'Liste rouge régionale',
      producer: 'OCC',
      version: 'VU',
    })
    const found = findStatusSource(
      status({
        sourceId: 'fixture-absente',
        category: 'red_list_regional',
        label: 'Liste rouge régionale',
        value: 'VU',
        region: 'OCC',
      }),
      [lookalike, lrr],
    )
    expect(found).toBeNull()
  })

  it('ne substitue pas BDC, TAXREF ni la première source régionale', () => {
    const taxref = source({ id: 'taxref-v18', name: 'TAXREF' })
    const bdc = source({ id: 'bdc-v18', name: 'BDC' })
    expect(findStatusSource(status({ sourceId: 'inconnu' }), [taxref, bdc, lrr])).toBeNull()
    expect(findStatusSource(status({ sourceId: 'inconnu' }), [lrr])).toBeNull()
  })
})

describe('statusSourceFields', () => {
  it('expose nom, producteur et version, puis les champs facultatifs seulement s’ils existent', () => {
    expect(statusSourceFields(lrr).map((field) => [field.key, field.value])).toEqual([
      ['name', 'Fixture LRR Occitanie'],
      ['producer', 'Producteur E2E LRR'],
      ['version', 'e2e-a'],
      ['publicationYear', '2026'],
      ['checkedAt', '09/09/2026'],
      ['official', 'Référentiel officiel'],
    ])
  })

  it('omet publicationYear, checkedAt et le caractère officiel lorsqu’ils sont absents ou faux', () => {
    const minimal = source({
      id: 'fixture-znieff-occ',
      name: 'Fixture ZNIEFF Occitanie',
      producer: 'Autre producteur E2E',
      version: 'test-2',
      official: false,
    })
    expect(statusSourceFields(minimal).map((field) => field.key)).toEqual(['name', 'producer', 'version'])
    expect(statusSourceFields(minimal).map((field) => field.value)).not.toContain('undefined')
    expect(statusSourceFields(minimal).map((field) => field.value)).not.toContain('null')
    expect(statusSourceFields(minimal).map((field) => field.value)).not.toContain('date inconnue')
  })
})

describe('formatSourceCheckedAt', () => {
  it('formate une date ISO valide et ignore une date absente ou invalide', () => {
    expect(formatSourceCheckedAt('2026-09-09')).toBe('09/09/2026')
    expect(formatSourceCheckedAt(undefined)).toBeNull()
    expect(formatSourceCheckedAt('date inconnue')).toBeNull()
  })
})

describe('statusSourceView', () => {
  it('retourne les métadonnées exactes de la source résolue', () => {
    const view = statusSourceView(status({ sourceId: 'fixture-lrr-occ' }), [znieff, lrr])
    expect(view.state).toBe('found')
    if (view.state !== 'found') return
    expect(view.source.name).toBe('Fixture LRR Occitanie')
    expect(view.source.producer).toBe('Producteur E2E LRR')
    expect(view.source.version).toBe('e2e-a')
    expect(view.source.publicationYear).toBe(2026)
    expect(view.source.checkedAt).toBe('2026-09-09')
  })

  it('échoue visiblement sans attribution de substitution', () => {
    const view = statusSourceView(status({ sourceId: 'fixture-source-absente' }), [lrr, znieff])
    expect(view).toEqual({
      state: 'missing',
      sourceId: 'fixture-source-absente',
      message: MISSING_STATUS_SOURCE_MESSAGE,
    })
  })

  it('associe deux statuts du même sourceId à la même source, sans mélange', () => {
    const first = statusSourceView(status({ sourceId: 'fixture-znieff-occ', label: 'ZNIEFF MP' }), [lrr, znieff])
    const second = statusSourceView(status({ sourceId: 'fixture-znieff-occ', label: 'ZNIEFF LR' }), [lrr, znieff])
    expect(first.state).toBe('found')
    expect(second.state).toBe('found')
    if (first.state !== 'found' || second.state !== 'found') return
    expect(first.source).toBe(znieff)
    expect(second.source).toBe(znieff)
  })
})

describe('safeDocumentHref', () => {
  it('accepte uniquement http et https, sans réécrire l’URL', () => {
    expect(safeDocumentHref('https://example.test/fixture-doc-1')).toBe('https://example.test/fixture-doc-1')
    expect(safeDocumentHref('http://example.test/doc')).toBe('http://example.test/doc')
  })

  it('refuse les schémas dangereux ou non HTTP(S)', () => {
    expect(safeDocumentHref('javascript:alert(1)')).toBeNull()
    expect(safeDocumentHref('data:text/html,hi')).toBeNull()
    expect(safeDocumentHref('file:///C:/Users/cregnier/Downloads/lr.pdf')).toBeNull()
    expect(safeDocumentHref('not a url')).toBeNull()
    expect(safeDocumentHref('')).toBeNull()
    expect(safeDocumentHref(undefined)).toBeNull()
  })
})

describe('statusDocumentView', () => {
  it('expose citation, CD_DOC et href seulement si l’URL est HTTP(S)', () => {
    expect(
      statusDocumentView(
        status({
          document: {
            cdDoc: 'fixture-doc-1',
            citation: 'Citation fictive explicite',
            url: 'https://example.test/fixture-doc-1',
          },
        }),
      ),
    ).toEqual({
      cdDoc: 'fixture-doc-1',
      citation: 'Citation fictive explicite',
      href: 'https://example.test/fixture-doc-1',
    })
  })

  it('conserve cdDoc sans fabriquer de lien si l’URL est absente', () => {
    expect(statusDocumentView(status({ document: { cdDoc: '411507', citation: 'Sans URL' } }))).toEqual({
      cdDoc: '411507',
      citation: 'Sans URL',
    })
  })

  it('conserve la preuve textuelle si l’URL n’est pas cliquable', () => {
    expect(
      statusDocumentView(
        status({
          document: { cdDoc: 'DOC-FILE', citation: 'Chemin local BDC', url: 'file:///tmp/doc.pdf' },
        }),
      ),
    ).toEqual({
      cdDoc: 'DOC-FILE',
      citation: 'Chemin local BDC',
    })
  })

  it('n’affiche rien sans cdDoc, même si une citation existe', () => {
    expect(
      statusDocumentView(
        status({
          document: { cdDoc: '  ', citation: 'Orpheline', url: 'https://example.test/x' },
        }),
      ),
    ).toBeNull()
    expect(statusDocumentView(status())).toBeNull()
  })
})
