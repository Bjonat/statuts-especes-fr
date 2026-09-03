import { describe, expect, it } from 'vitest'

// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { readFileSync } from 'node:fs'
// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { dirname, join } from 'node:path'
// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { fileURLToPath } from 'node:url'

import { REGIONS } from '../data-pipeline/regions.mjs'

const srcDir = dirname(fileURLToPath(import.meta.url))
const mainSource = readFileSync(join(srcDir, 'main.ts'), 'utf8')

function functionBody(source: string, name: string): string {
  const marker = `function ${name}(`
  const start = source.indexOf(marker)
  expect(start, `${name}() must exist`).toBeGreaterThan(-1)
  const openBrace = source.indexOf('{', start)
  expect(openBrace).toBeGreaterThan(-1)
  let depth = 0
  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return source.slice(openBrace, index + 1)
    }
  }
  throw new Error(`Could not extract ${name}() body`)
}

describe('PWA department selector wiring', () => {
  it('declares an explicit department state (null = whole region)', () => {
    expect(mainSource).toMatch(/department:\s*string\s*\|\s*null/)
    expect(mainSource).toMatch(/department:\s*readStoredDepartment\(/)
    expect(mainSource).not.toMatch(/department\?:\s*string/)
  })

  it('builds department options from REGIONS and starts with Toute la région', () => {
    expect(mainSource).toMatch(
      /import\s+\{[^}]*\bREGIONS\b[^}]*\}\s+from\s+['"]\.\.\/data-pipeline\/regions\.mjs['"]/,
    )
    const body = functionBody(mainSource, 'departmentOptions')
    expect(body).toMatch(/\bREGIONS\.find\b/)
    expect(body).toMatch(/region\?\.departments/)
    expect(body).toMatch(/Toute la région/)
    expect(body).toMatch(/value=""/)
    expect(REGIONS.find((region) => region.code === 'COR')?.departments).toEqual(['2A', '2B'])
    expect(REGIONS.find((region) => region.code === 'OCC')?.departments).toContain('31')
    expect(REGIONS.find((region) => region.code === 'OCC')?.departments).toContain('34')
  })

  it('renders the department selector on search and taxon detail, not on Sources', () => {
    expect(functionBody(mainSource, 'renderSearch')).toMatch(/departmentFieldMarkup\(/)
    expect(functionBody(mainSource, 'renderDetail')).toMatch(/departmentFieldMarkup\(/)
    expect(functionBody(mainSource, 'renderSources')).not.toMatch(/department/)
    expect(mainSource).toMatch(/for="department-select"/)
  })

  it('resets department when the region changes', () => {
    const body = functionBody(mainSource, 'changeRegion')
    expect(body).toMatch(/state\.department\s*=\s*null/)
    expect(body).toMatch(/localStorage\.removeItem\(\s*['"]department['"]\s*\)/)
  })

  it('persists a valid department and clears localStorage on Toute la région', () => {
    const body = functionBody(mainSource, 'changeDepartment')
    expect(body).toMatch(/assertDepartmentInRegion\(\s*state\.region/)
    expect(body).toMatch(/localStorage\.setItem\(\s*['"]department['"]/)
    expect(body).toMatch(/localStorage\.removeItem\(\s*['"]department['"]\s*\)/)
    expect(body).toMatch(/state\.department\s*=\s*null/)
    expect(body).toMatch(/state\.department\s*=\s*normalized/)
  })

  it('does not reload data or drop the selected taxon when the department changes', () => {
    const body = functionBody(mainSource, 'changeDepartment')
    expect(body).not.toMatch(/\bloadRealmData\b/)
    expect(body).not.toMatch(/\bloadTaxa\b/)
    expect(body).not.toMatch(/\bloadStatuses\b/)
    expect(body).not.toMatch(/\bfetch\s*\(/)
    expect(body).not.toMatch(/selectedTaxon/)
    expect(body).not.toMatch(/\bstate\.query\b/)
    expect(body).not.toMatch(/\bstate\.realm\b/)
    expect(body).not.toMatch(/\bstate\.taxa\b/)
    expect(body).not.toMatch(/\bstate\.statuses\b/)
    expect(body).toMatch(/\brender\s*\(\s*\)/)
  })

  it('shows resolver warnings and the department in the taxon context', () => {
    const body = functionBody(mainSource, 'renderDetail')
    expect(body).toMatch(/renderTerritoryNotices\(\s*result\.warnings\s*\)/)
    expect(body).toMatch(/département \$\{state\.department\}/)
    expect(body).toMatch(/aria-live="polite"/)
    expect(functionBody(mainSource, 'renderTerritoryNotices')).toMatch(/escapeHtml\(/)
    expect(functionBody(mainSource, 'renderTerritoryNotices')).toMatch(/territory-notice/)
  })

  it('ignores a stale stored department against the current region', () => {
    const body = functionBody(mainSource, 'readStoredDepartment')
    expect(body).toMatch(/localStorage\.getItem\(\s*['"]department['"]\s*\)/)
    expect(body).toMatch(/assertDepartmentInRegion\(\s*region/)
    expect(body).toMatch(/localStorage\.removeItem\(\s*['"]department['"]\s*\)/)
    expect(body).toMatch(/return null/)
  })
})
