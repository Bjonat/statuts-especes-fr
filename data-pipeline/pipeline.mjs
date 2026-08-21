import fs from 'node:fs'
import readline from 'node:readline'
import { REGIONS, resolveScope } from './regions.mjs'

const SEARCHABLE_RANKS = new Set(['ES', 'SSES', 'VAR', 'SVAR', 'FO', 'CAR', 'RACE', 'AGES'])

function normalizeHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase()
}

export function parseDelimitedLine(line, delimiter) {
  const values = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }

    if (character === delimiter && !quoted) {
      values.push(current)
      current = ''
      continue
    }

    current += character
  }

  values.push(current)
  return values
}

export function detectDelimiter(headerLine) {
  const candidates = ['\t', ';', ',']
  return candidates
    .map((delimiter) => ({ delimiter, count: parseDelimitedLine(headerLine, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter
}

export async function* rowsFromFile(filePath) {
  const input = fs.createReadStream(filePath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  let headers = null
  let delimiter = null

  for await (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    if (!headers) {
      delimiter = detectDelimiter(line)
      headers = parseDelimitedLine(line, delimiter).map(normalizeHeader)
      continue
    }

    if (!line.trim()) continue
    const values = parseDelimitedLine(line, delimiter)
    const row = {}
    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = values[index]?.trim() ?? ''
    }
    yield row
  }
}

function intValue(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function splitNames(value) {
  return [...new Set(String(value ?? '').split(/[;,]/).map((name) => name.trim()).filter(Boolean))]
}

function realmFromTaxref(row) {
  const kingdom = String(row.regne ?? '').trim().toLowerCase()
  if (kingdom === 'animalia') return 'fauna'
  if (kingdom === 'plantae') return 'flora'
  return null
}

export function isMetropolitanBiogeographicStatus(value) {
  const status = String(value ?? '').trim().toUpperCase()
  return Boolean(status) && !['A', 'Q'].includes(status)
}

export function isSearchableRank(value) {
  return SEARCHABLE_RANKS.has(String(value ?? '').trim().toUpperCase())
}

export async function buildTaxa(taxrefPath) {
  const accepted = new Map()
  const synonymsByRef = new Map()

  for await (const row of rowsFromFile(taxrefPath)) {
    const realm = realmFromTaxref(row)
    if (!realm) continue

    const cdNom = intValue(row.cd_nom)
    const cdRef = intValue(row.cd_ref)
    if (!cdNom || !cdRef) continue

    const label = String(row.lb_nom || row.nom_valide || row.nom_complet || '').trim()
    if (!label) continue

    if (cdNom === cdRef) {
      if (!isSearchableRank(row.rang)) continue
      accepted.set(cdRef, {
        cdRef,
        realm,
        scientificName: String(row.lb_nom || row.nom_valide || row.nom_complet).trim(),
        vernacularNames: splitNames(row.nom_vern),
        synonyms: [],
        family: String(row.famille || '').trim() || undefined,
        rank: String(row.rang || '').trim() || undefined,
        biogeographicStatus: String(row.fr || '').trim() || undefined,
        sourceId: 'taxref-v18',
      })
    } else {
      const synonyms = synonymsByRef.get(cdRef) ?? new Set()
      synonyms.add(label)
      synonymsByRef.set(cdRef, synonyms)
    }
  }

  for (const [cdRef, synonyms] of synonymsByRef) {
    const taxon = accepted.get(cdRef)
    if (!taxon) continue
    taxon.synonyms = [...synonyms].filter((name) => name !== taxon.scientificName).sort((a, b) => a.localeCompare(b, 'fr'))
  }

  return [...accepted.values()].sort((a, b) => a.scientificName.localeCompare(b.scientificName, 'fr'))
}

export function statusCategory(cdTypeStatut) {
  const code = String(cdTypeStatut ?? '').trim().toUpperCase()
  if (code === 'LRN') return 'red_list_national'
  if (code === 'LRR') return 'red_list_regional'
  if (code.startsWith('PNA')) return 'pna'
  if (code === 'PN' || code.startsWith('PN')) return 'protection_national'
  if (code === 'PR' || code.startsWith('PR')) return 'protection_regional'
  if (code.includes('ZDET') || code.includes('ZNIEFF')) return 'znieff'
  return 'other'
}

function compactLabel(value) {
  return String(value ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/<\/?(?:em|i|strong|b)>/gi, '')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function statusValue(row) {
  const code = compactLabel(row.code_statut)
  const label = compactLabel(row.label_statut)

  if (code && label && code.toLowerCase() !== label.toLowerCase()) {
    if (label.length > 72) return code
    return `${code} - ${label}`
  }

  if (code) return code
  if (label.length > 72) return 'Oui'
  return label || 'Oui'
}

export async function buildStatuses(bdcPath, knownTaxa) {
  const knownRefs = new Set(knownTaxa.map((taxon) => taxon.cdRef))
  const statuses = []
  const seen = new Set()

  for await (const row of rowsFromFile(bdcPath)) {
    const cdRef = intValue(row.cd_ref)
    if (!cdRef || !knownRefs.has(cdRef)) continue

    for (const region of REGIONS) {
      const scope = resolveScope(row.cd_sig, region)
      if (!scope) continue

      const category = statusCategory(row.cd_type_statut)
      const label = compactLabel(row.lb_type_statut || row.regroupement_type || row.cd_type_statut || 'Statut')
      const value = statusValue(row)
      const dedupeKey = [cdRef, region.code, category, label, value, row.cd_sig, row.cd_doc].join('|')
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      statuses.push({
        cdRef,
        region: region.code,
        category,
        label,
        value,
        sourceId: 'bdc-v18',
        scope: scope.scope,
        scopeLabel: scope.scopeLabel,
      })
    }
  }

  return statuses.sort((a, b) => a.cdRef - b.cdRef || a.region.localeCompare(b.region) || a.label.localeCompare(b.label, 'fr'))
}

export function filterTaxaForMetropolitanRegions(taxa, statuses) {
  const refsWithApplicableStatus = new Set(statuses.map((status) => status.cdRef))
  return taxa.filter(
    (taxon) => isMetropolitanBiogeographicStatus(taxon.biogeographicStatus) || refsWithApplicableStatus.has(taxon.cdRef),
  )
}

export function buildSources(checkedAt = new Date().toISOString().slice(0, 10)) {
  return [
    {
      id: 'taxref-v18',
      name: 'TAXREF',
      producer: 'PatriNat / INPN',
      version: 'v18',
      publicationYear: 2025,
      official: true,
      checkedAt,
    },
    {
      id: 'bdc-v18',
      name: 'BDC-Statuts',
      producer: 'PatriNat / SINP',
      version: 'v18',
      official: true,
      checkedAt,
    },
  ]
}

export function publicRegions() {
  return REGIONS.map(({ code, name }) => ({ code, name }))
}
