export const DIAGNOSTIC_SCHEMA_VERSION = 1
export const QUALITY_STATUSES = new Set(['pass', 'fail', 'not_configured'])

function isNonNegativeFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function validateQualityConfig(quality, sourceId = '<source>') {
  if (quality == null) return quality
  if (typeof quality !== 'object' || Array.isArray(quality)) {
    throw new Error(`${sourceId} : bloc quality invalide`)
  }
  for (const key of ['minResolutionRate', 'expectedResolutionRate']) {
    if (quality[key] == null) continue
    if (typeof quality[key] !== 'number' || !Number.isFinite(quality[key]) || quality[key] < 0 || quality[key] > 1) {
      throw new Error(`Seuil invalide: ${key}=${quality[key]}`)
    }
  }
  for (const key of ['minStatuses', 'expectedStatuses']) {
    if (quality[key] == null) continue
    if (!Number.isInteger(quality[key]) || quality[key] < 0) {
      throw new Error(`Seuil invalide: ${key}=${quality[key]}`)
    }
  }
  if (quality.requiredCategories != null && !Array.isArray(quality.requiredCategories)) {
    throw new Error(`${sourceId} : requiredCategories doit être un tableau`)
  }
  if (quality.sentinels != null) {
    if (!Array.isArray(quality.sentinels)) {
      throw new Error(`${sourceId} : sentinels doit être un tableau`)
    }
    quality.sentinels.forEach((sentinel, index) => validateSentinelConfig(sentinel, sourceId, index))
  }
  return quality
}

const SENTINEL_SCOPES = new Set(['national', 'regional', 'partial'])

export function validateSentinelConfig(sentinel, sourceId = '<source>', index = 0) {
  const where = `${sourceId} : sentinelle #${index}`
  if (!sentinel || typeof sentinel !== 'object' || Array.isArray(sentinel)) {
    throw new Error(`${where} : objet attendu`)
  }
  if (!Number.isInteger(sentinel.cdRef) || sentinel.cdRef <= 0) {
    throw new Error(`${where} : cdRef entier strictement positif obligatoire`)
  }
  if (sentinel.category != null && (typeof sentinel.category !== 'string' || !sentinel.category.trim())) {
    throw new Error(`${where} : category doit être une chaîne non vide`)
  }
  if (sentinel.value != null && (typeof sentinel.value !== 'string' || !sentinel.value.trim())) {
    throw new Error(`${where} : value doit être une chaîne non vide`)
  }
  if (sentinel.scope != null && !SENTINEL_SCOPES.has(sentinel.scope)) {
    throw new Error(`${where} : scope invalide (${sentinel.scope})`)
  }
  if (sentinel.note != null && typeof sentinel.note !== 'string') {
    throw new Error(`${where} : note doit être une chaîne`)
  }
  return sentinel
}

function countCategories(statuses) {
  const counts = {}
  for (const status of statuses) {
    const category = status?.category
    if (!category) continue
    counts[category] = (counts[category] ?? 0) + 1
  }
  return counts
}

function statusMatchesSentinel(status, sentinel) {
  for (const key of ['cdRef', 'category', 'value', 'scope']) {
    if (sentinel[key] != null && status[key] !== sentinel[key]) return false
  }
  return true
}

function checkResult(id, actual, operator, expected, passed) {
  return { id, actual, operator, expected, passed }
}

export function evaluateSourceQuality({ source, pkg, metrics }) {
  const quality = source.quality
  if (quality == null) {
    return { status: 'not_configured', checks: [], failures: [] }
  }
  validateQualityConfig(quality, source.id)

  const checks = []
  if (quality.minResolutionRate != null) {
    checks.push(
      checkResult(
        'minResolutionRate',
        metrics.resolutionRate,
        '>=',
        quality.minResolutionRate,
        metrics.resolutionRate >= quality.minResolutionRate,
      ),
    )
  }
  if (quality.minStatuses != null) {
    checks.push(
      checkResult(
        'minStatuses',
        metrics.statusesProduced,
        '>=',
        quality.minStatuses,
        metrics.statusesProduced >= quality.minStatuses,
      ),
    )
  }
  for (const category of quality.requiredCategories ?? []) {
    const actual = metrics.categories[category] ?? 0
    checks.push(checkResult(`requiredCategory:${category}`, actual, '>', 0, actual > 0))
  }
  for (const sentinel of quality.sentinels ?? []) {
    const present = (pkg.statuses ?? []).some((status) => statusMatchesSentinel(status, sentinel))
    checks.push(checkResult(`sentinel:${sentinel.cdRef}`, present, 'present', true, present))
  }

  const failures = checks.filter((check) => !check.passed)
  return {
    status: failures.length ? 'fail' : 'pass',
    checks,
    failures,
  }
}

