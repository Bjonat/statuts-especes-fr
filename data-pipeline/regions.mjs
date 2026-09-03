export const REGIONS = [
  {
    code: 'ARA',
    name: 'Auvergne-Rhône-Alpes',
    inseeCode: '84',
    departments: ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
    legacyRegions: [
      { code: '83', name: 'Auvergne', coversWholeRegion: false, departments: ['03', '15', '43', '63'] },
      { code: '82', name: 'Rhône-Alpes', coversWholeRegion: false, departments: ['01', '07', '26', '38', '42', '69', '73', '74'] },
    ],
  },
  {
    code: 'BFC',
    name: 'Bourgogne-Franche-Comté',
    inseeCode: '27',
    departments: ['21', '25', '39', '58', '70', '71', '89', '90'],
    legacyRegions: [
      { code: '26', name: 'Bourgogne', coversWholeRegion: false, departments: ['21', '58', '71', '89'] },
      { code: '43', name: 'Franche-Comté', coversWholeRegion: false, departments: ['25', '39', '70', '90'] },
    ],
  },
  {
    code: 'BRE',
    name: 'Bretagne',
    inseeCode: '53',
    departments: ['22', '29', '35', '56'],
    legacyRegions: [{ code: '53', name: 'Bretagne', coversWholeRegion: true }],
  },
  {
    code: 'CVL',
    name: 'Centre-Val de Loire',
    inseeCode: '24',
    departments: ['18', '28', '36', '37', '41', '45'],
    legacyRegions: [{ code: '24', name: 'Centre', coversWholeRegion: true }],
  },
  {
    code: 'COR',
    name: 'Corse',
    inseeCode: '94',
    departments: ['2A', '2B'],
    legacyRegions: [{ code: '94', name: 'Corse', coversWholeRegion: true }],
  },
  {
    code: 'GES',
    name: 'Grand Est',
    inseeCode: '44',
    departments: ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
    legacyRegions: [
      { code: '21', name: 'Champagne-Ardenne', coversWholeRegion: false, departments: ['08', '10', '51', '52'] },
      { code: '41', name: 'Lorraine', coversWholeRegion: false, departments: ['54', '55', '57', '88'] },
      { code: '42', name: 'Alsace', coversWholeRegion: false, departments: ['67', '68'] },
    ],
  },
  {
    code: 'HDF',
    name: 'Hauts-de-France',
    inseeCode: '32',
    departments: ['02', '59', '60', '62', '80'],
    legacyRegions: [
      { code: '31', name: 'Nord-Pas-de-Calais', coversWholeRegion: false, departments: ['59', '62'] },
      { code: '22', name: 'Picardie', coversWholeRegion: false, departments: ['02', '60', '80'] },
    ],
  },
  {
    code: 'IDF',
    name: 'Île-de-France',
    inseeCode: '11',
    departments: ['75', '77', '78', '91', '92', '93', '94', '95'],
    legacyRegions: [{ code: '11', name: 'Île-de-France', coversWholeRegion: true }],
  },
  {
    code: 'NOR',
    name: 'Normandie',
    inseeCode: '28',
    departments: ['14', '27', '50', '61', '76'],
    legacyRegions: [
      { code: '25', name: 'Basse-Normandie', coversWholeRegion: false, departments: ['14', '50', '61'] },
      { code: '23', name: 'Haute-Normandie', coversWholeRegion: false, departments: ['27', '76'] },
    ],
  },
  {
    code: 'NAQ',
    name: 'Nouvelle-Aquitaine',
    inseeCode: '75',
    departments: ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
    legacyRegions: [
      { code: '54', name: 'Poitou-Charentes', coversWholeRegion: false, departments: ['16', '17', '79', '86'] },
      { code: '72', name: 'Aquitaine', coversWholeRegion: false, departments: ['24', '33', '40', '47', '64'] },
      { code: '74', name: 'Limousin', coversWholeRegion: false, departments: ['19', '23', '87'] },
    ],
  },
  {
    code: 'OCC',
    name: 'Occitanie',
    inseeCode: '76',
    departments: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
    legacyRegions: [
      { code: '73', name: 'Midi-Pyrénées', coversWholeRegion: false, departments: ['09', '12', '31', '32', '46', '65', '81', '82'] },
      { code: '91', name: 'Languedoc-Roussillon', coversWholeRegion: false, departments: ['11', '30', '34', '48', '66'] },
    ],
  },
  {
    code: 'PDL',
    name: 'Pays de la Loire',
    inseeCode: '52',
    departments: ['44', '49', '53', '72', '85'],
    legacyRegions: [{ code: '52', name: 'Pays de la Loire', coversWholeRegion: true }],
  },
  {
    code: 'PAC',
    name: "Provence-Alpes-Côte d'Azur",
    inseeCode: '93',
    departments: ['04', '05', '06', '13', '83', '84'],
    legacyRegions: [{ code: '93', name: "Provence-Alpes-Côte d'Azur", coversWholeRegion: true }],
  },
]

