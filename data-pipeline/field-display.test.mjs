import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildStatuses } from './pipeline.mjs'

test('les libellés documentaires longs ne sont pas embarqués dans la valeur affichée', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'statuts-especes-'))
  const bdc = path.join(directory, 'bdc.csv')
  const longLabel = "Liste des espèces animales et végétales à la protection desquelles il ne peut être dérogé qu'après avis du Conseil national de la protection de la nature : Annexe 1"

  await fs.writeFile(
    bdc,
    [
      'cd_ref;cd_type_statut;lb_type_statut;code_statut;label_statut;cd_sig;cd_doc;full_citation;doc_url',
      `100;REGL;Réglementation nationale;INPN;${longLabel};ETATFRA;DOC1;Citation très longue;https://example.test/source`,
    ].join('\n'),
  )

  const statuses = await buildStatuses(bdc, [{ cdRef: 100 }])
  assert.equal(statuses.length, 13)
  assert.ok(statuses.every((status) => status.value === 'INPN'))
  assert.ok(statuses.every((status) => !('citation' in status) && !('documentUrl' in status)))
})
