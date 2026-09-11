import { expect, test } from '@playwright/test'
import {
  catalogFiles,
  ensureControlled,
  expectActiveVersion,
  expectOfficialHome,
  expectPreviousVersion,
  goHomeFromOffline,
  goOfflineAndReload,
  openOfflineScreen,
  openPwa,
  prepareRegion,
  primeRegion,
  readCachedJson,
  resetServer,
  setDataset,
  sourceCoverageFileName,
} from './helpers'

test.beforeEach(async ({ request }) => {
  await resetServer(request)
})

test.describe('PWA source-coverage snapshot', () => {
  test('préparer une région télécharge et conserve le snapshot hors ligne', async ({ page, context, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)
    await ensureControlled(page)
    await openOfflineScreen(page)
    await prepareRegion(page, 'Occitanie')

    const files = await catalogFiles(page, 'e2e-a')
    const coverageFile = sourceCoverageFileName(files)
    expect(coverageFile).toMatch(/^source-coverage-[a-f0-9]{12}\.json$/)
    const entries = await readCachedJson<Array<{ datasetEvidence: string }>>(page, 'e2e-a', coverageFile!)
    expect(Array.isArray(entries)).toBe(true)
    expect(entries!.length).toBeGreaterThan(0)
    expect(entries!.every((entry) => entry.datasetEvidence === 'present' || entry.datasetEvidence === 'unknown')).toBe(
      true,
    )

    await goHomeFromOffline(page)
    await primeRegion(page, 'Occitanie')
    await goOfflineAndReload(context, page)
    await expectOfficialHome(page)
    await expectActiveVersion(page, 'e2e-a')
    const offlineFiles = await catalogFiles(page, 'e2e-a')
    expect(sourceCoverageFileName(offlineFiles)).toBe(coverageFile)
    expect(await readCachedJson(page, 'e2e-a', coverageFile!)).toEqual(entries)
  })

  test('mise à jour A → B utilise le nouveau snapshot de couverture', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)
    await ensureControlled(page)
    await openOfflineScreen(page)
    await prepareRegion(page, 'Occitanie')
    const coverageA = sourceCoverageFileName(await catalogFiles(page, 'e2e-a'))
    expect(coverageA).toBeTruthy()

    await setDataset(request, 'b')
    await page.getByRole('button', { name: 'Vérifier les mises à jour' }).click()
    await expect(page.getByText('Mise à jour disponible')).toHaveCount(2)
    await page.getByRole('button', { name: 'Mettre à jour' }).click()
    await expect(page.getByText('Mise à jour installée.')).toBeVisible({ timeout: 20_000 })
    await expectActiveVersion(page, 'e2e-b')
    await expectPreviousVersion(page, 'e2e-a')

    const coverageB = sourceCoverageFileName(await catalogFiles(page, 'e2e-b'))
    expect(coverageB).toMatch(/^source-coverage-[a-f0-9]{12}\.json$/)
    expect(coverageB).not.toBe(coverageA)
    const entriesB = await readCachedJson<unknown[]>(page, 'e2e-b', coverageB!)
    expect(Array.isArray(entriesB)).toBe(true)
    expect(entriesB!.length).toBeGreaterThan(0)
  })

  test('couverture B corrompue empêche l’activation atomique', async ({ page, request }) => {
    await setDataset(request, 'a')
    await openPwa(page)
    await expectOfficialHome(page)
    await ensureControlled(page)
    await openOfflineScreen(page)
    await prepareRegion(page, 'Occitanie')
    const coverageA = sourceCoverageFileName(await catalogFiles(page, 'e2e-a'))
    expect(coverageA).toBeTruthy()

    await setDataset(request, 'corrupt-coverage-b')
    await page.getByRole('button', { name: 'Vérifier les mises à jour' }).click()
    await expect(page.getByText('Mise à jour disponible')).toHaveCount(2)
    await page.getByRole('button', { name: 'Mettre à jour' }).click()
    await expect(
      page.getByText('La nouvelle version n’a pas pu être vérifiée. La version actuelle a été conservée.'),
    ).toBeVisible({ timeout: 20_000 })
    await expectActiveVersion(page, 'e2e-a')
    await expectPreviousVersion(page, null)
    expect(sourceCoverageFileName(await catalogFiles(page, 'e2e-a'))).toBe(coverageA)
  })
})
