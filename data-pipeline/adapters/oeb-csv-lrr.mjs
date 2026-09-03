import { readFile } from 'node:fs/promises'
import {
  readCsvRows,
  resolveRow,
  rowValue,
  sha256Buffer,
  targetedReplacements,
  taxrefLookup,
  wantedFromRows,
} from './oeb-csv-common.mjs'

const CODE_FIELDS = ['CODE_NOM_TAXREF', 'CD_NOM']
const NAME_FIELDS = ['NOM_SCIENTIFIQUE_TAXREF', 'NOM_SCIEN_VALIDE']
const LRR_LABEL = 'Liste rouge régionale'

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
  if (source.categories?.[0] !== 'red_list_regional') {
    throw new Error(`Adaptateur oeb-csv-lrr : catégorie red_list_regional attendue pour ${source.id}`)
  }
  return { pipelineId, name, producer, version, publicationYear, region: source.region }
}

function sortedCountMap(counts) {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

export async function buildOebCsvLrr({ source, resource, taxrefPath, inputPath, checkedAt }) {
  const meta = requiredMeta(source, resource)
  const buffer = await readFile(inputPath)
  const rows = readCsvRows(buffer)
  const { codes, names } = wantedFromRows(rows, CODE_FIELDS, NAME_FIELDS)
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
  const years = {}
  const groups = {}
  const values = {}

  for (const row of rows) {
    const result = rowValue(row, 'RESULTAT_EVALUATION').toUpperCase()
    if (!result) continue
    stats.rows += 1
    const { cdRef, realm, mode } = resolveRow(row, byCdNom, acceptedNames, CODE_FIELDS, NAME_FIELDS)
    if (mode === 'excluded_realm') {
      stats.excluded_realm += 1
      continue
    }
    if (cdRef == null || realm == null) {
      stats[mode] += 1
      if (stats.unresolvedSample.length < 50) {
        stats.unresolvedSample.push({
          taxon: rowValue(row, 'NOM_SCIENTIFIQUE_TAXREF', 'NOM_VERNACULAIRE'),
          code: rowValue(row, 'CODE_NOM_TAXREF'),
          reason: mode,
        })
      }
      continue
    }
    stats.matched += 1
    stats[mode] += 1
    stats[realm] += 1
    const year = rowValue(row, 'ANNEE_EVALUATION') || 'inconnu'
    const group = rowValue(row, 'GROUPE_ESPECE') || 'inconnu'
    years[year] = (years[year] ?? 0) + 1
    groups[group] = (groups[group] ?? 0) + 1
    values[result] = (values[result] ?? 0) + 1
    const key = `${cdRef}|${realm}|${result}`
    if (seen.has(key)) continue
    seen.add(key)
    statuses.push({
      cdRef,
      region: meta.region,
      category: 'red_list_regional',
      label: LRR_LABEL,
      value: result,
      sourceId: meta.pipelineId,
      scope: 'regional',
      _realm: realm,
    })
  }

  const candidates = stats.matched + stats.unmatched + stats.ambiguous
  stats.matchRate = candidates ? Number((stats.matched / candidates).toFixed(6)) : 1
  stats.years = sortedCountMap(years)
  stats.groups = sortedCountMap(groups)
  stats.values = sortedCountMap(values)

  const publicStatuses = statuses
    .map(({ _realm, ...status }) => status)
    .sort((left, right) => left.cdRef - right.cdRef || left.value.localeCompare(right.value))

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
    replaces: targetedReplacements(statuses, meta.region, 'red_list_regional'),
    statuses: publicStatuses,
    diagnostics: stats,
  }
}

export function diagnosticsForOebCsvLrr(pkg) {
  const historical = pkg.diagnostics
  return {
    rowsRead: historical.rows,
    rowsResolved: historical.matched,
    resolvedByCode: historical.cd_nom,
    resolvedByName: historical.name,
    unresolved: historical.unmatched,
    ambiguous: historical.ambiguous,
    explicitlyIgnored: historical.excluded_realm,
    duplicatesDropped: historical.matched - pkg.statuses.length,
    realms: {
      flora: historical.flora,
      fauna: historical.fauna,
    },
    years: historical.years,
    groups: historical.groups,
    unresolvedSample: historical.unresolvedSample,
    matchRate: historical.matchRate,
  }
}
