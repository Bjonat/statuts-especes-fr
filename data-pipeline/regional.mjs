import fs from 'node:fs/promises'
import path from 'node:path'

const REALMS = new Set(['flora', 'fauna'])

function replacementKey(region, category, realm) {
  return `${region}|${category}|${realm}`
}

export function validateRegionalPackage(pkg, fileName = '<regional>') {
  if (!pkg || pkg.schemaVersion !== 1) throw new Error(`${fileName}: schemaVersion régional invalide`)
  if (!pkg.source?.id || !pkg.source?.name || !pkg.source?.producer || !pkg.source?.version) {
    throw new Error(`${fileName}: métadonnées de source régionale incomplètes`)
  }
  if (pkg.source.official !== true) throw new Error(`${fileName}: la source régionale doit être marquée officielle`)
  if (!Array.isArray(pkg.replaces) || !Array.isArray(pkg.statuses)) {
    throw new Error(`${fileName}: replaces/statuses doivent être des tableaux`)
  }

  const replacementKeys = new Set()
  for (const replacement of pkg.replaces) {
    if (!replacement?.region || !replacement?.category || !REALMS.has(replacement?.realm)) {
      throw new Error(`${fileName}: règle de remplacement invalide`)
    }
    replacementKeys.add(replacementKey(replacement.region, replacement.category, replacement.realm))
  }

  for (const status of pkg.statuses) {
    if (!Number.isInteger(status?.cdRef) || status.cdRef <= 0) throw new Error(`${fileName}: CD_REF régional invalide`)
    if (!status.region || !status.category || !status.label || !status.value) throw new Error(`${fileName}: statut régional incomplet`)
    if (status.sourceId !== pkg.source.id) throw new Error(`${fileName}: sourceId d’un statut différent de la source du paquet`)
    if (!['national', 'regional', 'partial'].includes(status.scope)) throw new Error(`${fileName}: portée régionale invalide`)
  }

  return pkg
}

export async function loadRegionalPackages(directory) {
  if (!directory) return []
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }

  const packages = []
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
    const filePath = path.join(directory, entry.name)
    const pkg = JSON.parse(await fs.readFile(filePath, 'utf8'))
    packages.push(validateRegionalPackage(pkg, entry.name))
  }
  return packages
}

export function mergeRegionalPackages(baseStatuses, taxa, packages) {
  if (!packages.length) return { statuses: baseStatuses, sources: [], diagnostics: [] }

  const realmByRef = new Map(taxa.map((taxon) => [taxon.cdRef, taxon.realm]))
  const replacementKeys = new Set()
  for (const pkg of packages) {
    for (const replacement of pkg.replaces) {
      replacementKeys.add(replacementKey(replacement.region, replacement.category, replacement.realm))
    }
  }

  const statuses = baseStatuses.filter((status) => {
    const realm = realmByRef.get(status.cdRef)
    if (!realm) return true
    return !replacementKeys.has(replacementKey(status.region, status.category, realm))
  })

  const diagnostics = []
  for (const pkg of packages) {
    let imported = 0
    let unknownRefs = 0
    for (const status of pkg.statuses) {
      if (!realmByRef.has(status.cdRef)) {
        unknownRefs += 1
        continue
      }
      statuses.push(status)
      imported += 1
    }
    diagnostics.push({ sourceId: pkg.source.id, imported, unknownRefs })
  }

  const seen = new Set()
  const deduplicated = statuses.filter((status) => {
    const key = [status.cdRef, status.region, status.category, status.label, status.value, status.sourceId, status.scope, status.scopeLabel ?? ''].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  deduplicated.sort((a, b) => a.cdRef - b.cdRef || a.region.localeCompare(b.region) || a.category.localeCompare(b.category))
  return {
    statuses: deduplicated,
    sources: packages.map((pkg) => pkg.source),
    diagnostics,
  }
}
