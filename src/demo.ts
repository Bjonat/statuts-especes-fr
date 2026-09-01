import type { Region, SourceDataset, Taxon, TaxonStatus } from './types'

export const DEMO_DATA_WARNING = 'Données de démonstration non officielles - ne pas utiliser pour une décision terrain.'

export const regions: Region[] = [
  { code: 'CVL', name: 'Centre-Val de Loire' },
  { code: 'NAQ', name: 'Nouvelle-Aquitaine' },
  { code: 'OCC', name: 'Occitanie' },
]

export const taxa: Taxon[] = [
  {
    cdRef: 106634,
    realm: 'flora',
    scientificName: 'Lotus angustissimus',
    vernacularNames: ['Lotier grêle', 'Lotier très étroit'],
    synonyms: [],
    family: 'Fabaceae',
  },
  {
    cdRef: 116703,
    realm: 'flora',
    scientificName: 'Quercus robur',
    vernacularNames: ['Chêne pédonculé'],
    synonyms: ['Quercus pedunculata'],
    family: 'Fagaceae',
  },
  {
    cdRef: 116702,
    realm: 'flora',
    scientificName: 'Quercus petraea',
    vernacularNames: ['Chêne sessile', 'Chêne rouvre'],
    synonyms: ['Quercus sessiliflora'],
    family: 'Fagaceae',
  },
  {
    cdRef: 116704,
    realm: 'flora',
    scientificName: 'Quercus pubescens',
    vernacularNames: ['Chêne pubescent'],
    synonyms: [],
    family: 'Fagaceae',
  },
  {
    cdRef: 116701,
    realm: 'flora',
    scientificName: 'Quercus ilex',
    vernacularNames: ['Chêne vert'],
    synonyms: [],
    family: 'Fagaceae',
  },
  {
    cdRef: 116706,
    realm: 'flora',
    scientificName: 'Quercus suber',
    vernacularNames: ['Chêne-liège'],
    synonyms: [],
    family: 'Fagaceae',
  },
  {
    cdRef: 3571,
    realm: 'fauna',
    scientificName: 'Alcedo atthis',
    vernacularNames: ["Martin-pêcheur d'Europe"],
    synonyms: [],
    family: 'Alcedinidae',
  },
  {
    cdRef: 310,
    realm: 'fauna',
    scientificName: 'Rana dalmatina',
    vernacularNames: ['Grenouille agile'],
    synonyms: [],
    family: 'Ranidae',
  },
  {
    // Sentinelle terrain : espèce présente dans TAXREF, sans statut en démo
    // (miroir du comportement « aucun statut » observé hors HDF/NOR en production).
    cdRef: 54843,
    realm: 'fauna',
    scientificName: 'Hyles euphorbiae',
    vernacularNames: ["Sphinx de l'Euphorbe"],
    synonyms: ['Celerio euphorbiae', 'Deilephila euphorbiae', 'Sphinx euphorbiae'],
    family: 'Sphingidae',
  },
]

export const sources: SourceDataset[] = [
  {
    id: 'fixture-dev',
    name: 'Fixture de développement',
    producer: 'statuts-especes-fr',
    version: '0.1',
    publicationYear: 2026,
    official: false,
  },
]

export const statuses: TaxonStatus[] = [
  { cdRef: 106634, region: 'CVL', category: 'red_list_national', label: 'Liste rouge nationale', value: 'LC - Préoccupation mineure', sourceId: 'fixture-dev' },
  { cdRef: 106634, region: 'CVL', category: 'red_list_regional', label: 'Liste rouge régionale', value: 'LC - Préoccupation mineure', sourceId: 'fixture-dev' },
  { cdRef: 106634, region: 'CVL', category: 'rarity', label: 'Rareté régionale', value: 'RR', sourceId: 'fixture-dev' },
  { cdRef: 116703, region: 'CVL', category: 'red_list_regional', label: 'Liste rouge régionale', value: 'LC', sourceId: 'fixture-dev' },
  { cdRef: 116703, region: 'NAQ', category: 'red_list_regional', label: 'Liste rouge régionale', value: 'LC', sourceId: 'fixture-dev' },
  { cdRef: 116703, region: 'OCC', category: 'red_list_regional', label: 'Liste rouge régionale', value: 'LC', sourceId: 'fixture-dev' },
  { cdRef: 3571, region: 'CVL', category: 'protection_national', label: 'Protection nationale', value: 'NI2', sourceId: 'fixture-dev' },
  { cdRef: 3571, region: 'CVL', category: 'other', label: 'Directive Habitat', value: 'CDH4', sourceId: 'fixture-dev' },
  { cdRef: 3571, region: 'CVL', category: 'red_list_regional', label: 'Liste rouge régionale', value: 'LC - Préoccupation mineure', sourceId: 'fixture-dev' },
  { cdRef: 310, region: 'CVL', category: 'protection_national', label: 'Protection nationale', value: 'NV2', sourceId: 'fixture-dev' },
]
