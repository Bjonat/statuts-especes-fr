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
const viteSource = readFileSync(join(srcDir, '../vite.config.ts'), 'utf8')
const packageSource = readFileSync(join(srcDir, '../package.json'), 'utf8')

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

describe('PWA dataset update wiring', () => {
  it('renders a Version des données block on the offline screen', () => {
    expect(functionBody(mainSource, 'renderOffline')).toMatch(/renderDatasetVersionBlock/)
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/Version des données/)
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/Version active/)
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/shortDatasetVersion/)
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/formatDatasetDate/)
  })

  it('checks for updates without downloading catalogues or activating', () => {
    expect(functionBody(mainSource, 'checkDatasetUpdates')).toMatch(/checkForUpdate/)
    expect(functionBody(mainSource, 'checkDatasetUpdates')).not.toMatch(/prepareAndActivate/)
    expect(functionBody(mainSource, 'scheduleBackgroundUpdateCheck')).toMatch(/checkForUpdate/)
    expect(functionBody(mainSource, 'scheduleBackgroundUpdateCheck')).not.toMatch(/prepareAndActivate/)
    expect(functionBody(mainSource, 'enterLoadedStore')).toMatch(/scheduleBackgroundUpdateCheck/)
    expect(functionBody(mainSource, 'enterLoadedStore')).not.toMatch(/prepareAndActivate/)
  })

  it('exposes explicit update and cancel actions with progress', () => {
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/Mettre à jour/)
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/Vérifier les mises à jour/)
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/Annuler/)
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/Mise à jour…/)
    expect(functionBody(mainSource, 'bindOfflineActions')).toMatch(/#dataset-update/)
    expect(functionBody(mainSource, 'bindOfflineActions')).toMatch(/#dataset-cancel/)
    expect(functionBody(mainSource, 'bindOfflineActions')).toMatch(/#dataset-check/)
    expect(functionBody(mainSource, 'cancelDatasetUpdate')).toMatch(/datasetAbort\?\.abort\(/)
  })

  it('keeps the active version visible while staging a candidate', () => {
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/current\.generatedAt/)
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/current\.datasetVersion/)
    expect(functionBody(mainSource, 'startDatasetUpdate')).toMatch(/prepareAndActivate/)
    expect(functionBody(mainSource, 'startDatasetUpdate')).toMatch(/loadOfficialStoreFromActive/)
  })

  it('does not auto-activate a candidate and hides update UI in demo', () => {
    expect(functionBody(mainSource, 'scheduleBackgroundUpdateCheck')).not.toMatch(/prepareAndActivate/)
    expect(functionBody(mainSource, 'renderDatasetVersionBlock')).toMatch(/!current\.official \|\| !current\.updates/)
    expect(catalogSource).toMatch(/updates:\s*null/)
  })

  it('disables regional mutations while a dataset update is in progress', () => {
    expect(functionBody(mainSource, 'cacheMutationBusy')).toMatch(/datasetUpdating/)
    expect(functionBody(mainSource, 'cacheMutationBusy')).toMatch(/offlinePreparing/)
    expect(functionBody(mainSource, 'prepareOfflineRegion')).toMatch(/cacheMutationBusy\(\)/)
    expect(functionBody(mainSource, 'confirmRemoveOfflineRegion')).toMatch(/cacheMutationBusy\(\)/)
    expect(functionBody(mainSource, 'startDatasetUpdate')).toMatch(/cacheMutationBusy\(\)/)
    expect(functionBody(mainSource, 'renderOfflineRegionCard')).toMatch(/cacheMutationBusy\(\)/)
  })

  it('rebuilds the official store from the local active manifest after activation', () => {
    expect(functionBody(mainSource, 'startDatasetUpdate')).toMatch(/loadOfficialStoreFromActive/)
    expect(mainSource).toMatch(/Mise à jour installée/)
    expect(functionBody(mainSource, 'applyActivatedStore')).toMatch(/next\.offline\.inspect/)
    expect(functionBody(mainSource, 'applyActivatedStore')).not.toMatch(/loadDataStore/)
  })

  it('does not give Workbox runtime caches for dataset files', () => {
    expect(viteSource).toMatch(/registerType:\s*['"]autoUpdate['"]/)
    expect(viteSource).toMatch(/strategies:\s*['"]generateSW['"]/)
    expect(viteSource).not.toMatch(/injectManifest/)
    expect(viteSource).not.toMatch(/src\/sw\.ts/)
    expect(viteSource).toMatch(/globIgnores/)
    expect(viteSource).toMatch(/data\/\*\*/)
    expect(viteSource).not.toMatch(/statuts-data-manifest/)
    expect(viteSource).not.toMatch(/statuts-data-catalogs/)
    expect(viteSource).not.toMatch(/runtimeCaching/)
    expect(viteSource).not.toMatch(/NetworkFirst/)
    expect(viteSource).not.toMatch(/CacheFirst/)
    expect(viteSource).not.toMatch(/playwright/)
    expect(packageSource).toMatch(/@playwright\/test/)
    expect(packageSource).toMatch(/"test:e2e":\s*"playwright test"/)
    expect(packageSource).not.toMatch(/cypress/)
    expect(mainSource).not.toMatch(/@playwright\/test/)
  })
})
