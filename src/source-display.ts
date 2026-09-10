import type { SourceDataset, TaxonStatus } from './types'

/** Affiché lorsqu’aucun SourceDataset ne correspond exactement à status.sourceId. */
export const MISSING_STATUS_SOURCE_MESSAGE =
  'Métadonnées de source indisponibles pour ce statut.'

export type StatusSourceFieldKey =
  | 'name'
  | 'producer'
  | 'version'
  | 'publicationYear'
  | 'checkedAt'
  | 'official'

export interface StatusSourceField {
  key: StatusSourceFieldKey
  label: string
  value: string
}

export type StatusSourceView =
  | { state: 'found'; source: SourceDataset; fields: StatusSourceField[] }
  | { state: 'missing'; sourceId: string; message: typeof MISSING_STATUS_SOURCE_MESSAGE }

/**
 * Relie un statut à sa source uniquement par sourceId === SourceDataset.id.
 * Aucune correspondance par catégorie, libellé, valeur, région ou ordre.
 */
export function findStatusSource(
  status: Pick<TaxonStatus, 'sourceId'>,
  sources: readonly SourceDataset[],
): SourceDataset | null {
  return sources.find((source) => source.id === status.sourceId) ?? null
}

export function formatSourceCheckedAt(value?: string): string | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return `${match[3]}/${match[2]}/${match[1]}`
}

export function statusSourceFields(source: SourceDataset): StatusSourceField[] {
  const fields: StatusSourceField[] = [
    { key: 'name', label: 'Source', value: source.name },
    { key: 'producer', label: 'Producteur', value: source.producer },
    { key: 'version', label: 'Version', value: source.version },
  ]

  if (source.publicationYear !== undefined) {
    fields.push({
      key: 'publicationYear',
      label: 'Année de publication',
      value: String(source.publicationYear),
    })
  }

  const checkedAt = formatSourceCheckedAt(source.checkedAt)
  if (checkedAt) {
    fields.push({ key: 'checkedAt', label: 'Vérifié le', value: checkedAt })
  }

  if (source.official) {
    fields.push({ key: 'official', label: 'Caractère', value: 'Référentiel officiel' })
  }

  return fields
}

export function statusSourceView(
  status: Pick<TaxonStatus, 'sourceId'>,
  sources: readonly SourceDataset[],
): StatusSourceView {
  const source = findStatusSource(status, sources)
  if (!source) {
    return {
      state: 'missing',
      sourceId: status.sourceId,
      message: MISSING_STATUS_SOURCE_MESSAGE,
    }
  }
  return { state: 'found', source, fields: statusSourceFields(source) }
}

export interface StatusDocumentView {
  cdDoc: string
  citation?: string
  href?: string
}

/**
 * Accepte uniquement http(s). Ne construit jamais d’URL depuis cdDoc.
 * Conservé tel quel (pas de normalisation) lorsqu’il est valide.
 */
export function safeDocumentHref(url?: string): string | null {
  const trimmed = String(url ?? '').trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed
  } catch {
    return null
  }
  return null
}

export function statusDocumentView(
  status: Pick<TaxonStatus, 'document'>,
): StatusDocumentView | null {
  const evidence = status.document
  const cdDoc = typeof evidence?.cdDoc === 'string' ? evidence.cdDoc.trim() : ''
  if (!cdDoc || !evidence) return null

  const citation = typeof evidence.citation === 'string' ? evidence.citation.trim() : ''
  const href = safeDocumentHref(evidence.url)
  return {
    cdDoc,
    ...(citation ? { citation } : {}),
    ...(href ? { href } : {}),
  }
}

/**
 * Présentation uniquement. Ne réécrit pas status.document.citation.
 * Retourne du texte, jamais du HTML à injecter.
 */
export function formatDocumentCitationForDisplay(citation: string): string {
  return String(citation ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
