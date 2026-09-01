import { describe, expect, it } from 'vitest'
import {
  NO_IDENTIFIED_STATUS_MESSAGE,
  buildStatusHelp,
  extractStatusCode,
  formatStatusValueForDisplay,
} from './status-help'

describe('extractStatusCode', () => {
  it('extrait un code BDC en tête de valeur', () => {
    expect(extractStatusCode('NI2')).toBe('NI2')
    expect(extractStatusCode('CDH4 - Annexe IV')).toBe('CDH4')
    expect(extractStatusCode('EN - En danger')).toBe('EN')
  })

  it('ignore le préfixe technique true -', () => {
    expect(extractStatusCode('true - Déterminante ZNIEFF')).toBeUndefined()
  })
})

describe('formatStatusValueForDisplay', () => {
  it('conserve le code réglementaire affiché', () => {
    expect(formatStatusValueForDisplay('NI2')).toBe('NI2')
    expect(formatStatusValueForDisplay('LC - Préoccupation mineure')).toBe('LC - Préoccupation mineure')
  })

  it('retire le préfixe true - sans inventer de valeur', () => {
    expect(formatStatusValueForDisplay('true - Déterminante ZNIEFF')).toBe('Déterminante ZNIEFF')
  })
})

describe('buildStatusHelp', () => {
  it('fournit une aide prudente pour un code de protection, sans déduire un article', () => {
    const help = buildStatusHelp({
      category: 'protection_national',
      label: 'Protection nationale',
      value: 'NI2',
    })

    expect(help.family).toBe('protection')
    expect(help.familyLabel).toBe('Protection')
    expect(help.title).toBe('Protection nationale')
    expect(help.code).toBe('NI2')
    expect(help.explanation).toMatch(/arrêté applicable/i)
    expect(help.explanation).not.toMatch(/article/i)
    expect(help.explanationSource).toBe('glossary')
  })

  it('n’extrapole pas un numéro d’article depuis un autre code de protection', () => {
    const help = buildStatusHelp({
      category: 'protection_national',
      label: 'Protection nationale',
      value: 'FRAR3',
    })

    expect(help.code).toBe('FRAR3')
    expect(help.explanation).not.toMatch(/article 3/i)
    expect(help.explanation).toMatch(/consulter le texte réglementaire/i)
  })

  it('privilégie le libellé officiel porté par la valeur lorsqu’il existe', () => {
    const help = buildStatusHelp({
      category: 'protection_national',
      label: 'Protection nationale',
      value: 'NI2 - Protégée',
    })

    expect(help.code).toBe('NI2')
    expect(help.explanation).toBe('Protégée')
    expect(help.explanationSource).toBe('official_label')
    expect(help.explanation).not.toMatch(/article/i)
  })

  it('reste générique pour une protection régionale, sans numéro d’article', () => {
    const help = buildStatusHelp({
      category: 'protection_regional',
      label: 'Protection régionale',
      value: 'RV2',
    })

    expect(help.family).toBe('protection')
    expect(help.code).toBe('RV2')
    expect(help.explanation).toMatch(/protection régionale/i)
    expect(help.explanation).not.toMatch(/article/i)
  })

  it('explique une directive à partir du code tout en gardant le libellé officiel', () => {
    const help = buildStatusHelp({
      category: 'other',
      label: 'Directive Habitat',
      value: 'CDH4',
    })

    expect(help.family).toBe('directive')
    expect(help.title).toBe('Directive Habitat')
    expect(help.code).toBe('CDH4')
    expect(help.explanation).toMatch(/annexe IV/i)
  })

  it('fonctionne sans glossaire complémentaire (libellé officiel seul)', () => {
    const help = buildStatusHelp({
      category: 'rarity',
      label: 'Rareté régionale',
      value: 'RR',
    })

    expect(help.family).toBe('patrimonial')
    expect(help.title).toBe('Rareté régionale')
    expect(help.code).toBe('RR')
    expect(help.explanation).toBeUndefined()
    expect(help.explanationSource).toBe('official_label')
  })

  it('ne perd pas les données officielles pour une ZNIEFF', () => {
    const help = buildStatusHelp({
      category: 'znieff',
      label: 'ZNIEFF Déterminantes',
      value: 'true - Déterminante ZNIEFF',
    })

    expect(help.family).toBe('znieff')
    expect(help.title).toBe('ZNIEFF Déterminantes')
    expect(help.explanation).toMatch(/ZNIEFF/)
    expect(help.explanation).not.toMatch(/protection réglementaire seule/i)
  })

  it('explique une catégorie UICN sans inventer de portée juridique', () => {
    const help = buildStatusHelp({
      category: 'red_list_national',
      label: 'Liste rouge nationale',
      value: 'VU - Vulnérable',
    })

    expect(help.family).toBe('liste_rouge')
    expect(help.code).toBe('VU')
    expect(help.explanation).toMatch(/Vulnérable/)
  })
})

describe('message aucun statut', () => {
  it('formule un résultat relatif aux référentiels intégrés', () => {
    expect(NO_IDENTIFIED_STATUS_MESSAGE).toMatch(/référentiels actuellement intégrés/)
    expect(NO_IDENTIFIED_STATUS_MESSAGE).not.toMatch(/n'a aucun statut$/i)
  })
})
