import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { writeDataset } from './build.mjs'

test('writeDataset records bytes equal to the written JSON file size', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'statuts-build-bytes-'))
  try {
    const rows = [
      { cdRef: 1, name: 'Carex' },
      { cdRef: 2, name: 'Quercus' },
    ]
    const result = await writeDataset(directory, 'taxa-flora', rows)
    const filePath = path.join(directory, result.file)
    const stats = await fs.stat(filePath)
    assert.equal(result.count, 2)
    assert.equal(result.bytes, stats.size)
    assert.ok(Number.isInteger(result.bytes))
    assert.ok(result.bytes > 0)
    assert.match(result.file, /^taxa-flora-[a-f0-9]+\.json$/)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
