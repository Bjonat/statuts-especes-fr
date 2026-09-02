import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  ACQUISITION_ORIGINS,
  ACQUISITION_STATES,
  SHA_POLICIES,
  acquisitionExitCode,
  classifyCandidate,
  formatAcquisitionResult,
  isAcquisitionState,
  isAcquisitionSuccess,
  normalizeSha256,
  resolveAcquisition,
} from './acquisition.mjs'

const ODS_SHA = createHash('sha256').update('fixture-ods').digest('hex')
const OTHER_SHA = createHash('sha256').update('fixture-other').digest('hex')
const ARCHIVE_SHA = createHash('sha256').update('fixture-archive').digest('hex')

function canonicalOk(overrides = {}) {
  return {
    origin: ACQUISITION_ORIGINS.CANONICAL,
    fetchOk: true,
    typeOk: true,
    expectedKind: 'ods',
    detectedKind: 'office-zip',
    expectedSha256: ODS_SHA,
    actualSha256: ODS_SHA,
    shaPolicy: SHA_POLICIES.PINNED,
    ...overrides,
  }
}

function archiveOk(overrides = {}) {
  return {
    allowed: true,
    origin: ACQUISITION_ORIGINS.ARCHIVE,
    fetchOk: true,
    typeOk: true,
    expectedKind: 'ods',
    detectedKind: 'office-zip',
    expectedSha256: ARCHIVE_SHA,
    actualSha256: ARCHIVE_SHA,
    shaPolicy: SHA_POLICIES.PINNED,
    ...overrides,
  }
}

test('les cinq états d’acquisition sont définis une seule fois', () => {
  assert.deepEqual(Object.values(ACQUISITION_STATES), [
    'FETCH_OK',
    'UNAVAILABLE',
    'TYPE_MISMATCH',
    'CHANGED_UNVERIFIED',
    'ARCHIVED_FALLBACK',
  ])
  for (const state of Object.values(ACQUISITION_STATES)) {
    assert.equal(isAcquisitionState(state), true)
  }
  assert.equal(isAcquisitionState('IMPORTED'), false)
  assert.equal(isAcquisitionState('WITNESS'), false)
  assert.equal(isAcquisitionState('READY'), false)
})

test('FETCH_OK et ARCHIVED_FALLBACK sont des succès ; les autres sont des échecs', () => {
  assert.equal(isAcquisitionSuccess(ACQUISITION_STATES.FETCH_OK), true)
  assert.equal(isAcquisitionSuccess(ACQUISITION_STATES.ARCHIVED_FALLBACK), true)
  assert.equal(isAcquisitionSuccess(ACQUISITION_STATES.UNAVAILABLE), false)
  assert.equal(isAcquisitionSuccess(ACQUISITION_STATES.TYPE_MISMATCH), false)
  assert.equal(isAcquisitionSuccess(ACQUISITION_STATES.CHANGED_UNVERIFIED), false)
  assert.equal(acquisitionExitCode(ACQUISITION_STATES.FETCH_OK), 0)
  assert.equal(acquisitionExitCode(ACQUISITION_STATES.ARCHIVED_FALLBACK), 0)
  assert.equal(acquisitionExitCode(ACQUISITION_STATES.UNAVAILABLE), 1)
  assert.equal(acquisitionExitCode(ACQUISITION_STATES.TYPE_MISMATCH), 1)
  assert.equal(acquisitionExitCode(ACQUISITION_STATES.CHANGED_UNVERIFIED), 1)
})

test('cas A — succès canonique : type OK et SHA attendu', () => {
  const result = resolveAcquisition({ canonical: canonicalOk() })
  assert.deepEqual(result, {
    state: ACQUISITION_STATES.FETCH_OK,
    ok: true,
    origin: 'canonical',
    reasonCode: null,
    expectedSha256: ODS_SHA,
    actualSha256: ODS_SHA,
    expectedKind: 'ods',
    detectedKind: 'office-zip',
  })
  assert.equal(isAcquisitionSuccess(result), true)
  assert.equal(formatAcquisitionResult(result), 'FETCH_OK: source canonique validée')
})

test('cas B — réseau indisponible : UNAVAILABLE sans SHA observé', () => {
  const result = resolveAcquisition({
    canonical: {
      fetchOk: false,
      reasonCode: 'timeout',
      expectedKind: 'ods',
      expectedSha256: ODS_SHA,
    },
  })
  assert.equal(result.state, ACQUISITION_STATES.UNAVAILABLE)
  assert.equal(result.ok, false)
  assert.equal(result.origin, 'canonical')
  assert.equal(result.reasonCode, 'timeout')
  assert.equal(result.actualSha256, null)
  assert.equal(result.expectedSha256, ODS_SHA)
  assert.equal(result.detectedKind, null)
  assert.equal(isAcquisitionSuccess(result), false)
  assert.equal(formatAcquisitionResult(result), 'UNAVAILABLE: téléchargement impossible')
})

