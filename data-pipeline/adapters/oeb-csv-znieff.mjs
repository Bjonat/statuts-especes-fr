import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import readline from 'node:readline'
import { parseDelimitedLine } from '../pipeline.mjs'

const REALM_BY_KINGDOM = { animalia: 'fauna', plantae: 'flora' }
const CODE_FIELDS = ['CD_NOM']
const NAME_FIELDS = ['NOM_SCIEN_VALIDE', 'NOM_SCIENTIFIQUE_TAXREF']
const ZNIEFF_LABEL = 'Déterminante ZNIEFF'
const ZNIEFF_VALUE = 'Oui'

export function normalizeTaxrefText(value) {
  const text = String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/×/g, 'x')
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function rowValue(row, ...names) {
  const lowered = {}
  for (const [key, value] of Object.entries(row)) {
    lowered[String(key).trim().toLowerCase()] = String(value ?? '').trim()
  }
  for (const name of names) {
    const value = lowered[name.toLowerCase()] ?? ''
    if (value) return value
  }
  return ''
}

function decodeCsvBytes(buffer) {
  for (const encoding of ['utf-8', 'windows-1252', 'iso-8859-1']) {
    try {
      const text = new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(buffer)
      return text.replace(/^\uFEFF/, '')
    } catch {
      continue
    }
  }
  throw new Error('Impossible de décoder le CSV ZNIEFF')
}

function sniffDelimiter(text) {
  const sample = text.slice(0, 16_000)
  const lines = sample.split(/\r?\n/).filter((line) => line.length > 0)
  let best = ';'
  let bestScore = 0
  for (const delimiter of [';', '\t', ',', '|']) {
    const counts = lines.slice(0, 12).map((line) => parseDelimitedLine(line, delimiter).length)
    if (!counts.length || counts[0] < 2) continue
    const consistent = counts.every((count) => count === counts[0])
    const score = (consistent ? counts[0] * 100 : counts[0]) + counts.length
    if (score > bestScore) {
      bestScore = score
      best = delimiter
    }
  }
  return best
}

export function readCsvRows(buffer) {
  const text = decodeCsvBytes(buffer)
  const delimiter = sniffDelimiter(text)
  const lines = text.split(/\r?\n/)
  const headerLine = lines.find((line) => line.length > 0)
  if (!headerLine) return []
  const headers = parseDelimitedLine(headerLine, delimiter)
  const rows = []
  let seenHeader = false
  for (const line of lines) {
    if (!seenHeader) {
      if (line === headerLine) seenHeader = true
      continue
    }
    if (!line.length) continue
    const values = parseDelimitedLine(line, delimiter)
    const row = {}
    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = values[index] ?? ''
    }
    rows.push(row)
  }
  return rows
}

function wantedFromRows(rows) {
  const codes = new Set()
  const names = new Set()
  for (const row of rows) {
    const code = rowValue(row, ...CODE_FIELDS)
    if (/^\d+$/.test(code)) codes.add(Number.parseInt(code, 10))
    for (const field of NAME_FIELDS) {
      const name = rowValue(row, field)
      if (name) names.add(normalizeTaxrefText(name))
    }
  }
  return { codes, names }
}

async function taxrefLookup(taxrefPath, wantedCodes, wantedNames) {
  const byCdNom = new Map()
  const acceptedNames = new Map()
  const input = createReadStream(taxrefPath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  let headers = null

  for await (const rawLine of lines) {
    const line = rawLine.replace(/^\uFEFF/, '').replace(/\r$/, '')
    if (!headers) {
      headers = parseDelimitedLine(line, '\t').map((header) => header.trim())
      continue
    }
    if (!line) continue
    const values = parseDelimitedLine(line, '\t')
    const row = {}
    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = values[index] ?? ''
    }
    const cdNomRaw = String(row.CD_NOM ?? '').trim()
    const cdRefRaw = String(row.CD_REF ?? '').trim()
    if (!/^\d+$/.test(cdNomRaw) || !/^\d+$/.test(cdRefRaw)) continue
    const cdNom = Number.parseInt(cdNomRaw, 10)
    const cdRef = Number.parseInt(cdRefRaw, 10)
    const realm = REALM_BY_KINGDOM[normalizeTaxrefText(row.REGNE)] ?? null
    if (wantedCodes.has(cdNom)) byCdNom.set(cdNom, [cdRef, realm])
    if (realm && wantedNames.size) {
      for (const field of ['LB_NOM', 'NOM_COMPLET', 'NOM_VALIDE']) {
        const label = row[field]
        if (!label) continue
        const key = normalizeTaxrefText(label)
        if (!wantedNames.has(key)) continue
        if (!acceptedNames.has(key)) acceptedNames.set(key, new Map())
        acceptedNames.get(key).set(`${cdRef}|${realm}`, [cdRef, realm])
      }
    }
  }

  return { byCdNom, acceptedNames }
}

