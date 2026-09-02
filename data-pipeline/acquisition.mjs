/**
 * Machine à états d’acquisition.
 *
 * Frontière :
 * - `probe_ready_sources.py` observe / inspecte (HTML, ZIP, XLSX, ODS, CSV, maintenance).
 * - ce module normalise la signification d’une observation déjà faite.
 *
 * Il ne télécharge rien, n’inspecte pas d’octets et ne connaît pas les états
 * éditoriaux du registre (`IMPORTED`, `WITNESS`, …).
 */

export const ACQUISITION_STATES = Object.freeze({
  FETCH_OK: 'FETCH_OK',
  UNAVAILABLE: 'UNAVAILABLE',
  TYPE_MISMATCH: 'TYPE_MISMATCH',
  CHANGED_UNVERIFIED: 'CHANGED_UNVERIFIED',
  ARCHIVED_FALLBACK: 'ARCHIVED_FALLBACK',
})

export const ACQUISITION_ORIGINS = Object.freeze({
  CANONICAL: 'canonical',
  ARCHIVE: 'archive',
})

export const SHA_POLICIES = Object.freeze({
  PINNED: 'pinned',
  NONE: 'none',
})

const SUCCESS_STATES = new Set([ACQUISITION_STATES.FETCH_OK, ACQUISITION_STATES.ARCHIVED_FALLBACK])
const ACQUISITION_STATE_VALUES = new Set(Object.values(ACQUISITION_STATES))
const ORIGIN_VALUES = new Set(Object.values(ACQUISITION_ORIGINS))
const SHA256_HEX = /^[0-9a-f]{64}$/

const KIND_LABELS = Object.freeze({
  html: 'HTML',
  ods: 'ODS',
  xlsx: 'XLSX',
  xls: 'XLS',
  csv: 'CSV',
  zip: 'ZIP',
  'office-zip': 'ZIP Office',
})

function kindLabel(kind) {
  if (kind == null || kind === '') return 'fichier attendu'
  return KIND_LABELS[kind] ?? String(kind)
}

function normalizeOrigin(origin) {
  const value = origin ?? ACQUISITION_ORIGINS.CANONICAL
  if (!ORIGIN_VALUES.has(value)) {
    throw new Error(`origin d’acquisition inconnue: ${JSON.stringify(origin)}`)
  }
  return value
}

export function normalizeSha256(value, role = 'SHA-256') {
  if (value == null || value === '') return null
  const normalized = String(value).trim().toLowerCase()
  if (!SHA256_HEX.test(normalized)) {
    throw new Error(`${role} malformé: attendu 64 hexadécimales, reçu ${JSON.stringify(value)}`)
  }
  return normalized
}

function knownShaPolicy(observation) {
  const policy = observation.shaPolicy
  if (policy === SHA_POLICIES.NONE) return SHA_POLICIES.NONE
  if (policy === SHA_POLICIES.PINNED) return SHA_POLICIES.PINNED
  if (policy != null) {
    throw new Error(`shaPolicy inconnue: ${JSON.stringify(policy)} (pinned | none)`)
  }
  if (observation.expectedSha256) return SHA_POLICIES.PINNED
  return null
}

function resolveShaPolicy(observation) {
  const policy = knownShaPolicy(observation)
  if (policy) return policy
  throw new Error('shaPolicy manquant: préciser pinned (avec SHA) ou none')
}

function requirePinnedArchiveFallback(archive) {
  const policy = knownShaPolicy(archive)
  const expectedSha256 = normalizeSha256(archive.expectedSha256, 'SHA-256 attendu')
  if (policy === SHA_POLICIES.PINNED && expectedSha256) return expectedSha256
  throw new Error('archive fallback requires pinned SHA-256')
}

function assertPinnedArchiveSuccess(result) {
  if (
    result.state !== ACQUISITION_STATES.FETCH_OK ||
    result.shaPolicy !== SHA_POLICIES.PINNED ||
    !result.expectedSha256 ||
    !result.actualSha256 ||
    result.expectedSha256 !== result.actualSha256
  ) {
    throw new Error('archive fallback requires pinned SHA-256')
  }
}

function acquisitionResult(fields) {
  return Object.freeze({
    state: fields.state,
    ok: fields.ok,
    origin: fields.origin,
    reasonCode: fields.reasonCode,
    shaPolicy: fields.shaPolicy,
    expectedSha256: fields.expectedSha256,
    actualSha256: fields.actualSha256,
    expectedKind: fields.expectedKind,
    detectedKind: fields.detectedKind,
  })
}

function expectedKindOf(observation) {
  return observation.expectedKind ?? null
}

function detectedKindOf(observation) {
  return observation.detectedKind ?? null
}

/**
 * Classe une seule tentative (canonique ou archive), sans politique de fallback.
 * Ne retourne jamais ARCHIVED_FALLBACK.
 */
