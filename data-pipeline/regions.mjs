export const REGIONS = [
  {
    code: 'ARA',
    name: 'Auvergne-Rhône-Alpes',
    inseeCode: '84',
    departments: ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
    legacyRegions: [
      { code: '83', name: 'Auvergne', coversWholeRegion: false },
      { code: '82', name: 'Rhône-Alpes', coversWholeRegion: false },
    ],
  },
  {
    code: 'BFC',
    name: 'Bourgogne-Franche-Comté',
    inseeCode: '27',
    departments: ['21', '25', '39', '58', '70', '71', '89', '90'],
    legacyRegions: [
      { code: '26', name: 'Bourgogne', coversWholeRegion: false },
      { code: '43', name: 'Franche-Comté', coversWholeRegion: false },
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
      { code: '21', name: 'Champagne-Ardenne', coversWholeRegion: false },
      { code: '41', name: 'Lorraine', coversWholeRegion: false },
      { code: '42', name: 'Alsace', coversWholeRegion: false },
    ],
  },
  {
    code: 'HDF',
    name: 'Hauts-de-France',
    inseeCode: '32',
    departments: ['02', '59', '60', '62', '80'],
    legacyRegions: [
      { code: '31', name: 'Nord-Pas-de-Calais', coversWholeRegion: false },
      { code: '22', name: 'Picardie', coversWholeRegion: false },
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
      { code: '25', name: 'Basse-Normandie', coversWholeRegion: false },
      { code: '23', name: 'Haute-Normandie', coversWholeRegion: false },
    ],
  },
  {
    code: 'NAQ',
    name: 'Nouvelle-Aquitaine',
    inseeCode: '75',
    departments: ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
    legacyRegions: [
      { code: '54', name: 'Poitou-Charentes', coversWholeRegion: false },
      { code: '72', name: 'Aquitaine', coversWholeRegion: false },
      { code: '74', name: 'Limousin', coversWholeRegion: false },
    ],
  },
  {
    code: 'OCC',
    name: 'Occitanie',
    inseeCode: '76',
    departments: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
    legacyRegions: [
      { code: '73', name: 'Midi-Pyrénées', coversWholeRegion: false },
      { code: '91', name: 'Languedoc-Roussillon', coversWholeRegion: false },
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
