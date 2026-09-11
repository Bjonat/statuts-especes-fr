import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'

export const ORIGIN = process.env.E2E_ORIGIN || 'http://127.0.0.1:4177'

export const METADATA_CACHE = 'statuts-data-metadata'
export const LEGACY_MANIFEST_CACHE = 'statuts-data-manifest'
export const LEGACY_CATALOG_CACHE = 'statuts-data-catalogs'
export const CATALOG_PREFIX = 'statuts-data-catalogs-v-'

export type CacheInventory = {
  names: string[]
  details: Record<string, string[]>
}

export type ActiveManifest = {
  datasetVersion: string
  generatedAt: string
} | null

export function attachSameOriginGuard(page: Page, origin = ORIGIN): void {
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:') return
    if (url.origin !== origin) {
      throw new Error(`Requête hors origine E2E interdite : ${request.url()}`)
    }
  })
}

export async function resetServer(request: APIRequestContext): Promise<void> {
  const response = await request.post('/__test__/reset')
  expect(response.ok()).toBeTruthy()
}

export async function setDataset(request: APIRequestContext, dataset: string): Promise<void> {
  const response = await request.post('/__test__/state', { data: { dataset } })
  expect(response.ok(), await response.text()).toBeTruthy()
}

export async function clearRequestLog(request: APIRequestContext): Promise<void> {
  const response = await request.post('/__test__/clear-requests')
  expect(response.ok()).toBeTruthy()
}

export async function dataRequests(request: APIRequestContext): Promise<string[]> {
  const response = await request.get('/__test__/requests')
  expect(response.ok()).toBeTruthy()
  const body = (await response.json()) as { requests: { path: string }[] }
  return body.requests.map((item) => item.path)
}

export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    const registration = await navigator.serviceWorker.ready
    return Boolean(registration.active)
  })
}

export async function ensureControlled(page: Page): Promise<void> {
  await waitForServiceWorker(page)
  const hasController = await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
  if (!hasController) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForServiceWorker(page)
  }
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

export async function openPwa(page: Page): Promise<void> {
  attachSameOriginGuard(page)
  await page.goto('/', { waitUntil: 'load' })
}

export async function expectOfficialHome(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /Que recherchez-vous/ })).toBeVisible()
  await expect(page.getByText('Démonstration', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Données hors ligne' })).toBeVisible()
}

export async function expectOfficialReady(page: Page): Promise<void> {
  await expectOfficialHome(page)
  await waitForServiceWorker(page)
}

export async function readCacheInventory(page: Page): Promise<CacheInventory> {
  return page.evaluate(async () => {
    const names = await caches.keys()
    const details: Record<string, string[]> = {}
    for (const name of names) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      details[name] = keys.map((entry) => new URL(entry.url).pathname.replace(/^\//, ''))
    }
    return { names, details }
  })
}

export async function readManifestFromCache(page: Page, kind: 'active' | 'previous'): Promise<ActiveManifest> {
  const path = kind === 'active' ? 'data/__active-manifest__' : 'data/__previous-manifest__'
  return page.evaluate(async (manifestPath) => {
    const cache = await caches.open('statuts-data-metadata')
    const response = await cache.match(new URL(manifestPath, document.baseURI))
    if (!response) return null
    const data = (await response.json()) as { datasetVersion?: string; generatedAt?: string }
    return {
      datasetVersion: String(data.datasetVersion ?? ''),
      generatedAt: String(data.generatedAt ?? ''),
    }
  }, path)
}

export async function catalogFiles(page: Page, version: string): Promise<string[]> {
  const inventory = await readCacheInventory(page)
  const name = `${CATALOG_PREFIX}${version}`
  return (inventory.details[name] ?? [])
    .filter((path) => path.startsWith('data/') && !path.includes('__'))
    .map((path) => path.slice('data/'.length))
}

export function sourceCoverageFileName(files: string[]): string | undefined {
  return files.find((file) => /^source-coverage-[a-f0-9]{12}\.json$/i.test(file))
}

export async function readCachedJson<T>(page: Page, version: string, fileName: string): Promise<T | null> {
  return page.evaluate(
    async ({ cacheName, path }) => {
      const cache = await caches.open(cacheName)
      const response = await cache.match(new URL(path, document.baseURI))
      return response ? ((await response.json()) as T) : null
    },
    { cacheName: `${CATALOG_PREFIX}${version}`, path: `data/${fileName}` },
  )
}

export async function waitForCachedFileCount(
  page: Page,
  version: string,
  minimum: number,
): Promise<string[]> {
  await expect
    .poll(async () => (await catalogFiles(page, version)).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(minimum)
  return catalogFiles(page, version)
}

export async function clearDatasetCaches(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const keys = await caches.keys()
    for (const name of keys) {
      if (
        name === 'statuts-data-metadata' ||
        name === 'statuts-data-manifest' ||
        name === 'statuts-data-catalogs' ||
        name.startsWith('statuts-data-catalogs-v-')
      ) {
        await caches.delete(name)
      }
    }
  })
}

export async function openOfflineScreen(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Données hors ligne' }).click()
  await expect(page.getByRole('heading', { name: 'Données hors ligne' })).toBeVisible()
}

export function regionCard(page: Page, name: string) {
  return page.locator('.offline-region-card', { has: page.getByRole('heading', { name, exact: true }) })
}

export async function prepareRegion(page: Page, name: string): Promise<void> {
  const card = regionCard(page, name)
  await card.getByRole('button', { name: 'Télécharger' }).click()
  await expect(card.getByText('Disponible hors ligne')).toBeVisible({ timeout: 20_000 })
}

export async function goHomeFromOffline(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Accueil/ }).click()
  await expectOfficialHome(page)
}

