import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import readline from 'node:readline'
import { parseDelimitedLine } from '../pipeline.mjs'

const REALM_BY_KINGDOM = { animalia: 'fauna', plantae: 'flora' }

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
  throw new Error('Impossible de décoder le CSV')
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

export function wantedFromRows(rows, codeFields, nameFields) {
  const codes = new Set()
  const names = new Set()
  for (const row of rows) {
    const code = rowValue(row, ...codeFields)
    if (/^\d+$/.test(code)) codes.add(Number.parseInt(code, 10))
    for (const field of nameFields) {
      const name = rowValue(row, field)
      if (name) names.add(normalizeTaxrefText(name))
    }
  }
  return { codes, names }
}

export async function taxrefLookup(taxrefPath, wantedCodes, wantedNames) {
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

export function resolveRow(row, byCdNom, acceptedNames, codeFields, nameFields) {
  const code = rowValue(row, ...codeFields)
  if (/^\d+$/.test(code)) {
    const mapped = byCdNom.get(Number.parseInt(code, 10))
    if (mapped) {
      const [cdRef, realm] = mapped
      if (realm) return { cdRef, realm, mode: 'cd_nom' }
      return { cdRef: null, realm: null, mode: 'excluded_realm' }
    }
  }

  for (const field of nameFields) {
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

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function targetedReplacements(statuses, region, category) {
  const replacements = []
  for (const realm of ['flora', 'fauna']) {
    const refs = [...new Set(statuses.filter((status) => status._realm === realm).map((status) => status.cdRef))].sort(
      (left, right) => left - right,
    )
    if (refs.length) {
      replacements.push({ region, category, realm, cdRefs: refs })
    }
  }
  return replacements
}