test('cas C — HTML de maintenance à la place d’un ODS : TYPE_MISMATCH', () => {
  const result = resolveAcquisition({
    canonical: {
      fetchOk: true,
      typeOk: false,
      expectedKind: 'ods',
      detectedKind: 'html',
      reasonCode: 'maintenance_page',
      expectedSha256: ODS_SHA,
      actualSha256: OTHER_SHA,
    },
  })
  assert.equal(result.state, ACQUISITION_STATES.TYPE_MISMATCH)
  assert.equal(result.ok, false)
  assert.equal(result.reasonCode, 'maintenance_page')
  assert.equal(result.detectedKind, 'html')
  assert.equal(result.expectedKind, 'ods')
  const message = formatAcquisitionResult(result)
  assert.equal(message, 'TYPE_MISMATCH: page de maintenance reçue à la place d’un ODS')
  assert.equal(/SHA inattendu/i.test(message), false)
  assert.equal(message.includes(OTHER_SHA), false)
})

test('un HTML sans reasonCode de maintenance reste TYPE_MISMATCH, pas un SHA bizarre', () => {
  const result = classifyCandidate({
    fetchOk: true,
    typeOk: false,
    expectedKind: 'xlsx',
    detectedKind: 'html',
    expectedSha256: ODS_SHA,
    actualSha256: OTHER_SHA,
  })
  assert.equal(result.state, ACQUISITION_STATES.TYPE_MISMATCH)
  assert.equal(result.reasonCode, 'unexpected_type')
  const message = formatAcquisitionResult(result)
  assert.equal(message, 'TYPE_MISMATCH: HTML reçu à la place d’un XLSX')
  assert.equal(/SHA inattendu/i.test(message), false)
})

test('cas D — type correct mais SHA changé : CHANGED_UNVERIFIED fail-closed', () => {
  const result = resolveAcquisition({
    canonical: canonicalOk({ actualSha256: OTHER_SHA }),
  })
  assert.equal(result.state, ACQUISITION_STATES.CHANGED_UNVERIFIED)
  assert.equal(result.ok, false)
  assert.equal(result.reasonCode, 'sha_mismatch')
  assert.equal(result.actualSha256, OTHER_SHA)
  assert.equal(result.expectedSha256, ODS_SHA)
  assert.equal(isAcquisitionSuccess(result), false)
  assert.equal(acquisitionExitCode(result), 1)
  assert.match(formatAcquisitionResult(result), /^CHANGED_UNVERIFIED: SHA différent pour un fichier de type valide/)
})

test('cas E — canonique indisponible + archive validée : ARCHIVED_FALLBACK', () => {
  const result = resolveAcquisition({
    canonical: { fetchOk: false, expectedKind: 'ods', expectedSha256: ODS_SHA },
    archive: archiveOk(),
  })
  assert.equal(result.state, ACQUISITION_STATES.ARCHIVED_FALLBACK)
  assert.equal(result.ok, true)
  assert.equal(result.origin, 'archive')
  assert.equal(result.expectedSha256, ARCHIVE_SHA)
  assert.equal(result.actualSha256, ARCHIVE_SHA)
  assert.equal(isAcquisitionSuccess(result), true)
  assert.equal(formatAcquisitionResult(result), 'ARCHIVED_FALLBACK: archive validée utilisée')
})

test('cas E bis — TYPE_MISMATCH canonique peut basculer vers une archive validée', () => {
  const result = resolveAcquisition({
    canonical: {
      fetchOk: true,
      typeOk: false,
      expectedKind: 'ods',
      detectedKind: 'html',
      reasonCode: 'maintenance_page',
      expectedSha256: ODS_SHA,
    },
    archive: archiveOk(),
  })
  assert.equal(result.state, ACQUISITION_STATES.ARCHIVED_FALLBACK)
  assert.equal(result.origin, 'archive')
  assert.equal(result.ok, true)
})

test('cas F — archive SHA différent : bloquant, jamais ARCHIVED_FALLBACK', () => {
  const result = resolveAcquisition({
    canonical: { fetchOk: false, expectedKind: 'ods', expectedSha256: ODS_SHA },
    archive: archiveOk({ actualSha256: OTHER_SHA }),
  })
  assert.equal(result.state, ACQUISITION_STATES.CHANGED_UNVERIFIED)
  assert.equal(result.ok, false)
  assert.equal(result.origin, 'archive')
  assert.notEqual(result.state, ACQUISITION_STATES.ARCHIVED_FALLBACK)
  assert.equal(isAcquisitionSuccess(result), false)
})

