import type { Realm, Taxon } from './types'

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  const current = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution)
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]
  }

  return previous[b.length]
}

function tokenScore(queryToken: string, candidateToken: string): number | null {
  if (candidateToken === queryToken) return 0
  if (candidateToken.startsWith(queryToken)) return 1 + Math.min(candidateToken.length - queryToken.length, 20) / 100
  if (queryToken.length < 4) return null

  const maxDistance = Math.max(1, Math.floor(queryToken.length * 0.2))
  const distance = levenshtein(queryToken, candidateToken)
  return distance <= maxDistance ? 5 + distance : null
}

function scoreCandidate(query: string, normalized: string): number | null {
  if (!normalized) return null
  if (normalized === query) return 0
  if (normalized.startsWith(query)) return 10 + Math.min(normalized.length - query.length, 50) / 100

  const index = normalized.indexOf(query)
  if (index >= 0) return 20 + index / 100

  const queryTokens = query.split(' ')
  const candidateTokens = normalized.split(' ')
  let tokenTotal = 0

  for (const queryToken of queryTokens) {
    const scores = candidateTokens
      .map((candidateToken) => tokenScore(queryToken, candidateToken))
      .filter((score): score is number => score !== null)

    if (!scores.length) return null
    tokenTotal += Math.min(...scores)
  }

  return 30 + tokenTotal
}

interface SearchIndex {
  normalizedNames: string[][]
  byPrefix: Map<string, number[]>
}

const indexCache = new WeakMap<Taxon[], SearchIndex>()

function buildSearchIndex(taxa: Taxon[]): SearchIndex {
  const normalizedNames: string[][] = []
  const byPrefix = new Map<string, number[]>()

  taxa.forEach((taxon, taxonIndex) => {
    const names = [...new Set([taxon.scientificName, ...taxon.vernacularNames, ...taxon.synonyms])]
      .map(normalizeSearch)
      .filter(Boolean)
    normalizedNames.push(names)

    const prefixes = new Set<string>()
    for (const name of names) {
      for (const token of name.split(' ')) {
        if (token.length < 2) continue
        prefixes.add(`${taxon.realm}:${token.slice(0, 2)}`)
      }
    }

    for (const prefix of prefixes) {
      const indices = byPrefix.get(prefix)
      if (indices) indices.push(taxonIndex)
      else byPrefix.set(prefix, [taxonIndex])
    }
  })

  return { normalizedNames, byPrefix }
}

function getSearchIndex(taxa: Taxon[]): SearchIndex {
  const cached = indexCache.get(taxa)
  if (cached) return cached
  const created = buildSearchIndex(taxa)
  indexCache.set(taxa, created)
  return created
}

function candidateIndices(index: SearchIndex, realm: Realm, query: string): number[] {
  const queryTokens = query.split(' ').filter((token) => token.length >= 2)
  if (!queryTokens.length) return []

  const lists = queryTokens
    .map((token) => index.byPrefix.get(`${realm}:${token.slice(0, 2)}`) ?? [])
    .sort((a, b) => a.length - b.length)

  if (!lists[0]?.length) return []
  if (lists.length === 1) return lists[0]

  let candidates = new Set(lists[0])
  for (const list of lists.slice(1)) {
    const allowed = new Set(list)
    candidates = new Set([...candidates].filter((taxonIndex) => allowed.has(taxonIndex)))
    if (!candidates.size) break
  }

  return [...candidates]
}

export function searchTaxa(taxa: Taxon[], realm: Realm, rawQuery: string, limit = 12): Taxon[] {
  const query = normalizeSearch(rawQuery)
  if (query.length < 2) return []

  const index = getSearchIndex(taxa)
  const candidates = candidateIndices(index, realm, query)

  return candidates
    .map((taxonIndex) => {
      const scores = index.normalizedNames[taxonIndex]
        .map((candidate) => scoreCandidate(query, candidate))
        .filter((score): score is number => score !== null)

      return { taxon: taxa[taxonIndex], score: scores.length ? Math.min(...scores) : null }
    })
    .filter((entry): entry is { taxon: Taxon; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.taxon.scientificName.localeCompare(b.taxon.scientificName, 'fr'))
    .slice(0, limit)
    .map(({ taxon }) => taxon)
}
