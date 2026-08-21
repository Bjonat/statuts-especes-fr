import XLSX from 'xlsx'

const filePath = process.argv[2]
if (!filePath) throw new Error('Usage: node inspect-znieff.mjs <fichier.xls>')

const workbook = XLSX.readFile(filePath, { cellDates: false })
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