test('cas G — archive mauvais type : bloquant, jamais ARCHIVED_FALLBACK', () => {
  const result = resolveAcquisition({
    canonical: { fetchOk: false, expectedKind: 'ods', expectedSha256: ODS_SHA },
    archive: {
      allowed: true,
      fetchOk: true,
      typeOk: false,
      expectedKind: 'ods',
      detectedKind: 'html',
      reasonCode: 'maintenance_page',
      expectedSha256: ARCHIVE_SHA,
    },
  })
  assert.equal(result.state, ACQUISITION_STATES.TYPE_MISMATCH)
  assert.equal(result.ok, false)
  assert.equal(result.origin, 'archive')
  assert.notEqual(result.state, ACQUISITION_STATES.ARCHIVED_FALLBACK)
})

test('cas H — SHA canonique changé + archive valide : pas de fallback', () => {
  const result = resolveAcquisition({
    canonical: canonicalOk({ actualSha256: OTHER_SHA }),
    archive: archiveOk(),
  })
  assert.equal(result.state, ACQUISITION_STATES.CHANGED_UNVERIFIED)
  assert.equal(result.origin, 'canonical')
  assert.equal(result.actualSha256, OTHER_SHA)
  assert.notEqual(result.state, ACQUISITION_STATES.ARCHIVED_FALLBACK)
  assert.equal(result.ok, false)
})

test('un fallback non autorisé n’est jamais utilisé', () => {
  const result = resolveAcquisition({
    canonical: { fetchOk: false, expectedKind: 'ods', expectedSha256: ODS_SHA },
    archive: archiveOk({ allowed: false }),
  })
  assert.equal(result.state, ACQUISITION_STATES.UNAVAILABLE)
  assert.equal(result.origin, 'canonical')
})

test('classifyCandidate ne retourne jamais ARCHIVED_FALLBACK', () => {
  const result = classifyCandidate(archiveOk())
  assert.equal(result.state, ACQUISITION_STATES.FETCH_OK)
  assert.equal(result.origin, 'archive')
})

test('la comparaison de SHA normalise la casse', () => {
  const result = classifyCandidate(canonicalOk({
    expectedSha256: ODS_SHA.toUpperCase(),
    actualSha256: ODS_SHA,
  }))
  assert.equal(result.state, ACQUISITION_STATES.FETCH_OK)
  assert.equal(result.expectedSha256, ODS_SHA)
  assert.equal(result.actualSha256, ODS_SHA)
})

test('un SHA attendu malformé est une erreur de contrat, pas un état d’acquisition', () => {
  assert.throws(
    () => classifyCandidate(canonicalOk({ expectedSha256: 'abc' })),
    /64 hexadécimales/,
  )
  assert.throws(
    () => normalizeSha256('not-a-sha', 'SHA-256 attendu'),
    /SHA-256 attendu malformé/,
  )
})

test('une ressource pinée n’accepte pas l’absence de SHA', () => {
  assert.throws(
    () => classifyCandidate(canonicalOk({ expectedSha256: null, shaPolicy: SHA_POLICIES.PINNED })),
    /SHA-256 attendu requis/,
  )
  assert.throws(
    () => classifyCandidate(canonicalOk({ actualSha256: null })),
    /SHA-256 observé requis/,
  )
})

test('une ressource sans politique SHA peut réussir si le type est valide', () => {
  const result = classifyCandidate({
    fetchOk: true,
    typeOk: true,
    expectedKind: 'csv',
    detectedKind: 'csv',
    shaPolicy: SHA_POLICIES.NONE,
  })
  assert.equal(result.state, ACQUISITION_STATES.FETCH_OK)
  assert.equal(result.expectedSha256, null)
  assert.equal(result.ok, true)
})

test('sans shaPolicy ni SHA attendu, le contrat refuse l’ambiguïté', () => {
  assert.throws(
    () => classifyCandidate({
      fetchOk: true,
      typeOk: true,
      expectedKind: 'csv',
      detectedKind: 'csv',
    }),
    /shaPolicy manquant/,
  )
})

test('typeOk est obligatoire dès qu’un contenu a été reçu', () => {
  assert.throws(
    () => classifyCandidate({ fetchOk: true, expectedKind: 'ods', expectedSha256: ODS_SHA }),
    /typeOk est requis/,
  )
})

test('deux classifications identiques sont déterministes', () => {
  const observation = canonicalOk()
  assert.deepEqual(classifyCandidate(observation), classifyCandidate(observation))
  assert.deepEqual(
    resolveAcquisition({ canonical: observation, archive: archiveOk() }),
    resolveAcquisition({ canonical: observation, archive: archiveOk() }),
  )
})