export async function primeRegion(page: Page, regionLabel = 'Occitanie'): Promise<void> {
  await page.getByRole('button', { name: 'Flore', exact: true }).click()
  await expect(page.getByLabel('Espèce')).toBeVisible()
  await page.getByLabel('Région').selectOption({ label: regionLabel })
  await expect(page.getByLabel('Espèce')).toBeVisible()
  await page.getByRole('button', { name: /Flore/ }).click()
  await expectOfficialHome(page)
}

export async function searchTaxon(page: Page, realm: 'Flore' | 'Faune', query: string, regionLabel = 'Occitanie') {
  await page.getByRole('button', { name: realm, exact: true }).click()
  await expect(page.getByLabel('Espèce')).toBeVisible()
  await page.getByLabel('Région').selectOption({ label: regionLabel })
  await expect(page.getByLabel('Espèce')).toBeVisible()
  await expect(page.getByLabel('Région')).toHaveValue(regionLabel === 'Occitanie' ? 'OCC' : 'NAQ')
  await page.getByLabel('Espèce').fill(query)
}

export async function openFirstResult(page: Page, expectedName: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(expectedName) }).first().click()
  await expect(page.getByRole('heading', { name: new RegExp(expectedName) })).toBeVisible()
}

export async function backToHomeFromDetail(page: Page, realm: 'Flore' | 'Faune'): Promise<void> {
  await page.getByRole('button', { name: /Recherche/ }).click()
  await page.getByRole('button', { name: new RegExp(realm) }).click()
  await expectOfficialHome(page)
}

export async function expectActiveVersion(page: Page, version: 'e2e-a' | 'e2e-b'): Promise<void> {
  const active = await readManifestFromCache(page, 'active')
  expect(active?.datasetVersion).toBe(version)
}

export async function expectPreviousVersion(page: Page, version: 'e2e-a' | 'e2e-b' | null): Promise<void> {
  const previous = await readManifestFromCache(page, 'previous')
  if (version === null) {
    expect(previous).toBeNull()
    return
  }
  expect(previous?.datasetVersion).toBe(version)
}

export async function goOfflineAndReload(context: BrowserContext, page: Page): Promise<void> {
  await ensureControlled(page)
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForServiceWorker(page)
}

export function catalogRequestPaths(paths: string[]): string[] {
  return paths.filter((path) => path.startsWith('/data/') && path !== '/data/manifest.json')
}

export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  )
  expect(overflow, `débordement horizontal ${label}`).toBe(false)
}

export async function expectStackedStatusRows(page: Page): Promise<void> {
  const stacked = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.status-row'))
    if (rows.length === 0) return false
    return rows.every((row) => {
      const type = row.querySelector('.status-type')
      const value = row.querySelector('.status-value')
      if (!type || !value) return false
      const typeBox = type.getBoundingClientRect()
      const valueBox = value.getBoundingClientRect()
      return Math.abs(typeBox.left - valueBox.left) < 32 && valueBox.top >= typeBox.bottom - 2
    })
  })
  expect(stacked, 'les libellés et valeurs de statut doivent être empilés').toBe(true)
}