export function buildSourceDiagnostic({ source, resource, package: pkg, adapterMetrics }) {
  const rowsResolved = adapterMetrics.rowsResolved
  const unresolved = adapterMetrics.unresolved
  const ambiguous = adapterMetrics.ambiguous
  const rowsConsidered = rowsResolved + unresolved + ambiguous
  const resolutionRate = rowsConsidered ? Number((rowsResolved / rowsConsidered).toFixed(6)) : 1
  if (adapterMetrics.matchRate != null && resolutionRate !== adapterMetrics.matchRate) {
    throw new Error(`resolutionRate ${resolutionRate} ≠ matchRate historique ${adapterMetrics.matchRate}`)
  }

  const statusesProduced = pkg.statuses.length
  const metrics = {
    rowsRead: adapterMetrics.rowsRead,
    rowsConsidered,
    rowsResolved,
    resolvedByCode: adapterMetrics.resolvedByCode,
    resolvedByName: adapterMetrics.resolvedByName,
    unresolved,
    ambiguous,
    explicitlyIgnored: adapterMetrics.explicitlyIgnored,
    duplicatesDropped: adapterMetrics.duplicatesDropped,
    statusesProduced,
    relationsProduced: statusesProduced,
    resolutionRate,
    realms: { ...adapterMetrics.realms },
    categories: countCategories(pkg.statuses),
  }

  const qualityConfig = source.quality
  const baseline = {}
  if (qualityConfig?.expectedStatuses != null) {
    baseline.expectedStatuses = qualityConfig.expectedStatuses
    baseline.statusesDelta = statusesProduced - qualityConfig.expectedStatuses
  }
  if (qualityConfig?.expectedResolutionRate != null) {
    baseline.expectedResolutionRate = qualityConfig.expectedResolutionRate
    baseline.resolutionRateDelta = Number((resolutionRate - qualityConfig.expectedResolutionRate).toFixed(6))
  }

  const quality = evaluateSourceQuality({ source, pkg, metrics })

  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    sourceId: source.id,
    packageSourceId: pkg.source.id,
    adapter: source.adapter,
    region: source.region,
    checkedAt: pkg.source.checkedAt,
    input: {
      sha256: pkg.source.sha256,
    },
    metrics,
    observations: {
      years: adapterMetrics.years ?? [],
      groups: adapterMetrics.groups ?? [],
      unresolvedSample: adapterMetrics.unresolvedSample ?? [],
    },
    baseline,
    quality,
  }
}

export function validateSourceDiagnostic(diagnostic) {
  if (!diagnostic || diagnostic.schemaVersion !== 1) {
    throw new Error('Diagnostic : schemaVersion invalide')
  }
  if (!diagnostic.sourceId || !diagnostic.packageSourceId || !diagnostic.adapter || !diagnostic.region) {
    throw new Error('Diagnostic : identité incomplète')
  }
  if (!/^[a-f0-9]{64}$/.test(diagnostic.input?.sha256 ?? '')) {
    throw new Error('Diagnostic : SHA-256 d’entrée invalide')
  }
  const metrics = diagnostic.metrics
  if (!metrics || typeof metrics !== 'object') throw new Error('Diagnostic : metrics manquant')
  for (const key of [
    'rowsRead',
    'rowsConsidered',
    'rowsResolved',
    'resolvedByCode',
    'resolvedByName',
    'unresolved',
    'ambiguous',
    'explicitlyIgnored',
    'duplicatesDropped',
    'statusesProduced',
    'relationsProduced',
    'resolutionRate',
  ]) {
    if (!isNonNegativeFinite(metrics[key])) throw new Error(`Diagnostic : métrique invalide (${key})`)
  }
  if (metrics.resolutionRate > 1) throw new Error('Diagnostic : resolutionRate hors [0,1]')
  for (const key of ['realms', 'categories']) {
    const counts = metrics[key]
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) {
      throw new Error(`Diagnostic : ${key} doit être un objet`)
    }
    for (const [name, value] of Object.entries(counts)) {
      if (!isNonNegativeFinite(value)) throw new Error(`Diagnostic : ${key}.${name} invalide`)
    }
  }
  if (!QUALITY_STATUSES.has(diagnostic.quality?.status)) {
    throw new Error('Diagnostic : quality.status invalide')
  }
  if (!Array.isArray(diagnostic.quality.checks) || !Array.isArray(diagnostic.quality.failures)) {
    throw new Error('Diagnostic : checks/failures doivent être des tableaux')
  }
  return diagnostic
}

export function formatQualityLog(diagnostic) {
  const { sourceId, metrics, quality } = diagnostic
  if (quality.status === 'fail') {
    const detail = quality.failures
      .map((check) => `${check.id} ${check.actual} ${check.operator} ${check.expected}`.trim())
      .join('; ')
    return `QUALITY FAIL ${sourceId}: ${detail}`
  }
  if (quality.status === 'not_configured') {
    return `QUALITY NOT_CONFIGURED ${sourceId}: ${metrics.statusesProduced} statuses, resolutionRate=${metrics.resolutionRate}`
  }
  return `QUALITY PASS ${sourceId}: ${metrics.statusesProduced} statuses, resolutionRate=${metrics.resolutionRate}`
}
