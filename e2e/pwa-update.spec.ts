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
  expectPreviousVersion,
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

test.describe('PWA mises à jour A → B', () => {
  test('check ne stage pas B ; interruption conserve A hors ligne ; reprise active B', async ({
    page,
    context,
    request,
  }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)
    await ensureControlled(page)
    await openOfflineScreen(page)
    await prepareRegion(page, 'Occitanie')
    await expectActiveVersion(page, 'e2e-a')
    await expect(regionCard(page, 'Occitanie').getByText('Disponible hors ligne')).toBeVisible()

    await setDataset(request, 'b')
    await clearRequestLog(request)
    await page.getByRole('button', { name: 'Vérifier les mises à jour' }).click()
    await expect(page.getByText('Mise à jour disponible')).toHaveCount(2)
    await expect(page.locator('.dataset-active-hash')).toHaveText('e2e-a')
    await expectActiveVersion(page, 'e2e-a')
    expect(await catalogFiles(page, 'e2e-b')).toEqual([])
    expect(catalogRequestPaths(await dataRequests(request))).toEqual([])

    await setDataset(request, 'slow-b')
    await page.getByRole('button', { name: 'Mettre à jour' }).click()
    await expect(page.getByText(/Mise à jour…/)).toBeVisible()

    await expect(regionCard(page, 'Occitanie').getByRole('button', { name: 'Télécharger' })).toHaveCount(0)
    await expect(regionCard(page, 'Occitanie').getByRole('button', { name: 'Supprimer' })).toBeDisabled()
    await expect(regionCard(page, 'Nouvelle-Aquitaine').getByRole('button', { name: 'Télécharger' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Vérifier les mises à jour' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mettre à jour' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()

    const staged = await waitForCachedFileCount(page, 'e2e-b', 1)
    expect(staged.length).toBeGreaterThanOrEqual(1)
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByText('Mise à jour interrompue. La version actuelle reste utilisable.')).toBeVisible()
    await expect(page.locator('.dataset-active-hash')).toHaveText('e2e-a')
    await expectActiveVersion(page, 'e2e-a')
    await expectPreviousVersion(page, null)
    const partialB = await catalogFiles(page, 'e2e-b')
    expect(partialB.length).toBeGreaterThanOrEqual(1)
    expect(await catalogFiles(page, 'e2e-a')).toHaveLength(5)

    await goHomeFromOffline(page)
    await goOfflineAndReload(context, page)
    await expectOfficialHome(page)
    await expectActiveVersion(page, 'e2e-a')
    await expect(page.getByText('Hors ligne : 1/13 régions')).toBeVisible()
    await expect(page.getByText('Herba imaginaria')).toHaveCount(0)

    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')
    await expect(page.getByText('VU — fixture e2e-a')).toBeVisible()
    await page.getByLabel(/Département/).selectOption('31')
    await expect(page.getByText('Oui — Midi-Pyrénées (fixture)')).toBeVisible()
    await page.getByLabel(/Département/).selectOption('34')
    await expect(page.getByText('Oui — Languedoc-Roussillon (fixture)')).toBeVisible()
    await backToHomeFromDetail(page, 'Flore')
    await searchTaxon(page, 'Faune', 'Animalia')
    await openFirstResult(page, 'Animal de test')
    await expect(page.getByText('NT — fixture e2e-a')).toBeVisible()
    await backToHomeFromDetail(page, 'Faune')

    await context.setOffline(false)
    await setDataset(request, 'b')
    await openOfflineScreen(page)
    await page.getByRole('button', { name: 'Vérifier les mises à jour' }).click()
    await expect(page.getByText('Mise à jour disponible')).toHaveCount(2)
    await clearRequestLog(request)
    await page.getByRole('button', { name: 'Mettre à jour' }).click()
    await expect(page.getByText('Mise à jour installée.')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.dataset-active-hash')).toHaveText('e2e-b')
    await expectActiveVersion(page, 'e2e-b')
    await expectPreviousVersion(page, 'e2e-a')
    await expect(regionCard(page, 'Occitanie').getByText('Disponible hors ligne')).toBeVisible()

    const fetchedOnResume = catalogRequestPaths(await dataRequests(request)).map((path) => path.slice('/data/'.length))
    for (const file of partialB) {
      expect(fetchedOnResume, `fichier B déjà validé re-fetch : ${file}`).not.toContain(file)
    }
    expect((await catalogFiles(page, 'e2e-a')).length).toBeGreaterThan(0)
    expect((await catalogFiles(page, 'e2e-b')).length).toBeGreaterThanOrEqual(5)

    await goHomeFromOffline(page)
    await goOfflineAndReload(context, page)
    await expectOfficialHome(page)
    await expectActiveVersion(page, 'e2e-b')
    await expect(page.getByText('Hors ligne : 1/13 régions')).toBeVisible()

    await searchTaxon(page, 'Flore', 'Herba')
    await openFirstResult(page, 'Herbe imaginaire de test')
    await expect(page.getByText('Herba imaginaria')).toBeVisible()
    await expect(page.getByText('VU — fixture e2e-b')).toBeVisible()
    await expect(page.getByText('VU — fixture e2e-a')).toHaveCount(0)
  })

  test('candidate B corrompue : A reste active et utilisable hors ligne', async ({ page, context, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)
    await ensureControlled(page)
    await openOfflineScreen(page)
    await prepareRegion(page, 'Occitanie')

    await setDataset(request, 'corrupt-b')
    await page.getByRole('button', { name: 'Vérifier les mises à jour' }).click()
    await expect(page.getByText('Mise à jour disponible')).toHaveCount(2)
    await page.getByRole('button', { name: 'Mettre à jour' }).click()
    await expect(
      page.getByText('La nouvelle version n’a pas pu être vérifiée. La version actuelle a été conservée.'),
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.dataset-active-hash')).toHaveText('e2e-a')
    await expectActiveVersion(page, 'e2e-a')
    await expectPreviousVersion(page, null)
    await expect(page.getByText('Herba imaginaria')).toHaveCount(0)

    await goHomeFromOffline(page)
    await goOfflineAndReload(context, page)
    await expectOfficialHome(page)
    await expectActiveVersion(page, 'e2e-a')
    await searchTaxon(page, 'Flore', 'Planta')
    await openFirstResult(page, 'Plante fictive de test')
    await expect(page.getByText('VU — fixture e2e-a')).toBeVisible()
    await expect(page.getByText('VU — fixture e2e-b')).toHaveCount(0)
    await expect(page.getByText('Herba imaginaria')).toHaveCount(0)
  })
})
