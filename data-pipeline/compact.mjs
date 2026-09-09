const SCOPE_CODES = {
  national: 0,
  regional: 1,
  partial: 2,
}

function definitionDocumentPayload(document) {
  const cdDoc = typeof document?.cdDoc === 'string' ? document.cdDoc.trim() : ''
  if (!cdDoc) return undefined

  const citation = typeof document.citation === 'string' ? document.citation.trim() : ''
  const url = typeof document.url === 'string' ? document.url.trim() : ''
  return {
    cdDoc,
    ...(citation ? { citation } : {}),
    ...(url ? { url } : {}),
  }
}

function definitionPayload(status) {
  const document = definitionDocumentPayload(status.document)
  return {
    category: status.category,
    label: status.label,
    value: status.value,
    sourceId: status.sourceId,
    ...(document ? { document } : {}),
  }
}

export function statusDefinitionKey(status) {
  return JSON.stringify(definitionPayload(status))
}

export function buildStatusDictionary(statuses) {
  const payloadByKey = new Map()
  for (const status of statuses) {
    const key = statusDefinitionKey(status)
    if (!payloadByKey.has(key)) payloadByKey.set(key, definitionPayload(status))
  }

  const keys = [...payloadByKey.keys()].sort()
  const definitions = keys.map((key) => payloadByKey.get(key))
  const definitionIds = new Map(keys.map((key, index) => [key, index]))
  return { definitions, definitionIds }
}

export function statusToCompactLink(status, definitionIds) {
  const definitionId = definitionIds.get(statusDefinitionKey(status))
  if (definitionId === undefined) throw new Error(`Définition de statut introuvable pour CD_REF ${status.cdRef}`)

  const scopeCode = SCOPE_CODES[status.scope]
  if (scopeCode === undefined) throw new Error(`Portée de statut inconnue : ${status.scope}`)

  if (status.scope === 'partial' && status.scopeLabel) {
    return [status.cdRef, definitionId, scopeCode, status.scopeLabel]
  }

  return [status.cdRef, definitionId, scopeCode]
}
