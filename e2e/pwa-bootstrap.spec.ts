import { expect, test } from '@playwright/test'
import {
  CATALOG_PREFIX,
  LEGACY_CATALOG_CACHE,
  LEGACY_MANIFEST_CACHE,
  METADATA_CACHE,
  catalogRequestPaths,
  clearDatasetCaches,
  dataRequests,
  ensureControlled,
  expectOfficialHome,
  openPwa,
  readCacheInventory,
  readManifestFromCache,
  resetServer,
  setDataset,
  waitForServiceWorker,
} from './helpers'

test.beforeEach(async ({ request }) => {
  await resetServer(request)
})

test.describe('PWA bootstrap', () => {
  test('bootstrap officiel sans démonstration ni preload des 29 catalogues', async ({ page, request }) => {
    await openPwa(page)
    await expectOfficialHome(page)
    await waitForServiceWorker(page)
    await ensureControlled(page)
    await expectOfficialHome(page)

    await expect(page.getByText('Aucune région hors ligne')).toBeVisible()
    await expect(page.getByText('Hors ligne :')).toHaveCount(0)
    await expect(page.getByText('Données de démonstration non officielles')).toHaveCount(0)

    const active = await readManifestFromCache(page, 'active')
    expect(active?.datasetVersion).toBe('e2e-a')
    expect(active?.generatedAt).toBe('2026-09-09T10:00:00Z')

    const inventory = await readCacheInventory(page)
    expect(inventory.names).toContain(METADATA_CACHE)
    expect(inventory.names).not.toContain(LEGACY_MANIFEST_CACHE)
    expect(inventory.names).not.toContain(LEGACY_CATALOG_CACHE)
    expect(inventory.names.filter((name) => name.startsWith(CATALOG_PREFIX))).toEqual([])

    const dataPaths = await dataRequests(request)
    const catalogs = catalogRequestPaths(dataPaths)
    expect(dataPaths.some((path) => path === '/data/manifest.json')).toBeTruthy()
    expect(catalogs, `aucun catalogue ne doit être préchargé, reçu: ${catalogs.join(', ')}`).toEqual([])

    const controller = await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
    expect(controller).toBe(true)
  })

  test('manifeste HTTP 200 invalide : jeu non reconnu, pas de démo automatique', async ({ page, request }) => {
    await setDataset(request, 'invalid-manifest')
    await openPwa(page)
    await expect(page.getByRole('heading', { name: 'Jeu de données non reconnu' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ouvrir la démonstration' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
    await expect(page.getByText('Démonstration', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Flore', exact: true })).toHaveCount(0)
    expect(await readManifestFromCache(page, 'active')).toBeNull()
  })

  test('manifeste 503 : erreur officielle, pas de démo avant clic', async ({ page, request }) => {
    await setDataset(request, 'unavailable')
    await openPwa(page)
    await expect(page.getByRole('heading', { name: 'Impossible de charger les données officielles' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ouvrir la démonstration' })).toBeVisible()
    await expect(page.getByText('Démonstration', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Flore', exact: true })).toHaveCount(0)
    expect(await readManifestFromCache(page, 'active')).toBeNull()
  })

  test('shell installé sans dataset : Données nécessaires, puis démonstration explicite', async ({
    page,
    context,
    request,
  }) => {
    await openPwa(page)
    await expectOfficialHome(page)
    await ensureControlled(page)
    await clearDatasetCaches(page)
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Données nécessaires' })).toBeVisible()
    await expect(page.getByText('Démonstration', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Flore', exact: true })).toHaveCount(0)
    await expect(page.getByText('Planta fictiva')).toHaveCount(0)
    await expect(page.getByText('Quercus')).toHaveCount(0)

    await page.getByRole('button', { name: 'Ouvrir la démonstration' }).click()
    await expect(page.getByRole('heading', { name: /Que recherchez-vous/ })).toBeVisible()
    await expect(page.getByText('Démonstration', { exact: true })).toBeVisible()
    await expect(page.getByText(/Données de démonstration non officielles/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Données hors ligne' })).toHaveCount(0)
    await expect(page.getByText('Hors ligne :')).toHaveCount(0)
    await expect(page.getByText(/Hors ligne prêt/)).toHaveCount(0)
    await expect(page.getByText(/régions hors ligne/)).toHaveCount(0)
  })
})
