import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('./acquisition-cli.mjs', import.meta.url))
const PIN = createHash('sha256').update('cli-pin').digest('hex')
const OTHER = createHash('sha256').update('cli-other').digest('hex')

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
}

function runCliJson(canonical) {
  const dir = mkdtempSync(path.join(tmpdir(), 'acquisition-cli-'))
  const file = path.join(dir, 'canonical.json')
  writeFileSync(file, `${JSON.stringify(canonical)}\n`)
  return runCli(['--canonical-json', file])
}

test('CLI FETCH_OK : message et exit 0', () => {
  const result = runCliJson({
    fetchOk: true,
    typeOk: true,
    expectedKind: 'ods',
    detectedKind: 'ods',
    expectedSha256: PIN,
    actualSha256: PIN,
    shaPolicy: 'pinned',
  })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /^FETCH_OK: source canonique validée \(SHA-256 conforme\)/)
})

test('CLI UNAVAILABLE : message et exit 1', () => {
  const result = runCli([
    '--fetch-ok', 'false',
    '--expected-kind', 'ods',
    '--expected-sha256', PIN,
    '--sha-policy', 'pinned',
    '--reason-code', 'network_error',
  ])
  assert.equal(result.status, 1)
  assert.match(result.stdout, /^UNAVAILABLE:/)
})

test('CLI TYPE_MISMATCH maintenance : pas un SHA inattendu', () => {
  const result = runCliJson({
    fetchOk: true,
    typeOk: false,
    expectedKind: 'ods',
    detectedKind: 'html',
    reasonCode: 'maintenance_page',
    expectedSha256: PIN,
    actualSha256: OTHER,
    shaPolicy: 'pinned',
  })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /^TYPE_MISMATCH: page de maintenance reçue à la place d’un ODS/)
  assert.equal(/SHA inattendu/i.test(result.stdout), false)
})

test('CLI CHANGED_UNVERIFIED : fail-closed avec les deux SHA', () => {
  const result = runCliJson({
    fetchOk: true,
    typeOk: true,
    expectedKind: 'ods',
    detectedKind: 'ods',
    expectedSha256: PIN,
    actualSha256: OTHER,
    shaPolicy: 'pinned',
  })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /^CHANGED_UNVERIFIED:/)
  assert.match(result.stdout, new RegExp(PIN))
  assert.match(result.stdout, new RegExp(OTHER))
})
