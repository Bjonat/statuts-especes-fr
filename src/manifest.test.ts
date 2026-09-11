import { describe, expect, it } from 'vitest'
import { isCoverageDatasetFile, isDataManifest, parseDataManifest } from './manifest'
import type { DataManifest } from './types'
import { METROPOLITAN_REGION_CODES } from './types'

const regions = METROPOLITAN_REGION_CODES.map((code) => ({ code, name: code }))
const file = (name: string) => ({ file: `${name}-aaaaaaaaaaaa.json`, count: 0, bytes: 2 })

function legacyManifest(): DataManifest {
  return {
    schemaVersion: 3,
    official: true,
    generatedAt: '2026-09-08T10:00:00.000Z',
    datasetVersion: 'legacy-v3',
    taxrefVersion: '18',
    bdcVersion: '18',
    regions,
    sources: [],
    files: {
      taxa: { flora: file('taxa-flora'), fauna: file('taxa-fauna') },
      statusDefinitions: file('status-definitions'),
      statusLinks: Object.fromEntries(
        ['flora', 'fauna'].map((realm) => [
          realm,
          Object.fromEntries(regions.map(({ code }) => [code, file(`status-links-${realm}-${code.toLowerCase()}`)])),
        ]),
      ),
    },
  }
}

function coverageFile(overrides: Record<string, unknown> = {}) {
  return {
    file: 'source-coverage-bbbbbbbbbbbb.json',
    count: 2,
    bytes: 12,
    schemaVersion: 1 as const,
    ...overrides,
  }
}

describe('isDataManifest sourceCoverage', () => {
  it('accepte un manifeste v3 historique sans sourceCoverage', () => {
    const manifest = legacyManifest()
    expect(manifest.files.sourceCoverage).toBeUndefined()
    expect(isDataManifest(manifest)).toBe(true)
    expect(parseDataManifest(manifest)).toEqual(manifest)
  })

  it('accepte un manifeste v3 avec sourceCoverage valide', () => {
    const manifest = {
      ...legacyManifest(),
      datasetVersion: 'with-coverage',
      files: {
        ...legacyManifest().files,
        sourceCoverage: coverageFile(),
      },
    }
    expect(isDataManifest(manifest)).toBe(true)
    expect(parseDataManifest(manifest)?.files.sourceCoverage?.schemaVersion).toBe(1)
  })

  it('rejette un descriptor sourceCoverage mal formé', () => {
    const manifest = {
      ...legacyManifest(),
      files: {
        ...legacyManifest().files,
        sourceCoverage: { file: 'not-a-hashed-name.json', count: 1, schemaVersion: 1 },
      },
    }
    expect(isDataManifest(manifest)).toBe(false)
    expect(parseDataManifest(manifest)).toBeNull()
  })

  it('rejette un schemaVersion de couverture invalide', () => {
    const manifest = {
      ...legacyManifest(),
      files: {
        ...legacyManifest().files,
        sourceCoverage: coverageFile({ schemaVersion: 2 }),
      },
    }
    expect(isDataManifest(manifest)).toBe(false)
    expect(isCoverageDatasetFile(coverageFile({ schemaVersion: 2 }))).toBe(false)
  })

  it('rejette un nom qui n’est pas source-coverage-<hash>', () => {
    expect(isCoverageDatasetFile(coverageFile({ file: 'taxa-flora-bbbbbbbbbbbb.json' }))).toBe(false)
  })
})
