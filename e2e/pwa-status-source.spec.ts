import { expect, test } from '@playwright/test'
import {
  catalogRequestPaths,
  clearRequestLog,
  dataRequests,
  ensureControlled,
  expectNoHorizontalOverflow,
  expectOfficialHome,
  goHomeFromOffline,
  goOfflineAndReload,
  openFirstResult,
  openOfflineScreen,
  openPwa,
  prepareRegion,
  primeRegion,
  resetServer,
  searchTaxon,
  setDataset,
} from './helpers'

test.beforeEach(async ({ request }) => {
  await resetServer(request)
})

function sourceButtons(page: Parameters<typeof openPwa>[0]) {
  return page.getByRole('button', { name: 'Source', exact: true })
}

test.describe('PWA provenance par statut', () => {
  test('Flore : ouvrir et fermer la source sans quitter la fiche', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)

    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')

    const source = sourceButtons(page).first()
    await expect(source).toHaveAttribute('aria-expanded', 'false')
    await source.click()
    await expect(source).toHaveAttribute('aria-expanded', 'true')
    const panelId = await source.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    const panel = page.locator(`#${panelId}`)
    await expect(panel).toBeVisible()
    await expect(panel.getByText('Fixture LRR Occitanie')).toBeVisible()
    await expect(panel.getByText('Producteur E2E LRR')).toBeVisible()
    await expect(panel.getByText(/Version\s+e2e-a/)).toBeVisible()
    await expect(panel.getByText(/Année de publication\s+2026/)).toBeVisible()
    await expect(panel.getByText(/Vérifié le\s+09\/09\/2026/)).toBeVisible()
    await expect(panel.getByText('Référentiel officiel')).toBeVisible()

    await panel.getByRole('button', { name: 'Fermer' }).click()
    await expect(source).toHaveAttribute('aria-expanded', 'false')
    await expect(panel).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Plante fictive de test' })).toBeVisible()
    await expect(page.locator('.territory-region')).toHaveText('Occitanie')
    await expect(page.getByText('VU - fixture e2e-a')).toBeVisible()
  })

  test('plusieurs sourceId : chaque statut ouvre sa source exacte', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')

    await sourceButtons(page).nth(0).click()
    const lrr = page.locator('#status-source-0')
    await expect(lrr.getByText('Fixture LRR Occitanie')).toBeVisible()
    await expect(lrr.getByText('Producteur E2E LRR')).toBeVisible()
    await expect(lrr.getByText('Fixture ZNIEFF Occitanie')).toHaveCount(0)

    await sourceButtons(page).nth(1).click()
    await expect(lrr).toBeHidden()
    const znieff = page.locator('#status-source-1')
    await expect(znieff).toBeVisible()
    await expect(znieff.getByText('Fixture ZNIEFF Occitanie')).toBeVisible()
    await expect(znieff.getByText('Autre producteur E2E')).toBeVisible()
    await expect(znieff.getByText('test-2')).toBeVisible()
    await expect(znieff.getByText('Année de publication')).toHaveCount(0)
    await expect(znieff.getByText('Vérifié le')).toHaveCount(0)
    await expect(znieff.getByText('Fixture LRR Occitanie')).toHaveCount(0)

    await sourceButtons(page).nth(2).click()
    const znieffAgain = page.locator('#status-source-2')
    await expect(znieffAgain.getByText('Fixture ZNIEFF Occitanie')).toBeVisible()
    await expect(znieffAgain.getByText('Autre producteur E2E')).toBeVisible()
    await expect(znieffAgain.getByText('test-2')).toBeVisible()
  })

  test('OCC 31 puis 34 : provenances recalculées, aucun fetch catalogue', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')

    await page.getByLabel(/Département/).selectOption('31')
    await expect(page.getByText('Oui - Midi-Pyrénées (fixture)')).toBeVisible()
    await sourceButtons(page).nth(1).click()
    await expect(page.locator('#status-source-1').getByText('Fixture ZNIEFF Occitanie')).toBeVisible()

    await clearRequestLog(request)
    await page.getByLabel(/Département/).selectOption('34')
    await expect(page.getByText('Oui - Languedoc-Roussillon (fixture)')).toBeVisible()
    await expect(page.getByText('Oui - Midi-Pyrénées (fixture)')).toHaveCount(0)
    await expect(page.locator('#status-source-1')).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Plante fictive de test' })).toBeVisible()

    await sourceButtons(page).nth(0).click()
    await expect(page.locator('#status-source-0').getByText('Fixture LRR Occitanie')).toBeVisible()
    await sourceButtons(page).nth(1).click()
    await expect(page.locator('#status-source-1').getByText('Fixture ZNIEFF Occitanie')).toBeVisible()
    await expect(page.locator('#status-source-1').getByText('test-2')).toBeVisible()
    expect(catalogRequestPaths(await dataRequests(request))).toEqual([])
  })

  test('offline navigateur : le panneau source reste consultable', async ({ page, context, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)
    await ensureControlled(page)
    await openOfflineScreen(page)
    await prepareRegion(page, 'Occitanie')
    await goHomeFromOffline(page)
    await primeRegion(page, 'Occitanie')
    await goOfflineAndReload(context, page)
    await expectOfficialHome(page)

    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')
    await sourceButtons(page).first().click()
    const panel = page.locator('#status-source-0')
    await expect(panel.getByText('Fixture LRR Occitanie')).toBeVisible()
    await expect(panel.getByText('Producteur E2E LRR')).toBeVisible()
    await panel.getByRole('button', { name: 'Fermer' }).click()
    await expect(panel).toBeHidden()
    await expect(page.getByText('VU - fixture e2e-a')).toBeVisible()
  })

  test('sourceId absent du manifeste : statut visible, aucune substitution', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await searchTaxon(page, 'Flore', 'orbus')
    await openFirstResult(page, 'Statut orphelin de test')

    await expect(page.getByText('Présent - sans métadonnée de source')).toBeVisible()
    await sourceButtons(page).first().click()
    const panel = page.locator('#status-source-0')
    await expect(panel.getByText('Métadonnées de source indisponibles pour ce statut.')).toBeVisible()
    await expect(panel.getByText('sourceId : fixture-source-absente')).toBeVisible()
    await expect(panel.getByText('TAXREF')).toHaveCount(0)
    await expect(panel.getByText('BDC')).toHaveCount(0)
    await expect(panel.getByText('Fixture LRR Occitanie')).toHaveCount(0)
    await expect(panel.getByText('Fixture ZNIEFF Occitanie')).toHaveCount(0)
  })

  test('responsive 320 / 360 / 390 : Aide et Source accessibles, pas d’overflow', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')

    for (const viewport of [
      { width: 320, height: 720 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      const help = page.getByRole('button', { name: 'Aide sur ce statut' }).first()
      const source = sourceButtons(page).first()
      const helpBox = await help.boundingBox()
      const sourceBox = await source.boundingBox()
      expect(helpBox?.width).toBeGreaterThanOrEqual(44)
      expect(helpBox?.height).toBeGreaterThanOrEqual(44)
      expect(sourceBox?.width).toBeGreaterThanOrEqual(44)
      expect(sourceBox?.height).toBeGreaterThanOrEqual(44)

      await source.click()
      const panel = page.locator('#status-source-0')
      await expect(panel.getByText('Fixture LRR Occitanie')).toBeVisible()
      await expectNoHorizontalOverflow(page, `source ${viewport.width}×${viewport.height}`)
      await panel.getByRole('button', { name: 'Fermer' }).click()
    }
  })
})
