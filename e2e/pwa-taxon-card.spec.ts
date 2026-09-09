import { expect, test } from '@playwright/test'
import {
  catalogRequestPaths,
  clearRequestLog,
  dataRequests,
  ensureControlled,
  expectNoHorizontalOverflow,
  expectOfficialHome,
  expectStackedStatusRows,
  openFirstResult,
  openPwa,
  resetServer,
  searchTaxon,
  setDataset,
} from './helpers'

test.beforeEach(async ({ request }) => {
  await resetServer(request)
})

test.describe('PWA fiche taxon lisible', () => {
  test('Flore : identité, territoire, statuts et aide', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)
    await ensureControlled(page)

    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')

    await expect(page.getByRole('heading', { level: 1, name: 'Plante fictive de test' })).toBeVisible()
    await expect(page.getByText('Planta fictiva')).toBeVisible()
    await expect(page.getByText(/Testaceae/)).toBeVisible()
    await expect(page.getByText(/CD_REF 900001/)).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Territoire' })).toBeVisible()
    await expect(page.locator('.territory-region')).toHaveText('Occitanie')
    await expect(page.locator('.territory-scope')).toHaveText('Toute la région')
    await expect(page.getByText('Les statuts affichés correspondent à ce territoire.')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Statuts' })).toBeVisible()
    await expect(page.getByText('Liste rouge régionale')).toBeVisible()
    await expect(page.getByText('VU - fixture e2e-a')).toBeVisible()
    await expect(page.getByText('Déterminante ZNIEFF')).toHaveCount(2)
    await expect(page.getByText(/Portée : Midi-Pyrénées/)).toBeVisible()
    await expect(page.getByText(/Sources et versions/)).toBeVisible()

    const help = page.getByRole('button', { name: 'Aide sur ce statut' }).first()
    await expect(help).toHaveAttribute('aria-expanded', 'false')
    await help.click()
    await expect(help).toHaveAttribute('aria-expanded', 'true')
    const panelId = await help.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    const panel = page.locator(`#${panelId}`)
    await expect(panel).toBeVisible()
    await expect(panel.getByText(/Liste rouge|Protection|ZNIEFF|statut/i)).toBeVisible()
    await panel.getByRole('button', { name: 'Fermer' }).click()
    await expect(help).toHaveAttribute('aria-expanded', 'false')
    await expect(panel).toBeHidden()
  })

  test('Faune : parcours minimal de fiche', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)

    await searchTaxon(page, 'Faune', 'Animalia')
    await openFirstResult(page, 'Animal de test')

    await expect(page.getByRole('heading', { level: 1, name: 'Animal de test' })).toBeVisible()
    await expect(page.getByText('Animalia testensis')).toBeVisible()
    await expect(page.locator('.territory-region')).toHaveText('Occitanie')
    await expect(page.getByText('Liste rouge régionale')).toBeVisible()
    await expect(page.getByText('NT - fixture e2e-a')).toBeVisible()

    const help = page.getByRole('button', { name: 'Aide sur ce statut' }).first()
    await help.click()
    await expect(help).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.status-help').first()).toBeVisible()
  })

  test('OCC 31 puis 34 : même taxon, recalcul local, aucun fetch catalogue', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)

    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')
    await expect(page.getByRole('heading', { level: 1, name: 'Plante fictive de test' })).toBeVisible()

    await page.getByLabel(/Département/).selectOption('31')
    await expect(page.locator('.territory-scope')).toHaveText('département 31')
    await expect(page.getByRole('heading', { level: 1, name: 'Plante fictive de test' })).toBeVisible()
    await expect(page.getByText('Oui - Midi-Pyrénées (fixture)')).toBeVisible()
    await expect(page.getByText(/non applicable au département 31/)).toBeVisible()
    await expect(page.getByText(/Portée : Midi-Pyrénées/)).toBeVisible()

    await clearRequestLog(request)
    await page.getByLabel(/Département/).selectOption('34')
    await expect(page.locator('.territory-scope')).toHaveText('département 34')
    await expect(page.getByRole('heading', { level: 1, name: 'Plante fictive de test' })).toBeVisible()
    await expect(page.getByText('Oui - Languedoc-Roussillon (fixture)')).toBeVisible()
    await expect(page.getByText(/non applicable au département 34/)).toBeVisible()
    await expect(page.getByText('Planta fictiva')).toBeVisible()
    expect(catalogRequestPaths(await dataRequests(request))).toEqual([])
  })

  test('empty state territorial distinct d’une erreur', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)

    await searchTaxon(page, 'Flore', 'vacua')
    await openFirstResult(page, 'Plante sans statut de test')

    await expect(page.getByRole('heading', { level: 1, name: 'Plante sans statut de test' })).toBeVisible()
    await expect(page.getByText('Flora vacua')).toBeVisible()
    await expect(
      page.getByText('Aucun statut identifié dans les référentiels actuellement intégrés pour ce territoire.'),
    ).toBeVisible()
    await expect(page.getByText('aucun enjeu', { exact: false })).toHaveCount(0)
    await expect(page.getByText('espèce non protégée', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Référentiel non chargé' })).toHaveCount(0)
    await expect(page.getByText(/Sources et versions/)).toBeVisible()
  })

  test('responsive 320 / 360×800 / 390×844 : pas de débordement, statuts empilés', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)
    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')

    for (const viewport of [
      { width: 320, height: 720 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await expect(page.getByRole('heading', { level: 1, name: 'Plante fictive de test' })).toBeVisible()
      await expect(page.getByText('VU - fixture e2e-a')).toBeVisible()
      await expectStackedStatusRows(page)
      await expectNoHorizontalOverflow(page, `${viewport.width}×${viewport.height}`)

      const helpBox = await page.getByRole('button', { name: 'Aide sur ce statut' }).first().boundingBox()
      expect(helpBox, `cible aide à ${viewport.width}px`).toBeTruthy()
      expect(helpBox!.width).toBeGreaterThanOrEqual(44)
      expect(helpBox!.height).toBeGreaterThanOrEqual(44)
    }
  })
})
