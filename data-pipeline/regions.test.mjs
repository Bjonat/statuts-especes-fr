import assert from 'node:assert/strict'
import test from 'node:test'
import {
  REGIONS,
  assertDepartmentInRegion,
  normalizeDepartment,
  partialScopeApplicability,
  resolveScope,
} from './regions.mjs'

function regionByCode(code) {
  const region = REGIONS.find((item) => item.code === code)
  assert.ok(region, code)
  return region
}

test('chaque département moderne est unique dans sa région', () => {
  const seen = new Map()
  for (const region of REGIONS) {
    const unique = new Set(region.departments)
    assert.equal(unique.size, region.departments.length, region.code)
    for (const department of region.departments) {
      assert.equal(seen.has(department), false, department)
      seen.set(department, region.code)
    }
  }
  assert.equal(seen.size, 96)
})

test('les partitions legacy fusionnées recouvrent exactement la région moderne', () => {
  for (const region of REGIONS) {
    const fused = region.legacyRegions.filter((legacy) => !legacy.coversWholeRegion)
    if (!fused.length) continue
    const union = fused.flatMap((legacy) => legacy.departments ?? [])
    assert.deepEqual([...union].sort(), [...region.departments].sort(), region.code)
    const seen = new Set()
    for (const department of union) {
      assert.equal(seen.has(department), false, `${region.code} ${department}`)
      seen.add(department)
    }
  }
})

test('resolveScope OCC reste inchangé pour ancienne région et département', () => {
  const occ = regionByCode('OCC')
  assert.deepEqual(resolveScope('INSEER73', occ), {
    scope: 'partial',
    scopeLabel: 'ancienne région Midi-Pyrénées',
  })
  assert.deepEqual(resolveScope('INSEED31', occ), {
    scope: 'partial',
    scopeLabel: 'département 31',
  })
})

test('CVL / Centre reste une portée régionale complète', () => {
  const cvl = regionByCode('CVL')
  assert.equal(cvl.legacyRegions[0].coversWholeRegion, true)
  assert.deepEqual(resolveScope('INSEER24', cvl), {
    scope: 'regional',
    scopeLabel: cvl.name,
  })
})

test('OCC 31 → Midi-Pyrénées ; OCC 34 → Languedoc-Roussillon', () => {
  assert.equal(
    partialScopeApplicability({
      regionCode: 'OCC',
      department: '31',
      scopeLabel: 'ancienne région Midi-Pyrénées',
    }),
    'applicable',
  )
  assert.equal(
    partialScopeApplicability({
      regionCode: 'OCC',
      department: '34',
      scopeLabel: 'ancienne région Midi-Pyrénées',
    }),
    'not_applicable',
  )
  assert.equal(
    partialScopeApplicability({
      regionCode: 'OCC',
      department: '34',
      scopeLabel: 'ancienne région Languedoc-Roussillon',
    }),
    'applicable',
  )
  assert.equal(
    partialScopeApplicability({
      regionCode: 'OCC',
      department: '31',
      scopeLabel: 'ancienne région Languedoc-Roussillon',
    }),
    'not_applicable',
  )
})

test('NAQ 33 → Aquitaine ; NAQ 86 → Poitou-Charentes', () => {
  assert.equal(
    partialScopeApplicability({
      regionCode: 'NAQ',
      department: '33',
      scopeLabel: 'ancienne région Aquitaine',
    }),
    'applicable',
  )
  assert.equal(
    partialScopeApplicability({
      regionCode: 'NAQ',
      department: '86',
      scopeLabel: 'ancienne région Aquitaine',
    }),
    'not_applicable',
  )
  assert.equal(
    partialScopeApplicability({
      regionCode: 'NAQ',
      department: '86',
      scopeLabel: 'Aquitaine',
    }),
    'not_applicable',
  )
  assert.equal(
    partialScopeApplicability({
      regionCode: 'NAQ',
      department: '86',
      scopeLabel: 'ancienne région Poitou-Charentes',
    }),
    'applicable',
  )
})

test('département direct', () => {
  assert.equal(
    partialScopeApplicability({ regionCode: 'OCC', department: '31', scopeLabel: 'département 31' }),
    'applicable',
  )
  assert.equal(
    partialScopeApplicability({ regionCode: 'OCC', department: '34', scopeLabel: 'département 31' }),
    'not_applicable',
  )
})

test('portée libre → indeterminate', () => {
  assert.equal(
    partialScopeApplicability({ regionCode: 'GES', department: '88', scopeLabel: 'Massif vosgien' }),
    'indeterminate',
  )
  assert.equal(
    partialScopeApplicability({ regionCode: 'OCC', department: '31', scopeLabel: undefined }),
    'indeterminate',
  )
})

test('département hors région → erreur', () => {
  assert.throws(() => assertDepartmentInRegion('NAQ', '31'), /Département 31 hors région NAQ/)
  assert.throws(
    () => partialScopeApplicability({ regionCode: 'OCC', department: '2a', scopeLabel: 'département 2A' }),
    /Département 2A hors région OCC/,
  )
})

test('2A / 2a : normalisation sans fuzzy 031', () => {
  assert.equal(normalizeDepartment('2a'), '2A')
  assert.equal(assertDepartmentInRegion('COR', '2a'), '2A')
  assert.equal(normalizeDepartment('031'), '031')
  assert.throws(() => assertDepartmentInRegion('OCC', '031'), /Département 031 hors région OCC/)
})
