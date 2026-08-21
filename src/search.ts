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

function scoreCandidate(query: string, candidate: string): number | null {
  const normalized = normalizeSearch(candidate)
  if (!normalized) return null
  if (normalized === query) return 0
  if (normalized.startsWith(query)) return 10 + Math.min(normalized.length - query.length, 50) / 100

  const index = normalized.indexOf(query)
  if (index >= 0) return 20 + index / 100

  const maxDistance = Math.max(1, Math.floor(query.length * 0.2))
  const tokens = normalized.split(' ')
  const distance = Math.min(levenshtein(query, normalized), ...tokens.map((token) => levenshtein(query, token)))
  if (distance <= maxDistance) return 30 + distance

  return null
}

export function searchTaxa(taxa: Taxon[], realm: Realm, rawQuery: string, limit = 12): Taxon[] {
  const query = normalizeSearch(rawQuery)
  if (query.length < 2) return []

  return taxa
    .filter((taxon) => taxon.realm === realm)
    .map((taxon) => {
      const candidates = [taxon.scientificName, ...taxon.vernacularNames, ...taxon.synonyms]
      const scores = candidates
        .map((candidate) => scoreCandidate(query, candidate))
        .filter((score): score is number => score !== null)

      return { taxon, score: scores.length ? Math.min(...scores) : null }
    })
    .filter((entry): entry is { taxon: Taxon; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.taxon.scientificName.localeCompare(b.taxon.scientificName, 'fr'))
    .slice(0, limit)
    .map(({ taxon }) => taxon)
}
