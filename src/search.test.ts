import { describe, expect, it } from 'vitest'
import { taxa } from './demo'
import { normalizeSearch, searchTaxa } from './search'

describe('normalizeSearch', () => {
  it('ignore les accents et la casse', () => {
    expect(normalizeSearch('  CHÊNE-liège ')).toBe('chene liege')
  })
})

describe('searchTaxa', () => {
  it('retrouve plusieurs chênes avec un nom vernaculaire partiel', () => {
    const results = searchTaxa(taxa, 'flora', 'chene')
    expect(results.length).toBeGreaterThanOrEqual(5)
    expect(results.some((taxon) => taxon.scientificName === 'Quercus robur')).toBe(true)
  })

  it('retrouve un taxon par nom scientifique partiel', () => {
    const results = searchTaxa(taxa, 'flora', 'querc')
    expect(results[0]?.scientificName.startsWith('Quercus')).toBe(true)
  })

  it('retrouve un taxon avec plusieurs fragments de mots', () => {
    const results = searchTaxa(taxa, 'flora', 'lot ang')
    expect(results[0]?.scientificName).toBe('Lotus angustissimus')
  })

  it('tolère une petite faute de frappe', () => {
    const results = searchTaxa(taxa, 'flora', 'angustisimus')
    expect(results.some((taxon) => taxon.scientificName === 'Lotus angustissimus')).toBe(true)
  })

  it('respecte le filtre faune/flore', () => {
    expect(searchTaxa(taxa, 'fauna', 'chene')).toHaveLength(0)
    expect(searchTaxa(taxa, 'fauna', 'martin')[0]?.scientificName).toBe('Alcedo atthis')
  })

  it('retrouve le Sphinx de l’euphorbe (sentinelle lépidoptères)', () => {
    const byScientific = searchTaxa(taxa, 'fauna', 'Hyles euphorbiae')
    expect(byScientific.some((taxon) => taxon.cdRef === 54843)).toBe(true)

    const byVernacular = searchTaxa(taxa, 'fauna', 'euphorbe')
    expect(byVernacular.some((taxon) => taxon.scientificName === 'Hyles euphorbiae')).toBe(true)
  })
})
