import { describe, expect, it } from 'vitest'

// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { readFileSync } from 'node:fs'
// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { dirname, join } from 'node:path'
// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { fileURLToPath } from 'node:url'

const srcDir = dirname(fileURLToPath(import.meta.url))
const mainSource = readFileSync(join(srcDir, 'main.ts'), 'utf8')
const catalogSource = readFileSync(join(srcDir, 'catalog.ts'), 'utf8')
const offlineSource = readFileSync(join(srcDir, 'offline-data.ts'), 'utf8')
const viteSource = readFileSync(join(srcDir, '../vite.config.ts'), 'utf8')

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

describe('PWA offline data wiring', () => {
  it('declares an offline screen and a home action in official mode only', () => {
    expect(mainSource).toMatch(/screen:\s*'home'\s*\|\s*'sources'\s*\|\s*'offline'/)
    expect(functionBody(mainSource, 'render')).toMatch(/state\.screen\s*===\s*['"]offline['"]/)
    expect(functionBody(mainSource, 'renderRealmChoice')).toMatch(/Données hors ligne/)
    expect(functionBody(mainSource, 'renderRealmChoice')).toMatch(/dataMode\.state\s*===\s*['"]official['"]/)
    expect(functionBody(mainSource, 'renderRealmChoice')).toMatch(/#open-offline/)
    expect(functionBody(mainSource, 'openOffline')).toMatch(/state\.screen\s*=\s*['"]offline['"]/)
  })

  it('does not call primeOffline and inspects cache on official store entry', () => {
    expect(mainSource).not.toMatch(/\bprimeOffline\b/)
    expect(catalogSource).not.toMatch(/\bprimeOffline\b/)
    const enter = functionBody(mainSource, 'enterLoadedStore')
    expect(enter).toMatch(/next\.offline\.inspect\s*\(/)
    expect(enter).not.toMatch(/prepareRegion/)
    expect(enter).not.toMatch(/fetch\(/)
  })

  it('renders ready, partial and missing region states with the expected actions', () => {
    const card = functionBody(mainSource, 'renderOfflineRegionCard')
    expect(card).toMatch(/Disponible hors ligne/)
    expect(card).toMatch(/Téléchargement incomplet/)
    expect(card).toMatch(/À télécharger/)
    expect(card).toMatch(/Télécharger/)
    expect(card).toMatch(/Reprendre/)
    expect(card).toMatch(/Annuler/)
    expect(card).toMatch(/Supprimer/)
    expect(card).toMatch(/consultableOffline/)
    expect(functionBody(mainSource, 'renderOffline')).toMatch(/Actualiser/)
    expect(functionBody(mainSource, 'refreshOfflineScreen')).toMatch(/inspectOfflineCache/)
    expect(functionBody(mainSource, 'refreshOfflineScreen')).not.toMatch(/prepareRegion/)
  })

  it('exposes a regional badge and never a global Hors ligne prêt label', () => {
    const badge = functionBody(mainSource, 'offlineBadgeText')
    expect(badge).toMatch(/Aucune région hors ligne/)
    expect(badge).toMatch(/régions hors ligne/)
    expect(badge).toMatch(/Hors ligne :/)
    expect(badge).toMatch(/readyRegionCount/)
    expect(mainSource).not.toMatch(/Hors ligne prêt/)
    expect(badge).toMatch(/dataMode\.state\s*===\s*['"]demo['"]\)\s*return\s*['"]Démonstration['"]/)
  })

  it('does not persist regional readiness in localStorage', () => {
    expect(mainSource).not.toMatch(/offlineDatasetVersion/)
    expect(mainSource).not.toMatch(/offlineRegions/)
    expect(catalogSource).not.toMatch(/offlineDatasetVersion/)
    expect(offlineSource).not.toMatch(/localStorage/)
    expect(offlineSource).not.toMatch(/offlineDatasetVersion/)
  })

  it('allows a single prepare at a time and aborts when leaving the screen', () => {
    expect(functionBody(mainSource, 'prepareOfflineRegion')).toMatch(/state\.offlinePreparing/)
    expect(functionBody(mainSource, 'prepareOfflineRegion')).toMatch(/if \(!manager \|\| state\.offlinePreparing\) return/)
    expect(functionBody(mainSource, 'closeOffline')).toMatch(/offlineAbort\?\.abort\(/)
    expect(functionBody(mainSource, 'cancelOfflinePrepare')).toMatch(/offlineAbort\?\.abort\(/)
  })

  it('lists regions from the loaded store / inventory rather than a hardcoded extra table', () => {
    expect(functionBody(mainSource, 'renderOffline')).toMatch(/inventory\.regions/)
    expect(functionBody(mainSource, 'renderOfflineRegionCard')).toMatch(/store\(\)\.regions/)
  })

  it('does not block online realm loading on offline inventory', () => {
    expect(functionBody(mainSource, 'loadRealmData')).not.toMatch(/offlineInventory/)
    expect(functionBody(mainSource, 'loadRealmData')).not.toMatch(/consultableOffline/)
    expect(functionBody(mainSource, 'confirmRemoveOfflineRegion')).not.toMatch(/state\.taxa/)
    expect(functionBody(mainSource, 'confirmRemoveOfflineRegion')).not.toMatch(/state\.statuses/)
  })

  it('does not estimate volumes with HEAD and leaves Workbox unchanged', () => {
    expect(offlineSource).not.toMatch(/['"]HEAD['"]/)
    expect(mainSource).not.toMatch(/method:\s*['"]HEAD['"]/)
    expect(viteSource).toMatch(/registerType:\s*['"]autoUpdate['"]/)
    expect(viteSource).toMatch(/maxEntries:\s*40/)
    expect(viteSource).toMatch(/statuts-data-catalogs/)
  })
})
