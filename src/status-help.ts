import type { TaxonStatus } from './types'

/** Familles d'aide affichées à l'écologue (indépendantes des codes BDC bruts). */
export type StatusHelpFamily =
  | 'protection'
  | 'liste_rouge'
  | 'znieff'
  | 'directive'
  | 'pna'
  | 'reglementation'
  | 'patrimonial'
  | 'autre'

export interface StatusHelp {
  /** Famille lisible (protection, liste rouge…). */
  family: StatusHelpFamily
  familyLabel: string
  /** Titre principal : en général le libellé officiel déjà porté par la définition. */
  title: string
  /** Code BDC / UICN affiché tel quel, s'il est distinct du titre. */
  code?: string
  /** Explication courte ; peut être absente si seul le libellé officiel est disponible. */
  explanation?: string
  /** Origine de l'explication complémentaire (jamais une donnée réglementaire). */
  explanationSource: 'official_label' | 'glossary'
}

const FAMILY_LABELS: Record<StatusHelpFamily, string> = {
  protection: 'Protection',
  liste_rouge: 'Liste rouge',
  znieff: 'Déterminance ZNIEFF',
  directive: 'Directive européenne',
  pna: 'Plan national d’actions',
  reglementation: 'Réglementation / convention',
  patrimonial: 'Statut patrimonial',
  autre: 'Autre statut',
}

/**
 * Glossaire applicatif versionné — complémentaire aux libellés officiels.
 * Ne modifie jamais la valeur réglementaire affichée ; sert uniquement d'aide à la lecture.
 * Les formulations restent descriptives (pas de portée juridique inventée).
 */
const CODE_GLOSSARY: Record<string, string> = {
  // UICN
  EX: 'Éteint — plus aucun individu connu.',
  EW: 'Éteint à l’état sauvage.',
  RE: 'Disparu au niveau régional (évalué éteint sur le territoire concerné).',
  'CR*': 'En danger critique, probablement éteint au niveau considéré.',
  CR: 'En danger critique d’extinction.',
  EN: 'En danger d’extinction.',
  VU: 'Vulnérable.',
  NT: 'Quasi menacé — proche des seuils de menace.',
  LC: 'Préoccupation mineure — risque d’extinction faible au niveau considéré.',
  DD: 'Données insuffisantes pour évaluer le risque.',
  NA: 'Non applicable — critère d’évaluation non pertinent pour ce taxon.',
  NE: 'Non évalué.',
  // Directives
  CDH2: 'Directive Habitats — annexe II (espèces d’intérêt communautaire dont la conservation nécessite des zones spéciales de conservation).',
  CDH4: 'Directive Habitats — annexe IV (espèces strictement protégées).',
  CDH5: 'Directive Habitats — annexe V (espèces dont le prélèvement peut être soumis à gestion).',
  CDO1: 'Directive Oiseaux — annexe I (espèces faisant l’objet de mesures de conservation spéciales).',
  CDO21: 'Directive Oiseaux — annexe II, partie 1.',
  CDO22: 'Directive Oiseaux — annexe II, partie 2.',
  CDO31: 'Directive Oiseaux — annexe III, partie 1.',
  CDO32: 'Directive Oiseaux — annexe III, partie 2.',
  // Conventions
  IBE1: 'Convention de Berne — annexe I (espèces de flore strictement protégées).',
  IBE2: 'Convention de Berne — annexe II (espèces de faune strictement protégées).',
  IBE3: 'Convention de Berne — annexe III (espèces de faune protégées).',
  IBO1: 'Convention de Bonn — espèces migratrices menacées (appendice I).',
  IBO2: 'Convention de Bonn — espèces migratrices à protéger par accords (appendice II).',
}

/** Codes BDC de protection nationale du type N…2 / FRAR3 : le chiffre renvoie à l’article. */
const NATIONAL_PROTECTION_CODE = /^(?:NI|NO|NV|NP|NM|NMO|NMAMmar|NEC|NMam|FRAR|FMFR|OC|PN|PNTM)(\d+)$/i

function familyFromStatus(status: Pick<TaxonStatus, 'category' | 'label'>): StatusHelpFamily {
  const label = status.label.toLocaleLowerCase('fr')
  if (status.category === 'protection_national' || status.category === 'protection_regional') return 'protection'
  if (status.category === 'red_list_national' || status.category === 'red_list_regional') return 'liste_rouge'
  if (status.category === 'znieff') return 'znieff'
  if (status.category === 'pna') return 'pna'
  if (status.category === 'regional_responsibility' || status.category === 'rarity' || status.category === 'indigenous_status') {
    return 'patrimonial'
  }
  if (/directive/.test(label)) return 'directive'
  if (/convention|réglementation|reglementation/.test(label)) return 'reglementation'
  if (/protection/.test(label)) return 'protection'
  if (/liste rouge|uicn/.test(label)) return 'liste_rouge'
  if (/znieff/.test(label)) return 'znieff'
  return 'autre'
}

