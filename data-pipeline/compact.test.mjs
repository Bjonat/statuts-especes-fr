import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStatusDictionary, statusToCompactLink } from './compact.mjs'

test('les métadonnées identiques de statut ne sont stockées qu’une fois', () => {
  const common = {
    category: 'red_list_national',
    label: 'Liste rouge nationale',
    value: 'LC — Préoccupation mineure',
    sourceId: 'bdc-v18',
    scope: 'national',
    citation: 'Liste rouge France',
    documentUrl: 'https://example.test/lrn',
  }
  const statuses = [
    { ...common, cdRef: 100, region: 'CVL' },
    { ...common, cdRef: 100, region: 'NAQ' },
    { ...common, cdRef: 200, region: 'CVL' },
  ]

  const { definitions, definitionIds } = buildStatusDictionary(statuses)
  assert.equal(definitions.length, 1)
  assert.deepEqual(statusToCompactLink(statuses[0], definitionIds), [100, 0, 0])
  assert.deepEqual(statusToCompactLink(statuses[2], definitionIds), [200, 0, 0])
})

test('une portée partielle conserve uniquement son libellé territorial dans le lien', () => {
  const status = {
    cdRef: 106634,
    region: 'NAQ',
    category: 'protection_regional',
    label: 'Protection régionale',
    value: 'PR — Protégée',
    sourceId: 'bdc-v18',
    scope: 'partial',
    scopeLabel: 'ancienne région Aquitaine',
    citation: 'Arrêté Aquitaine',
  }

  const { definitions, definitionIds } = buildStatusDictionary([status])
  assert.equal(definitions.length, 1)
  assert.equal(definitions[0].citation, 'Arrêté Aquitaine')
  assert.deepEqual(statusToCompactLink(status, definitionIds), [106634, 0, 2, 'ancienne région Aquitaine'])
})
