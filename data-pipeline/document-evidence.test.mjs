import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildStatusDictionary } from './compact.mjs'
import { buildStatusDocument, buildStatuses } from './pipeline.mjs'

const PAPILLONS_CITATION =
  'Gressette, S., Marques, D. &amp; Willmes M. 2024. <em>Liste rouge des Papillons de jour et Zygènes du Centre-Val de Loire</em>. CEN Centre-Val de Loire, FNE Centre-Val de Loire, DREAL Centre-Val de Loire. 28 pp.'
const PAPILLONS_URL = 'https://inpn.mnhn.fr/docs-web/docs/download/443486'
const ODONATES_CITATION =
  'Baeta, R. 2022. <em>Liste rouge des libellules et demoiselles du Centre–Val de Loire</em>. ANEPE Caudalis &amp; FNE Centre Val-de Loire. 25 pp.<br /><br />&nbsp;'

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

async function statusesFromRows(rows) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'statuts-especes-doc-'))
  const bdc = path.join(directory, 'bdc.csv')
  const header = [
    'cd_ref',
    'cd_type_statut',
    'lb_type_statut',
    'code_statut',
    'label_statut',
    'cd_sig',
    'cd_doc',
    'full_citation',
    'doc_url',
  ]
  const lines = [
    header.map(csvCell).join(','),
    ...rows.map((row) => header.map((key) => csvCell(row[key] ?? '')).join(',')),
  ]
  await fs.writeFile(bdc, lines.join('\n'))
  return buildStatuses(bdc, [{ cdRef: 100 }, { cdRef: 53663 }, { cdRef: 65262 }])
}

test('A. extraction complète cd_doc / full_citation / doc_url', async () => {
  const statuses = await statusesFromRows([
    {
      cd_ref: '100',
      cd_type_statut: 'LRN',
      lb_type_statut: 'Liste rouge nationale',
      code_statut: 'LC',
      label_statut: 'Préoccupation mineure',
      cd_sig: 'ETATFRA',
      cd_doc: 'DOC1',
      full_citation: 'Citation test',
      doc_url: 'https://example.test/doc',
    },
  ])
  assert.equal(statuses.length, 13)
  assert.ok(
    statuses.every((status) =>
      assert.deepEqual(status.document, {
        cdDoc: 'DOC1',
        citation: 'Citation test',
        url: 'https://example.test/doc',
      }) || true,
    ),
  )
})

test('B. cd_doc seul : objet document minimal', () => {
  assert.deepEqual(buildStatusDocument({ cd_doc: '  DOC-ONLY  ', full_citation: '  ', doc_url: '' }), {
    cdDoc: 'DOC-ONLY',
  })
})

test('C. pas de cd_doc : aucune preuve fabriquée', () => {
  assert.equal(
    buildStatusDocument({
      cd_doc: '   ',
      full_citation: 'Citation orpheline',
      doc_url: 'https://example.test/orphan',
    }),
    undefined,
  )
})

test('D. citation longue : value courte inchangée', async () => {
  const longLabel =
    "Liste des espèces animales et végétales à la protection desquelles il ne peut être dérogé qu'après avis du Conseil national de la protection de la nature : Annexe 1"
  const longCitation =
    'Liste des espèces animales et végétales à la protection desquelles il ne peut être dérogé qu’après avis du CNPN'
  const statuses = await statusesFromRows([
    {
      cd_ref: '100',
      cd_type_statut: 'REGL',
      lb_type_statut: 'Réglementation nationale',
      code_statut: 'INPN',
      label_statut: longLabel,
      cd_sig: 'ETATFRA',
      cd_doc: 'DOC1',
      full_citation: longCitation,
      doc_url: 'https://example.test/doc',
    },
  ])
  assert.ok(statuses.every((status) => status.value === 'INPN'))
  assert.ok(statuses.every((status) => status.document?.citation === longCitation))
})

test('E. deux cd_doc distincts : deux statuts et deux définitions', async () => {
  const statuses = await statusesFromRows([
    {
      cd_ref: '100',
      cd_type_statut: 'LRR',
      lb_type_statut: 'Liste rouge régionale',
      code_statut: 'VU',
      label_statut: 'Vulnérable',
      cd_sig: 'INSEER24',
      cd_doc: 'DOC-A',
      full_citation: 'Citation A',
      doc_url: 'https://example.test/a',
    },
    {
      cd_ref: '100',
      cd_type_statut: 'LRR',
      lb_type_statut: 'Liste rouge régionale',
      code_statut: 'VU',
      label_statut: 'Vulnérable',
      cd_sig: 'INSEER24',
      cd_doc: 'DOC-B',
      full_citation: 'Citation B',
      doc_url: 'https://example.test/b',
    },
  ])
  const cvl = statuses.filter((status) => status.region === 'CVL')
  assert.equal(cvl.length, 2)
  assert.deepEqual(
    cvl.map((status) => status.document.cdDoc).sort(),
    ['DOC-A', 'DOC-B'],
  )
  const { definitions } = buildStatusDictionary(cvl)
  assert.equal(definitions.length, 2)
})

test('sentinelles BDC v18 confirmées : 443486 (URL) et 411507 (sans URL)', async () => {
  const statuses = await statusesFromRows([
    {
      cd_ref: '53663',
      cd_type_statut: 'LRR',
      lb_type_statut: 'Liste rouge régionale',
      code_statut: 'RE',
      label_statut: 'Disparue au niveau régional',
      cd_sig: 'INSEER24',
      cd_doc: '443486',
      full_citation: PAPILLONS_CITATION,
      doc_url: PAPILLONS_URL,
    },
    {
      cd_ref: '65262',
      cd_type_statut: 'LRR',
      lb_type_statut: 'Liste rouge régionale',
      code_statut: 'LC',
      label_statut: 'Préoccupation mineure',
      cd_sig: 'INSEER24',
      cd_doc: '411507',
      full_citation: ODONATES_CITATION,
      doc_url: '',
    },
  ])

  const papillons = statuses.find((status) => status.cdRef === 53663 && status.region === 'CVL')
  const odonates = statuses.find((status) => status.cdRef === 65262 && status.region === 'CVL')

  assert.deepEqual(papillons?.document, {
    cdDoc: '443486',
    citation: PAPILLONS_CITATION,
    url: PAPILLONS_URL,
  })
  assert.deepEqual(odonates?.document, {
    cdDoc: '411507',
    citation: ODONATES_CITATION,
  })
  assert.equal('url' in (odonates?.document ?? {}), false)
})

test('cd_doc reste une chaîne opaque, même s’il est numérique', () => {
  const document = buildStatusDocument({ cd_doc: '443486' })
  assert.equal(document.cdDoc, '443486')
  assert.equal(typeof document.cdDoc, 'string')
})
