import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { resolveScope, REGIONS } from './regions.mjs'
import { buildStatuses, buildTaxa, parseDelimitedLine, statusCategory } from './pipeline.mjs'

test('le parseur conserve les séparateurs présents dans les champs CSV quotés', () => {
  assert.deepEqual(parseDelimitedLine('a;"b;c";"d""e"', ';'), ['a', 'b;c', 'd"e'])
})

test('ancienne Aquitaine est une portée partielle en Nouvelle-Aquitaine', () => {
  const naq = REGIONS.find((region) => region.code === 'NAQ')
  assert.ok(naq)
  assert.deepEqual(resolveScope('INSEER72', naq), {
    scope: 'partial',
    scopeLabel: 'ancienne région Aquitaine',
  })
})

test('ancienne région Centre couvre entièrement Centre-Val de Loire', () => {
  const cvl = REGIONS.find((region) => region.code === 'CVL')
  assert.ok(cvl)
  assert.deepEqual(resolveScope('INSEER24', cvl), {
    scope: 'regional',
    scopeLabel: 'Centre-Val de Loire',
  })
})

test('PNA reste distinct d’une protection nationale', () => {
  assert.equal(statusCategory('PNA'), 'pna')
  assert.equal(statusCategory('PN'), 'protection_national')
})

test('le pipeline rattache les synonymes TAXREF et filtre faune/flore', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'statuts-especes-'))
  const taxref = path.join(directory, 'taxref.txt')
  await fs.writeFile(
    taxref,
    [
      'REGNE\tFAMILLE\tCD_NOM\tCD_REF\tLB_NOM\tNOM_VERN',
      'Plantae\tFagaceae\t100\t100\tQuercus robur\tChêne pédonculé',
      'Plantae\tFagaceae\t101\t100\tQuercus pedunculata\t',
      'Animalia\tAlcedinidae\t200\t200\tAlcedo atthis\tMartin-pêcheur d’Europe',
      'Fungi\tAmanitaceae\t300\t300\tAmanita muscaria\tAmanite tue-mouches',
    ].join('\n'),
  )

  const taxa = await buildTaxa(taxref)
  assert.equal(taxa.length, 2)
  assert.deepEqual(taxa.find((taxon) => taxon.cdRef === 100)?.synonyms, ['Quercus pedunculata'])
  assert.equal(taxa.find((taxon) => taxon.cdRef === 200)?.realm, 'fauna')
})

test('le pipeline distingue statut régional complet et ancienne région partielle', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'statuts-especes-'))
  const bdc = path.join(directory, 'bdc.csv')
  await fs.writeFile(
    bdc,
    [
      'cd_ref;cd_type_statut;lb_type_statut;code_statut;label_statut;cd_sig;cd_doc;full_citation;doc_url',
      '100;LRR;Liste rouge régionale;LC;Préoccupation mineure;INSEER24;DOC1;Liste rouge Centre;https://example.test/lrr',
      '100;PR;Protection régionale;PR;Protégée;INSEER72;DOC2;Arrêté Aquitaine;https://example.test/pr',
      '100;LRN;Liste rouge nationale;LC;Préoccupation mineure;ETATFRA;DOC3;Liste rouge France;https://example.test/lrn',
    ].join('\n'),
  )

  const taxa = [{ cdRef: 100 }]
  const statuses = await buildStatuses(bdc, taxa)
  const cvlLrr = statuses.find((status) => status.region === 'CVL' && status.category === 'red_list_regional')
  const naqPr = statuses.find((status) => status.region === 'NAQ' && status.category === 'protection_regional')
  const occLrn = statuses.find((status) => status.region === 'OCC' && status.category === 'red_list_national')

  assert.equal(cvlLrr?.scope, 'regional')
  assert.equal(naqPr?.scope, 'partial')
  assert.equal(naqPr?.scopeLabel, 'ancienne région Aquitaine')
  assert.equal(occLrn?.scope, 'national')
})
