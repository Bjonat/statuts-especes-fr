import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, 'regions/ara/download_lrr.sh')
const registry = JSON.parse(readFileSync(path.join(here, 'regions/ready-sources.json'), 'utf8'))
const PINNED_ODS_SHA = '3308ae670319c729f248d444ddfb08b621a02cbc52610c3e4ad2a548eefacd7b'
const PINNED_ODS_URL =
  'https://www.auvergne-rhone-alpes.developpement-durable.gouv.fr/IMG/ods/2024-lrr-oisx_mamm_web-dreal.ods'

function odsResource() {
  const source = registry.sources.find((entry) => entry.id === 'dreal-ara-lrr-vertebres-2024')
  return source.resources.find((resource) => resource.kind === 'ods')
}

function writeMinimalOds(filePath) {
  const python = `
import zipfile, sys
path = sys.argv[1]
with zipfile.ZipFile(path, 'w') as archive:
    archive.writestr('mimetype', 'application/vnd.oasis.opendocument.spreadsheet', compress_type=zipfile.ZIP_STORED)
    archive.writestr('content.xml', '<office:document-content/>')
`
  const result = spawnSync('python3', ['-c', python, filePath], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function runDownloader({ url, sha256, targetDir }) {
  return spawnSync('bash', [script, targetDir], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ARA_LRR_SKIP_XLSX: '1',
      ARA_LRR_CURL_RETRY: '0',
      ARA_LRR_OISEAUX_MAMM_URL: url,
      ARA_LRR_OISEAUX_MAMM_SHA256: sha256,
    },
  })
}

test('les défauts du downloader ODS restent alignés sur le registre', () => {
  const resource = odsResource()
  const scriptText = readFileSync(script, 'utf8')
  assert.equal(resource.url, PINNED_ODS_URL)
  assert.equal(resource.sha256, PINNED_ODS_SHA)
  assert.equal(resource.state ?? registry.sources.find((entry) => entry.id === 'dreal-ara-lrr-vertebres-2024').state, 'IMPORTED')
  assert.match(scriptText, new RegExp(PINNED_ODS_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(scriptText, new RegExp(PINNED_ODS_SHA))
  assert.equal(scriptText.includes('archiveUrl'), false)
})

test('cas A — ODS plausible + SHA attendu : FETCH_OK et fichier conservé', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ara-lrr-a-'))
  const ods = path.join(dir, 'source.ods')
  writeMinimalOds(ods)
  const sha = sha256File(ods)
  const targetDir = path.join(dir, 'out')
  mkdirSync(targetDir)
  const result = runDownloader({ url: pathToFileURL(ods).href, sha256: sha, targetDir })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /FETCH_OK/)
  assert.doesNotMatch(result.stderr, /ignored null byte/i)
  assert.equal(existsSync(path.join(targetDir, 'oiseaux-mammiferes.ods')), true)
  assert.equal(sha256File(path.join(targetDir, 'oiseaux-mammiferes.ods')), sha)
})

test('cas B — transport impossible : UNAVAILABLE, aucun fichier final', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ara-lrr-b-'))
  const missing = path.join(dir, 'absent.ods')
  const targetDir = path.join(dir, 'out')
  mkdirSync(targetDir)
  const result = runDownloader({
    url: pathToFileURL(missing).href,
    sha256: PINNED_ODS_SHA,
    targetDir,
  })
  assert.equal(result.status, 1)
  assert.match(`${result.stdout}\n${result.stderr}`, /UNAVAILABLE/)
  assert.equal(existsSync(path.join(targetDir, 'oiseaux-mammiferes.ods')), false)
})

test('cas C — HTML de maintenance : TYPE_MISMATCH, aucun fichier final', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ara-lrr-c-'))
  const html = path.join(dir, 'maintenance.html')
  writeFileSync(html, '<!doctype html>\n<html>\n<title>Maintenance en cours</title>\n</html>\n')
  const targetDir = path.join(dir, 'out')
  mkdirSync(targetDir)
  const result = runDownloader({
    url: pathToFileURL(html).href,
    sha256: PINNED_ODS_SHA,
    targetDir,
  })
  assert.equal(result.status, 1)
  const output = `${result.stdout}\n${result.stderr}`
  assert.match(output, /TYPE_MISMATCH: page de maintenance reçue à la place d’un ODS/)
  assert.equal(/SHA-256 inattendu/i.test(output), false)
  assert.equal(existsSync(path.join(targetDir, 'oiseaux-mammiferes.ods')), false)
})

test('cas D — ODS plausible + SHA différent : CHANGED_UNVERIFIED, temp supprimé', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ara-lrr-d-'))
  const ods = path.join(dir, 'changed.ods')
  writeMinimalOds(ods)
  const targetDir = path.join(dir, 'out')
  mkdirSync(targetDir)
  const result = runDownloader({
    url: pathToFileURL(ods).href,
    sha256: PINNED_ODS_SHA,
    targetDir,
  })
  assert.equal(result.status, 1)
  const output = `${result.stdout}\n${result.stderr}`
  assert.match(output, /CHANGED_UNVERIFIED/)
  assert.match(output, new RegExp(PINNED_ODS_SHA))
  assert.match(output, new RegExp(sha256File(ods)))
  assert.equal(existsSync(path.join(targetDir, 'oiseaux-mammiferes.ods')), false)
  const leftovers = spawnSync('bash', ['-lc', `ls -A '${targetDir}'`], { encoding: 'utf8' })
  assert.equal(leftovers.stdout.trim(), '')
})
