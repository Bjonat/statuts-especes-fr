import { describe, expect, it } from 'vitest'

// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { readFileSync } from 'node:fs'
// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { dirname, join } from 'node:path'
// @ts-expect-error Node builtin resolved by Vitest; no @types/node in the app tsconfig.
import { fileURLToPath } from 'node:url'

const mainSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'main.ts'), 'utf8')

function functionBody(source: string, name: string): string {
  const marker = `function ${name}(`
  const start = source.indexOf(marker)
  expect(start, `${name}() must exist`).toBeGreaterThan(-1)
  const openBrace = source.indexOf('{', start)
  expect(openBrace).toBeGreaterThan(-1)
  let depth = 0
  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return source.slice(openBrace, index + 1)
    }
  }
  throw new Error(`Could not extract ${name}() body`)
}

describe('PWA taxon card presentation', () => {
  it('renders identity, territory and resolver statuses without a second business pass', () => {
    const body = functionBody(mainSource, 'renderDetail')
    expect(body).toMatch(/\bresolveStatuses\s*\(/)
    expect(body).toMatch(/const taxonStatuses = result\.statuses/)
    expect(body).toMatch(/taxon\.vernacularNames\[0\]/)
    expect(body).toMatch(/taxon\.scientificName/)
    expect(body).toMatch(/taxon\.family/)
    expect(body).toMatch(/CD_REF \$\{taxon\.cdRef\}/)
    expect(body).toMatch(/<h1>/)
    expect(body).toMatch(/taxon-territory-heading/)
    expect(body).toMatch(/>Territoire</)
    expect(body).toMatch(/département \$\{state\.department\}/)
    expect(body).toMatch(/Toute la région/)
    expect(body).toMatch(/Les statuts affichés correspondent à ce territoire/)
    expect(body).toMatch(/taxonStatuses\s*\.map\(/)
    expect(body).toMatch(/shortStatusLabel\(status\)/)
    expect(body).toMatch(/shortStatusValue\(status\)/)
    expect(body).toMatch(/status\.scope === 'partial'/)
    expect(body).toMatch(/Portée :/)
    expect(body).toMatch(/renderStatusHelpPanel\(status, index\)/)
    expect(body).toMatch(/renderStatusSourcePanel\(status, index\)/)
    expect(body).toMatch(/sourceSummary\(\s*taxonStatuses\s*\)/)
    expect(body).toMatch(/NO_IDENTIFIED_STATUS_MESSAGE/)
    expect(body).not.toMatch(/aucun enjeu/i)
    expect(body).not.toMatch(/non protégée/i)
    expect(body).not.toMatch(/taxonStatuses\.filter/)
    expect(body).not.toMatch(/taxonStatuses\.sort/)
    expect(body).not.toMatch(/\bcd_doc\b/)
  })

  it('keeps status help accessible and closable from the card', () => {
    const detail = functionBody(mainSource, 'renderDetail')
    const help = functionBody(mainSource, 'renderStatusHelpPanel')
    expect(detail).toMatch(/buildStatusHelp|renderStatusHelpPanel/)
    expect(detail).toMatch(/aria-expanded="false"/)
    expect(detail).toMatch(/aria-controls="status-help-\$\{index\}"/)
    expect(detail).toMatch(/data-help-toggle/)
    expect(detail).toMatch(/Aide sur ce statut/)
    expect(help).toMatch(/buildStatusHelp\(status\)/)
    expect(help).toMatch(/data-help-close/)
    expect(detail).toMatch(/aria-expanded', 'true'/)
    expect(detail).toMatch(/closeAllStatusHelp/)
  })

  it('keeps territorial warnings distinct from statuses and escaped', () => {
    const notices = functionBody(mainSource, 'renderTerritoryNotices')
    const detail = functionBody(mainSource, 'renderDetail')
    expect(detail).toMatch(/renderTerritoryNotices\(\s*result\.warnings\s*\)/)
    expect(notices).toMatch(/escapeHtml\(warnings/)
    expect(notices).toMatch(/role="note"/)
    expect(notices).toMatch(/territory-notice/)
    expect(notices).toMatch(/Avertissement territorial/)
    expect(notices).not.toMatch(/class="warning"/)
  })

  it('binds each status to its sourceId without guessing from label or category', () => {
    const detail = functionBody(mainSource, 'renderDetail')
    const panel = functionBody(mainSource, 'renderStatusSourcePanel')
    expect(mainSource).toMatch(
      /import\s+\{[^}]*\bstatusSourceView\b[^}]*\}\s+from\s+['"]\.\/source-display['"]/,
    )
    expect(panel).toMatch(/statusSourceView\(\s*status,\s*store\(\)\.sources\s*\)/)
    expect(panel).toMatch(/MISSING_STATUS_SOURCE_MESSAGE|view\.message/)
    expect(panel).toMatch(/sourceId :/)
    expect(panel).not.toMatch(/status\.category/)
    expect(panel).not.toMatch(/status\.label/)
    expect(panel).not.toMatch(/status\.value/)
    expect(panel).not.toMatch(/taxref-v18/)
    expect(panel).not.toMatch(/bdc-v18/)
    expect(detail).toMatch(/data-source-toggle/)
    expect(detail).toMatch(/aria-controls="status-source-\$\{index\}"/)
    expect(detail).toMatch(/>Source</)
    expect(detail).toMatch(/closeAllStatusSources/)
    expect(detail).not.toMatch(/\bcd_doc\b/)
    expect(detail).not.toMatch(/legifrance/i)
  })

  it('does not introduce network work when the department changes on the card', () => {
    const body = functionBody(mainSource, 'changeDepartment')
    expect(body).not.toMatch(/\bfetch\s*\(/)
    expect(body).not.toMatch(/\bloadRealmData\b/)
    expect(body).not.toMatch(/\bloadTaxa\b/)
    expect(body).not.toMatch(/\bloadStatuses\b/)
    expect(body).not.toMatch(/selectedTaxon/)
    expect(body).toMatch(/\brender\s*\(\s*\)/)
  })
})
