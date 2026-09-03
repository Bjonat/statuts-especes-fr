import { describe, expect, it } from 'vitest'

// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { readFileSync } from 'node:fs'
// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { dirname, join } from 'node:path'
// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { fileURLToPath } from 'node:url'

const mainSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'main.ts'), 'utf8')

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

describe('PWA resolver wiring', () => {
  it('imports resolveStatuses as the only status filter and sort', () => {
    expect(mainSource).toMatch(/import\s+\{\s*resolveStatuses\s*\}\s+from\s+['"]\.\/resolve-statuses['"]/)
    expect(mainSource).not.toMatch(/\bSTATUS_ORDER\b/)
    expect(mainSource).not.toMatch(/\bfunction\s+usefulStatus\b/)
    expect(mainSource).not.toMatch(/\bfunction\s+sortedStatuses\b/)
    expect(mainSource).not.toMatch(/\bsortedStatuses\s*\(/)
    expect(mainSource).not.toMatch(/\busefulStatus\s*\(/)
  })

  it('calls resolveStatuses from renderDetail without a second filter or sort', () => {
    const body = functionBody(mainSource, 'renderDetail')
    expect(body).toMatch(/\bresolveStatuses\s*\(/)
    expect(body).toMatch(/cdRef:\s*taxon\.cdRef/)
    expect(body).toMatch(/region:\s*state\.region/)
    expect(body).toMatch(/department:\s*state\.department\s*\?\?\s*undefined/)
    expect(body).toMatch(/statuses:\s*state\.statuses/)
    expect(body).not.toMatch(/statuses:\s*state\.statuses\.filter/)
    expect(body).not.toMatch(/\bsortedStatuses\b/)
    expect(body).not.toMatch(/\busefulStatus\b/)
    expect(body).not.toMatch(/state\.statuses\.filter\s*\(/)
  })

  it('keeps territorial applicability out of the UI', () => {
    expect(mainSource).not.toMatch(/\bpartialScopeApplicability\b/)
    expect(mainSource).not.toMatch(/\bnormalizeTerritoryName\b/)
    expect(mainSource).not.toMatch(/Midi-Pyrénées/)
    expect(mainSource).not.toMatch(/Languedoc-Roussillon/)
    expect(mainSource).not.toMatch(/Aquitaine/)
  })
})