/** Extrait le code principal éventuellement présent en tête de valeur (`NI2`, `EN`, `CDH4 - …`). */
export function extractStatusCode(value: string): string | undefined {
  const cleaned = value.replace(/^true\s*-\s*/i, '').trim()
  const match = cleaned.match(/^([A-Za-z][A-Za-z0-9*_./-]{0,20})(?:\s|$|\s-\s)/)
  if (!match) return undefined
  const code = match[1]
  // Éviter de traiter un mot français courant comme un code.
  if (/^(Oui|Non|Déterminante|Remarquable|Complémentaire)$/i.test(code)) return undefined
  return code
}

function glossaryExplanation(code: string): string | undefined {
  const direct = CODE_GLOSSARY[code] ?? CODE_GLOSSARY[code.toUpperCase()]
  if (direct) return direct

  const nationalProtection = code.match(NATIONAL_PROTECTION_CODE)
  if (nationalProtection) {
    return (
      `Code BDC de protection nationale, article ${nationalProtection[1]}. ` +
      `Le détail des interdictions figure dans l’arrêté de protection du groupe concerné ; ` +
      `cette aide ne remplace pas le texte réglementaire.`
    )
  }

  if (/^(?:RV|RI|DV|PV)\d+/i.test(code)) {
    return (
      `Code BDC de protection régionale ou départementale. ` +
      `Il renvoie à une liste officielle locale ; consulter l’arrêté pour le détail.`
    )
  }

  if (/^IBO[A-Z0-9]+$/i.test(code)) {
    return 'Code BDC lié à la convention de Bonn (espèces migratrices).'
  }

  return undefined
}

/**
 * Construit une fiche d'aide pour un statut affiché.
 * Toujours basé sur le libellé officiel ; le glossaire ne complète que le code.
 */
export function buildStatusHelp(status: Pick<TaxonStatus, 'category' | 'label' | 'value'>): StatusHelp {
  const family = familyFromStatus(status)
  const title = status.label.trim() || FAMILY_LABELS[family]
  const code = extractStatusCode(status.value)
  const glossary = code ? glossaryExplanation(code) : undefined

  // Si la valeur porte déjà un libellé après "CODE - texte", on peut s'en servir.
  const valueDetail = status.value.includes(' - ')
    ? status.value.split(/\s-\s/).slice(1).join(' - ').replace(/^true\s*/i, '').trim()
    : ''

  let explanation = glossary
  let explanationSource: StatusHelp['explanationSource'] = glossary ? 'glossary' : 'official_label'

  if (!explanation && valueDetail && valueDetail.toLocaleLowerCase('fr') !== title.toLocaleLowerCase('fr')) {
    explanation = valueDetail
    explanationSource = 'official_label'
  }

  if (!explanation && family === 'znieff') {
    explanation =
      'Espèce retenue comme déterminante (ou associée) pour l’inventaire ZNIEFF sur le territoire indiqué. ' +
      'Cela ne constitue pas à lui seul un statut de protection réglementaire.'
    explanationSource = 'glossary'
  }

  if (!explanation && family === 'liste_rouge') {
    explanation = 'Catégorie d’une liste rouge (UICN ou déclinaison régionale) pour le territoire concerné.'
    explanationSource = 'glossary'
  }

  return {
    family,
    familyLabel: FAMILY_LABELS[family],
    title,
    code: code && code !== title ? code : undefined,
    explanation,
    explanationSource,
  }
}

export function statusHelpFamilyLabel(family: StatusHelpFamily): string {
  return FAMILY_LABELS[family]
}

/** Message affiché lorsqu’aucun statut n’est lié au taxon pour le territoire choisi. */
export const NO_IDENTIFIED_STATUS_MESSAGE =
  'Aucun statut identifié dans les référentiels actuellement intégrés pour ce territoire.'

/**
 * Nettoie la valeur affichée sans altérer le code réglementaire.
 * Retire le préfixe technique BDC `true - ` parfois présent sur les booléens.
 */
export function formatStatusValueForDisplay(rawValue: string): string {
  const value = rawValue.replace(/^true\s*-\s*/i, '').trim()
  if (value.length <= 72) return value

  const codeMatch = value.match(/^([A-Z0-9._*/-]{1,16})\s+-\s+/)
  return codeMatch?.[1] ?? 'Oui'
}
