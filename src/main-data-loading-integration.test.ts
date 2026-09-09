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

describe('PWA official data loading wiring', () => {
  it('treats available, download_required and recoverable_error without auto-demo', () => {
    expect(mainSource).toMatch(/import\s+\{[^}]*\bloadDataStore\b[^}]*\}\s+from\s+['"]\.\/catalog['"]/)
    expect(mainSource).toMatch(/import\s+\{[^}]*\bcreateDemoDataStore\b[^}]*\}\s+from\s+['"]\.\/catalog['"]/)
    expect(functionBody(mainSource, 'applyLoadResult')).toMatch(/result\.state\s*===\s*['"]available['"]/)
    expect(functionBody(mainSource, 'applyLoadResult')).toMatch(/enterLoadedStore\(\s*['"]official['"]/)
    expect(functionBody(mainSource, 'render')).toMatch(/download_required/)
    expect(functionBody(mainSource, 'render')).toMatch(/recoverable_error/)
    expect(functionBody(mainSource, 'applyLoadResult')).not.toMatch(/createDemoDataStore/)
    expect(functionBody(mainSource, 'start')).not.toMatch(/createDemoDataStore/)
    expect(functionBody(mainSource, 'retryOfficialData')).not.toMatch(/createDemoDataStore/)
  })

  it('opens demonstration only from an explicit button labeled démonstration', () => {
    expect(functionBody(mainSource, 'openDemonstration')).toMatch(/createDemoDataStore\s*\(/)
    expect(functionBody(mainSource, 'bindBootstrapActions')).toMatch(/#open-demo/)
    expect(functionBody(mainSource, 'bootstrapActionsMarkup')).toMatch(/Ouvrir la démonstration/)
    expect(mainSource).not.toMatch(/localStorage\.setItem\(\s*['"]demo/)
  })

  it('never shows Hors ligne prêt in demo mode and offers a return to official data', () => {
    expect(functionBody(mainSource, 'offlineBadgeText')).toMatch(/Démonstration/)
    expect(functionBody(mainSource, 'offlineBadgeText')).not.toMatch(/Hors ligne prêt[\s\S]*demo/)
    expect(functionBody(mainSource, 'offlineBadgeText')).toMatch(/dataMode\.state\s*===\s*['"]demo['"]\)\s*return\s*['"]Démonstration['"]/)
    expect(functionBody(mainSource, 'renderDataNotice')).toMatch(/Réessayer les données officielles/)
    expect(functionBody(mainSource, 'bindDataNoticeActions')).toMatch(/retryOfficialData/)
  })
})
