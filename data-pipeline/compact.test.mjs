import assert from 'node:assert/strict'
import test from 'node:test'
import { buildStatusDictionary, statusDefinitionKey, statusToCompactLink } from './compact.mjs'

test('les métadonnées identiques de statut ne sont stockées qu’une fois', () => {
  const common = {
    category: 'red_list_national',
    label: 'Liste rouge nationale',
    value: 'LC - Préoccupation mineure',
    sourceId: 'bdc-v18',
    scope: 'national',
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
    value: 'PR - Protégée',
    sourceId: 'bdc-v18',
    scope: 'partial',
    scopeLabel: 'ancienne région Aquitaine',
  }

  const { definitions, definitionIds } = buildStatusDictionary([status])
  assert.equal(definitions.length, 1)
  assert.equal('citation' in definitions[0], false)
  assert.equal('documentUrl' in definitions[0], false)
  assert.equal('document' in definitions[0], false)
  assert.deepEqual(statusToCompactLink(status, definitionIds), [106634, 0, 2, 'ancienne région Aquitaine'])
})

test('deux cdDoc différents produisent deux définitions, même catégorie/libellé/valeur/source', () => {
  const shared = {
    category: 'red_list_regional',
    label: 'Liste rouge régionale',
    value: 'VU - Vulnérable',
    sourceId: 'bdc-v18',
    scope: 'regional',
    region: 'CVL',
  }
  const first = {
    ...shared,
    cdRef: 53663,
    document: { cdDoc: '443486', citation: 'Citation A', url: 'https://example.test/a' },
  }
  const second = {
    ...shared,
    cdRef: 53724,
    document: { cdDoc: '411507', citation: 'Citation B' },
  }

  const { definitions, definitionIds } = buildStatusDictionary([first, second])
  assert.equal(definitions.length, 2)
  assert.equal(definitions[0].document.cdDoc !== definitions[1].document.cdDoc, true)
  assert.notEqual(statusDefinitionKey(first), statusDefinitionKey(second))
  assert.notEqual(definitionIds.get(statusDefinitionKey(first)), definitionIds.get(statusDefinitionKey(second)))
  assert.deepEqual(statusToCompactLink(first, definitionIds).slice(0, 3).length, 3)
  assert.equal(statusToCompactLink(first, definitionIds)[0], 53663)
  assert.equal(statusToCompactLink(second, definitionIds)[0], 53724)
  assert.notEqual(statusToCompactLink(first, definitionIds)[1], statusToCompactLink(second, definitionIds)[1])
})

test('un document identique est dédupliqué dans le dictionnaire', () => {
  const document = {
    cdDoc: '443486',
    citation: 'Citation partagée',
    url: 'https://example.test/doc',
  }
  const shared = {
    category: 'red_list_regional',
    label: 'Liste rouge régionale',
    value: 'LC - Préoccupation mineure',
    sourceId: 'bdc-v18',
    scope: 'regional',
    document,
  }
  const statuses = [
    { ...shared, cdRef: 100, region: 'CVL' },
    { ...shared, cdRef: 200, region: 'CVL' },
  ]

  const { definitions, definitionIds } = buildStatusDictionary(statuses)
  assert.equal(definitions.length, 1)
  assert.deepEqual(definitions[0].document, document)
  assert.deepEqual(statusToCompactLink(statuses[0], definitionIds), [100, 0, 1])
  assert.deepEqual(statusToCompactLink(statuses[1], definitionIds), [200, 0, 1])
})