const NATIONAL_SIGS = new Set(['ETATFRA', 'TERFXFR', 'EUROPE', 'WORLD'])

export function resolveScope(cdSig, region) {
  const sig = String(cdSig ?? '').trim().toUpperCase()
  if (!sig) return null

  if (NATIONAL_SIGS.has(sig)) {
    return { scope: 'national', scopeLabel: 'France / niveau supra-national' }
  }

  if (sig === `INSEENR${region.inseeCode}`) {
    return { scope: 'regional', scopeLabel: region.name }
  }

  for (const legacy of region.legacyRegions) {
    if (sig === `INSEER${legacy.code}`) {
      return legacy.coversWholeRegion
        ? { scope: 'regional', scopeLabel: region.name }
        : { scope: 'partial', scopeLabel: `ancienne région ${legacy.name}` }
    }
  }

  const department = region.departments.find((code) => sig === `INSEED${code}`)
  if (department) {
    return { scope: 'partial', scopeLabel: `département ${department}` }
  }

  return null
}

export function normalizeDepartment(value) {
  return String(value ?? '').trim().toUpperCase()
}

export function normalizeTerritoryName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function findRegion(regionCode) {
  return REGIONS.find((region) => region.code === regionCode) ?? null
}

export function assertDepartmentInRegion(regionCode, department) {
  const normalized = normalizeDepartment(department)
  const region = findRegion(regionCode)
  if (!region) throw new Error(`Région inconnue: ${regionCode}`)
  if (!normalized || !region.departments.includes(normalized)) {
    throw new Error(`Département ${normalized} hors région ${regionCode}`)
  }
  return normalized
}

function legacyDepartments(region, legacy) {
  if (legacy.coversWholeRegion) return region.departments
  return legacy.departments ?? []
}

function parsePartialGeography(region, scopeLabel) {
  const raw = String(scopeLabel ?? '').trim()
  if (!raw) return { kind: 'empty' }

  const nameKey = normalizeTerritoryName(raw)
  const departmentMatch = nameKey.match(/^departement\s+(.+)$/)
  if (departmentMatch) {
    return { kind: 'department', department: normalizeDepartment(departmentMatch[1]) }
  }

  const legacyMatch = nameKey.match(/^ancienne region\s+(.+)$/)
  const candidateName = legacyMatch ? legacyMatch[1] : nameKey
  for (const legacy of region.legacyRegions) {
    if (normalizeTerritoryName(legacy.name) === candidateName) {
      return { kind: 'legacy', departments: legacyDepartments(region, legacy) }
    }
  }
  return { kind: 'unknown' }
}

export function partialScopeApplicability({ regionCode, department, scopeLabel }) {
  const region = findRegion(regionCode)
  if (!region) throw new Error(`Région inconnue: ${regionCode}`)
  const requested = assertDepartmentInRegion(regionCode, department)
  const parsed = parsePartialGeography(region, scopeLabel)
  if (parsed.kind === 'department') {
    return parsed.department === requested ? 'applicable' : 'not_applicable'
  }
  if (parsed.kind === 'legacy') {
    return parsed.departments.includes(requested) ? 'applicable' : 'not_applicable'
  }
  return 'indeterminate'
}