function resolveRow(row, byCdNom, acceptedNames) {
  const code = rowValue(row, ...CODE_FIELDS)
  if (/^\d+$/.test(code)) {
    const mapped = byCdNom.get(Number.parseInt(code, 10))
    if (mapped) {
      const [cdRef, realm] = mapped
      if (realm) return { cdRef, realm, mode: 'cd_nom' }
      return { cdRef: null, realm: null, mode: 'excluded_realm' }
    }
  }

  for (const field of NAME_FIELDS) {
    const name = rowValue(row, field)
    if (!name) continue
    const candidates = acceptedNames.get(normalizeTaxrefText(name))
    const size = candidates?.size ?? 0
    if (size === 1) {
      const [cdRef, realm] = candidates.values().next().value
      return { cdRef, realm, mode: 'name' }
    }
    if (size > 1) return { cdRef: null, realm: null, mode: 'ambiguous' }
  }
  return { cdRef: null, realm: null, mode: 'unmatched' }
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function requiredMeta(source, resource) {
  const pipelineId = resource.pipelineId
  const name = source.name
  const producer = source.producer
  const version = resource.version
  const publicationYear = resource.publicationYear
  if (!pipelineId) throw new Error(`Ressource ${source.id} : pipelineId manquant`)
  if (!name || !producer || !version) throw new Error(`Source ${source.id} : métadonnées incomplètes`)
  if (!Number.isInteger(publicationYear)) throw new Error(`Source ${source.id} : publicationYear manquant`)
  if (source.official !== true) throw new Error(`Source ${source.id} : official doit être true`)
  if (!source.region) throw new Error(`Source ${source.id} : region manquante`)
  if (source.categories?.[0] !== 'znieff') {
    throw new Error(`Adaptateur oeb-csv-znieff : catégorie znieff attendue pour ${source.id}`)
  }
  return { pipelineId, name, producer, version, publicationYear, region: source.region }
}

export async function buildOebCsvZnieff({ source, resource, taxrefPath, inputPath, checkedAt }) {
  const meta = requiredMeta(source, resource)
  const buffer = await readFile(inputPath)
  const rows = readCsvRows(buffer)
  const { codes, names } = wantedFromRows(rows)
  const { byCdNom, acceptedNames } = await taxrefLookup(taxrefPath, codes, names)

  const stats = {
    rows: 0,
    matched: 0,
    cd_nom: 0,
    name: 0,
    excluded_realm: 0,
    unmatched: 0,
    ambiguous: 0,
    flora: 0,
    fauna: 0,
    unresolvedSample: [],
  }
  const statuses = []
  const seen = new Set()
  const years = new Set()
  const groups = new Set()

  for (const row of rows) {
    stats.rows += 1
    const { cdRef, realm, mode } = resolveRow(row, byCdNom, acceptedNames)
    if (mode === 'excluded_realm') {
      stats.excluded_realm += 1
      continue
    }
    if (cdRef == null || realm == null) {
      stats[mode] += 1
      if (stats.unresolvedSample.length < 50) {
        stats.unresolvedSample.push({
          taxon: rowValue(row, 'NOM_SCIEN_VALIDE', 'NOM_FRANCAIS'),
          code: rowValue(row, 'CD_NOM'),
          reason: mode,
        })
      }
      continue
    }
    stats.matched += 1
    stats[mode] += 1
    stats[realm] += 1
    const year = rowValue(row, 'ANNEE_EVALUATION')
    if (year) years.add(year)
    const group = rowValue(row, 'GROUP1_INPN', 'GROUP2_INPN', 'LISTE_ZNIEFF')
    if (group) groups.add(group)
    const key = `${cdRef}|${realm}`
    if (seen.has(key)) continue
    seen.add(key)
    statuses.push({
      cdRef,
      region: meta.region,
      category: 'znieff',
      label: ZNIEFF_LABEL,
      value: ZNIEFF_VALUE,
      sourceId: meta.pipelineId,
      scope: 'regional',
      _realm: realm,
    })
  }

  const candidates = stats.matched + stats.unmatched + stats.ambiguous
  stats.matchRate = candidates ? Number((stats.matched / candidates).toFixed(6)) : 1
  stats.years = [...years].sort((left, right) => left.localeCompare(right))
  stats.groups = [...groups].sort((left, right) => left.localeCompare(right))

  const replacements = []
  for (const realm of ['flora', 'fauna']) {
    const refs = [...new Set(statuses.filter((status) => status._realm === realm).map((status) => status.cdRef))].sort(
      (left, right) => left - right,
    )
    if (refs.length) {
      replacements.push({ region: meta.region, category: 'znieff', realm, cdRefs: refs })
    }
  }

  const publicStatuses = statuses
    .map(({ _realm, ...status }) => status)
    .sort((left, right) => left.cdRef - right.cdRef || left.category.localeCompare(right.category))

  return {
    schemaVersion: 1,
    source: {
      id: meta.pipelineId,
      name: meta.name,
      producer: meta.producer,
      version: meta.version,
      publicationYear: meta.publicationYear,
      official: true,
      checkedAt,
      sha256: sha256Buffer(buffer),
    },
    replaces: replacements,
    statuses: publicStatuses,
    diagnostics: stats,
  }
}