export function classifyCandidate(observation) {
  if (!observation || typeof observation !== 'object') {
    throw new Error('observation d’acquisition requise')
  }

  const origin = normalizeOrigin(observation.origin)
  const expectedKind = expectedKindOf(observation)
  const expectedSha256 = observation.expectedSha256
    ? normalizeSha256(observation.expectedSha256, 'SHA-256 attendu')
    : null
  const knownPolicy = knownShaPolicy(observation)

  if (observation.fetchOk !== true) {
    return acquisitionResult({
      state: ACQUISITION_STATES.UNAVAILABLE,
      ok: false,
      origin,
      reasonCode: observation.reasonCode ?? 'network_error',
      shaPolicy: knownPolicy,
      expectedSha256,
      actualSha256: null,
      expectedKind,
      detectedKind: null,
    })
  }

  if (observation.typeOk !== true && observation.typeOk !== false) {
    throw new Error('typeOk est requis (true|false) lorsqu’un contenu a été reçu')
  }

  if (observation.typeOk !== true) {
    return acquisitionResult({
      state: ACQUISITION_STATES.TYPE_MISMATCH,
      ok: false,
      origin,
      reasonCode: observation.reasonCode ?? 'unexpected_type',
      shaPolicy: knownPolicy,
      expectedSha256,
      actualSha256: normalizeSha256(observation.actualSha256, 'SHA-256 observé'),
      expectedKind,
      detectedKind: detectedKindOf(observation),
    })
  }

  const shaPolicy = resolveShaPolicy(observation)
  const detectedKind = detectedKindOf(observation)

  if (shaPolicy === SHA_POLICIES.PINNED) {
    if (!expectedSha256) {
      throw new Error('SHA-256 attendu requis pour une ressource pinée')
    }
    const actualSha256 = normalizeSha256(observation.actualSha256, 'SHA-256 observé')
    if (!actualSha256) {
      throw new Error('SHA-256 observé requis pour une ressource pinée de type valide')
    }
    if (actualSha256 !== expectedSha256) {
      return acquisitionResult({
        state: ACQUISITION_STATES.CHANGED_UNVERIFIED,
        ok: false,
        origin,
        reasonCode: 'sha_mismatch',
        shaPolicy,
        expectedSha256,
        actualSha256,
        expectedKind,
        detectedKind,
      })
    }
    return acquisitionResult({
      state: ACQUISITION_STATES.FETCH_OK,
      ok: true,
      origin,
      reasonCode: null,
      shaPolicy,
      expectedSha256,
      actualSha256,
      expectedKind,
      detectedKind,
    })
  }

  return acquisitionResult({
    state: ACQUISITION_STATES.FETCH_OK,
    ok: true,
    origin,
    reasonCode: null,
    shaPolicy,
    expectedSha256: null,
    actualSha256: normalizeSha256(observation.actualSha256, 'SHA-256 observé'),
    expectedKind,
    detectedKind,
  })
}

/**
 * Applique la politique d’acquisition, y compris le fallback archive.
 * CHANGED_UNVERIFIED canonique n’autorise jamais le fallback.
 */
export function resolveAcquisition({ canonical, archive } = {}) {
  if (!canonical) throw new Error('observation canonique requise')

  const canonicalResult = classifyCandidate({ ...canonical, origin: ACQUISITION_ORIGINS.CANONICAL })

  if (canonicalResult.state === ACQUISITION_STATES.FETCH_OK) {
    return canonicalResult
  }

  if (canonicalResult.state === ACQUISITION_STATES.CHANGED_UNVERIFIED) {
    return canonicalResult
  }

  if (!archive || archive.allowed !== true) {
    return canonicalResult
  }

  requirePinnedArchiveFallback(archive)

  if (archive.fetchOk !== true && archive.fetchOk !== false) {
    return canonicalResult
  }

  const archiveResult = classifyCandidate({ ...archive, origin: ACQUISITION_ORIGINS.ARCHIVE })
  if (archiveResult.state === ACQUISITION_STATES.FETCH_OK) {
    assertPinnedArchiveSuccess(archiveResult)
    return acquisitionResult({
      ...archiveResult,
      state: ACQUISITION_STATES.ARCHIVED_FALLBACK,
      ok: true,
      origin: ACQUISITION_ORIGINS.ARCHIVE,
      reasonCode: null,
      shaPolicy: SHA_POLICIES.PINNED,
    })
  }

  return archiveResult
}

export function isAcquisitionState(value) {
  return ACQUISITION_STATE_VALUES.has(value)
}

export function isAcquisitionSuccess(stateOrResult) {
  const state = typeof stateOrResult === 'string' ? stateOrResult : stateOrResult?.state
  return SUCCESS_STATES.has(state)
}

export function acquisitionExitCode(stateOrResult) {
  return isAcquisitionSuccess(stateOrResult) ? 0 : 1
}

export function formatAcquisitionResult(result) {
  if (!result || !isAcquisitionState(result.state)) {
    throw new Error(`résultat d’acquisition invalide: ${JSON.stringify(result?.state ?? result)}`)
  }

  switch (result.state) {
    case ACQUISITION_STATES.FETCH_OK:
      if (result.shaPolicy === SHA_POLICIES.PINNED) {
        return 'FETCH_OK: source canonique validée (SHA-256 conforme)'
      }
      return 'FETCH_OK: source canonique obtenue, type validé (SHA non piné)'
    case ACQUISITION_STATES.ARCHIVED_FALLBACK:
      return 'ARCHIVED_FALLBACK: archive validée utilisée'
    case ACQUISITION_STATES.UNAVAILABLE:
      return 'UNAVAILABLE: téléchargement impossible'
    case ACQUISITION_STATES.CHANGED_UNVERIFIED:
      return `CHANGED_UNVERIFIED: SHA différent pour un fichier de type valide (attendu ${result.expectedSha256}, observé ${result.actualSha256})`
    case ACQUISITION_STATES.TYPE_MISMATCH:
      if (result.reasonCode === 'maintenance_page') {
        return `TYPE_MISMATCH: page de maintenance reçue à la place d’un ${kindLabel(result.expectedKind)}`
      }
      return `TYPE_MISMATCH: ${kindLabel(result.detectedKind)} reçu à la place d’un ${kindLabel(result.expectedKind)}`
    default:
      throw new Error(`état d’acquisition non formaté: ${result.state}`)
  }
}
