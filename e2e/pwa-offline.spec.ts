import { expect, test } from '@playwright/test'
import {
  backToHomeFromDetail,
  catalogFiles,
  catalogRequestPaths,
  clearRequestLog,
  dataRequests,
  ensureControlled,
  expectActiveVersion,
  expectOfficialHome,
  goHomeFromOffline,
  goOfflineAndReload,
  openFirstResult,
  openOfflineScreen,
  openPwa,
  prepareRegion,
  regionCard,
  resetServer,
  searchTaxon,
  setDataset,
  waitForCachedFileCount,
} from './helpers'

test.beforeEach(async ({ request }) => {
  await resetServer(request)
})

test.describe('PWA offline terrain', () => {
  test('préparer OCC, reload hors ligne, Flore/Faune, départements, région absente', async ({
    page,
    context,
    request,
  }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)
    await ensureControlled(page)

    await openOfflineScreen(page)
    await expect(page.locator('.dataset-active-hash')).toHaveText('e2e-a')
    await prepareRegion(page, 'Occitanie')
    await expect(page.getByText('Hors ligne : 1/13 régions')).toBeVisible()
    await expect(regionCard(page, 'Occitanie').getByText('Disponible hors ligne')).toBeVisible()
    await expect(page.locator('.offline-shared')).toContainText('Prêt')

    const occFiles = await catalogFiles(page, 'e2e-a')
    expect(occFiles).toHaveLength(5)
    await expectActiveVersion(page, 'e2e-a')

    await goHomeFromOffline(page)
    await goOfflineAndReload(context, page)
    await expectOfficialHome(page)
    await expect(page.getByText('Hors ligne : 1/13 régions')).toBeVisible()
    await expectActiveVersion(page, 'e2e-a')
    const controller = await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
    expect(controller).toBe(true)

    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')
    await expect(page.getByText('Planta fictiva')).toBeVisible()
    await expect(page.getByText('VU — fixture e2e-a')).toBeVisible()

    await page.getByLabel(/Département/).selectOption('31')
    await expect(page.getByText('Oui — Midi-Pyrénées (fixture)')).toBeVisible()
    await expect(page.getByText(/non applicable au département 31/)).toBeVisible()
    await expect(page.getByText('Planta fictiva')).toBeVisible()

    await clearRequestLog(request)
    await page.getByLabel(/Département/).selectOption('34')
    await expect(page.getByText('Oui — Languedoc-Roussillon (fixture)')).toBeVisible()
    await expect(page.getByText(/non applicable au département 34/)).toBeVisible()
    await expect(page.getByText('Planta fictiva')).toBeVisible()
    expect(catalogRequestPaths(await dataRequests(request))).toEqual([])

    await backToHomeFromDetail(page, 'Flore')

    await searchTaxon(page, 'Faune', 'Animalia')
    await openFirstResult(page, 'Animal de test')
    await expect(page.getByText('Animalia testensis')).toBeVisible()
    await expect(page.getByText('NT — fixture e2e-a')).toBeVisible()
    await page.getByRole('button', { name: /Recherche/ }).click()

    await page.getByLabel('Région').selectOption({ label: 'Nouvelle-Aquitaine' })
    await expect(page.getByRole('heading', { name: 'Référentiel non chargé' })).toBeVisible()
    await expect(
      page.getByText("Ce jeu de données n'est pas encore disponible hors connexion sur cet appareil."),
    ).toBeVisible()
    await expect(page.getByText('Animalia testensis')).toHaveCount(0)

    await page.getByRole('button', { name: /Retour/ }).click()
    await searchTaxon(page, 'Flore', 'Taxon')
    await openFirstResult(page, 'Taxon de test')
    await expect(page.getByText('Taxon testus')).toBeVisible()

    const restarted = await context.newPage()
    await restarted.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(restarted.getByRole('heading', { name: /Que recherchez-vous/ })).toBeVisible()
    await expect(restarted.getByText('Hors ligne : 1/13 régions')).toBeVisible()
    await expect(restarted.getByText('Démonstration', { exact: true })).toHaveCount(0)
    const restartedActive = await restarted.evaluate(async () => {
      const cache = await caches.open('statuts-data-metadata')
      const response = await cache.match(new URL('data/__active-manifest__', document.baseURI))
      return response ? ((await response.json()) as { datasetVersion: string }).datasetVersion : null
    })
    expect(restartedActive).toBe('e2e-a')
    await restarted.close()
  })

  test('interruption puis reprise du téléchargement NAQ sans re-fetch des fichiers déjà valides', async ({
    page,
    request,
  }) => {
    await setDataset(request, 'slow-region')
    await openPwa(page)
    await expectOfficialHome(page)
    await ensureControlled(page)
    await openOfflineScreen(page)

    const naq = regionCard(page, 'Nouvelle-Aquitaine')
    await naq.getByRole('button', { name: 'Télécharger' }).click()
    await expect(naq.getByText('Téléchargement…')).toBeVisible()
    const stored = await waitForCachedFileCount(page, 'e2e-a', 1)
    expect(stored.length).toBeGreaterThanOrEqual(1)
    await naq.getByRole('button', { name: 'Annuler' }).click()

    await expect(page.getByText('Téléchargement interrompu. Les fichiers déjà récupérés sont conservés.')).toBeVisible()
    await expect(naq.getByText('Téléchargement incomplet')).toBeVisible()
    await expect(naq.getByRole('button', { name: 'Reprendre' })).toBeVisible()
    const partial = await catalogFiles(page, 'e2e-a')
    expect(partial.length).toBeGreaterThanOrEqual(1)
    expect(partial.length).toBeLessThan(5)

    await setDataset(request, 'a')
    await clearRequestLog(request)
    await naq.getByRole('button', { name: 'Reprendre' }).click()
    await expect(naq.getByText('Disponible hors ligne')).toBeVisible({ timeout: 20_000 })

    const fetchedAfterResume = catalogRequestPaths(await dataRequests(request)).map((path) =>
      path.slice('/data/'.length),
    )
    for (const file of partial) {
      expect(fetchedAfterResume, `fichier déjà valide re-fetch : ${file}`).not.toContain(file)
    }
    expect(fetchedAfterResume.length).toBeGreaterThan(0)
    expect(await catalogFiles(page, 'e2e-a')).toHaveLength(5)
  })

  test('mobile viewport smoke 360×800 et 390×844', async ({ page }) => {
    for (const viewport of [
      { width: 360, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await openPwa(page)
      await expectOfficialHome(page)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      )
      expect(overflow, `débordement horizontal à ${viewport.width}×${viewport.height}`).toBe(false)
      await expect(page.getByRole('button', { name: 'Flore', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Faune', exact: true })).toBeVisible()
    }
  })
})
