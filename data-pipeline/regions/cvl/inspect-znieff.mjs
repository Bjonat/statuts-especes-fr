import fs from 'node:fs'
import XLSX from 'xlsx'

const filePath = process.argv[2]
if (!filePath) throw new Error('Usage: node inspect-znieff.mjs <fichier.xls>')

const buffer = fs.readFileSync(filePath)
console.log(`Fichier: ${buffer.length.toLocaleString('fr-FR')} octets`)
console.log(`Signature hex: ${buffer.subarray(0, 16).toString('hex')}`)

let workbook
try {
  workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
} catch (error) {
  const preview = buffer.subarray(0, 800).toString('utf8').replace(/\s+/g, ' ').trim()
  console.error(`Aperçu brut: ${preview}`)
  throw error
}

console.log(`Onglets (${workbook.SheetNames.length}) : ${workbook.SheetNames.join(' | ')}`)

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
  })
  const nonEmptyRows = rows.filter((row) => row.some((value) => String(value).trim()))
  console.log(`\n### ${sheetName} - ${nonEmptyRows.length} lignes non vides`)
  for (const row of nonEmptyRows.slice(0, 12)) {
    console.log(JSON.stringify(row))
  }
}
