#!/usr/bin/env node
/**
 * Pont mince Bash → acquisition.mjs.
 * Ne télécharge pas, n’inspecte pas, ne connaît pas ARA/BFC.
 */
import fs from 'node:fs'
import {
  acquisitionExitCode,
  formatAcquisitionResult,
  resolveAcquisition,
} from './acquisition.mjs'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key?.startsWith('--')) throw new Error(`Argument invalide près de ${key ?? '<fin>'}`)
    const name = key.slice(2)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Valeur manquante pour --${name}`)
    }
    args[name] = value
    index += 1
  }
  return args
}

function parseBoolean(value, name) {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} doit être true ou false`)
}

function observationFromArgs(args) {
  if (args['canonical-json']) {
    const raw = args['canonical-json'] === '-'
      ? fs.readFileSync(0, 'utf8')
      : fs.readFileSync(args['canonical-json'], 'utf8')
    return JSON.parse(raw)
  }

  if (args['fetch-ok'] === undefined) {
    throw new Error('--canonical-json ou --fetch-ok est requis')
  }

  const observation = {
    fetchOk: parseBoolean(args['fetch-ok'], 'fetch-ok'),
    expectedKind: args['expected-kind'] ?? null,
    expectedSha256: args['expected-sha256'] ?? null,
    shaPolicy: args['sha-policy'] ?? null,
    origin: args.origin ?? 'canonical',
  }

  if (args['type-ok'] !== undefined) observation.typeOk = parseBoolean(args['type-ok'], 'type-ok')
  if (args['detected-kind'] !== undefined) observation.detectedKind = args['detected-kind']
  if (args['actual-sha256'] !== undefined && args['actual-sha256'] !== '') {
    observation.actualSha256 = args['actual-sha256']
  }
  if (args['reason-code'] !== undefined && args['reason-code'] !== '') {
    observation.reasonCode = args['reason-code']
  }

  return observation
}

const args = parseArgs(process.argv.slice(2))
const result = resolveAcquisition({ canonical: observationFromArgs(args) })
console.log(formatAcquisitionResult(result))
process.exit(acquisitionExitCode(result))
