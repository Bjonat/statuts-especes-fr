export const REGIONS = [
  {
    code: 'CVL',
    name: 'Centre-Val de Loire',
    inseeCode: '24',
    departments: ['18', '28', '36', '37', '41', '45'],
    legacyRegions: [{ code: '24', name: 'Centre', coversWholeRegion: true }],
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
