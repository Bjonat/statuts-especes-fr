import './styles.css'
import { loadDataStore } from './catalog'
import { searchTaxa } from './search'
import type { Realm, RegionCode, SourceDataset, StatusCategory, Taxon, TaxonStatus } from './types'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Élément #app introuvable')
const root = rootElement

const dataStore = await loadDataStore()
const { regions, sources } = dataStore

const storedRegion = localStorage.getItem('region')
const defaultRegion = regions.some((region) => region.code === storedRegion) ? (storedRegion as RegionCode) : 'CVL'

let installPrompt: BeforeInstallPromptEvent | null = null
let iosInstallHelpVisible = false

const state: {
  screen: 'home' | 'sources'
  realm: Realm | null
  region: RegionCode
  query: string
  selectedTaxon: Taxon | null
  taxa: Taxon[]
  statuses: TaxonStatus[]
  regionSources: SourceDataset[]
  loading: boolean
  error: string | null
  offlineReady: boolean
} = {
  screen: 'home',
  realm: null,
  region: defaultRegion,
  query: '',
  selectedTaxon: null,
  taxa: [],
  statuses: [],
  regionSources: [],
  loading: false,
  error: null,
  offlineReady: dataStore.datasetVersion === 'demo',
}

const STATUS_LABELS: Partial<Record<StatusCategory, string>> = {
  red_list_national: 'Liste rouge nationale',
  red_list_regional: 'Liste rouge régionale',
  protection_national: 'Protection nationale',
  protection_regional: 'Protection régionale',
  znieff: 'Déterminante ZNIEFF',
  regional_responsibility: 'Responsabilité biologique régionale',
  pna: "Plan national d'actions",
  rarity: 'Rareté',
  indigenous_status: 'Indigénat',
}

const STATUS_ORDER: StatusCategory[] = [
  'protection_national',
  'protection_regional',
  'red_list_national',
  'red_list_regional',
  'znieff',
  'regional_responsibility',
  'pna',
  'rarity',
  'indigenous_status',
  'other',
]

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }
    return entities[character]
  })
}

function cleanDisplayText(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/<\/?(?:em|i|strong|b)>/gi, '')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function renderDataNotice(): string {
  if (!dataStore.warning) return ''
  return `<aside class="warning" role="note">${escapeHtml(cleanDisplayText(dataStore.warning))}</aside>`
}

function offlineBadgeText(): string {
  if (state.offlineReady) return 'Hors ligne prêt'
  if (navigator.onLine) return 'Préparation hors ligne...'
  return 'Données hors ligne partielles'
}

function offlineBadge(): string {
  return `<span class="offline-badge">${escapeHtml(offlineBadgeText())}</span>`
}

function refreshOfflineBadges(): void {
  document.querySelectorAll<HTMLElement>('.offline-badge').forEach((badge) => {
    badge.textContent = offlineBadgeText()
  })
}

function isStandalone(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function canOfferInstall(): boolean {
  return !isStandalone() && Boolean(installPrompt || isIos())
}

function installMarkup(): string {
  return `
    <div class="install-area" id="install-area" ${canOfferInstall() ? '' : 'hidden'}>
      <button class="install-button" id="install-app" type="button">Installer l'application</button>
      <p class="install-help" id="install-help" ${iosInstallHelpVisible ? '' : 'hidden'}>
        Sur iPhone ou iPad : Partager &gt; Ajouter à l'écran d'accueil.
      </p>
    </div>
  `
}

function refreshInstallArea(): void {
  const area = document.querySelector<HTMLElement>('#install-area')
  if (!area) return
  area.hidden = !canOfferInstall()

  const help = document.querySelector<HTMLElement>('#install-help')
  if (help) help.hidden = !iosInstallHelpVisible
}

function bindInstallAction(): void {
  const button = document.querySelector<HTMLButtonElement>('#install-app')
  button?.addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (choice.outcome === 'accepted') installPrompt = null
      refreshInstallArea()
      return
    }

    if (isIos()) {
      iosInstallHelpVisible = !iosInstallHelpVisible
      refreshInstallArea()
    }
  })
}

function regionOptions(): string {
  return regions
    .map(
      (region) =>
        `<option value="${region.code}" ${region.code === state.region ? 'selected' : ''}>${escapeHtml(region.name)}</option>`,
    )
    .join('')
}

function formatCheckedDate(value?: string): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return 'date inconnue'
  return `${match[3]}/${match[2]}/${match[1]}`
}

function sourceSummary(statuses: TaxonStatus[]): string {
  if (!dataStore.official) return 'Sources et versions : données de démonstration'

  const taxref = sources.find((source) => source.id === 'taxref-v18')
  const bdc = sources.find((source) => source.id === 'bdc-v18')
  const bdcVersion = bdc?.version ?? taxref?.version ?? dataStore.datasetVersion
  const usedSourceIds = new Set(statuses.map((status) => status.sourceId))
  const regionalSources = sources.filter(
    (source) => !['taxref-v18', 'bdc-v18'].includes(source.id) && usedSourceIds.has(source.id),
  )

  const labels = [
    'TAXREF',
    `BDC-Statuts PatriNat-SINP ${bdcVersion}`,
    ...regionalSources.map((source) => `${cleanDisplayText(source.name)} ${cleanDisplayText(source.version)}`),
  ]
  const checkedAt = [taxref, bdc, ...regionalSources]
    .map((source) => source?.checkedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  return `Sources et versions : ${labels.join(' / ')} - vérifié le ${formatCheckedDate(checkedAt)}`
}

function shortStatusLabel(status: TaxonStatus): string {
  const mapped = STATUS_LABELS[status.category]
  if (mapped) return mapped

  const label = cleanDisplayText(status.label)
  if (/sans objet/i.test(label)) return 'Sans objet'
  if (/réglement/i.test(label)) return 'Réglementation'
  if (label.length <= 52) return label
  return 'Autre statut'
}

function shortStatusValue(status: TaxonStatus): string {
  const value = cleanDisplayText(status.value)
  if (value.length <= 72) return value

  const codeMatch = value.match(/^([A-Z0-9._/-]{1,16})\s+-\s+/)
  return codeMatch?.[1] ?? 'Oui'
}

function usefulStatus(status: TaxonStatus): boolean {
  const label = cleanDisplayText(status.label)
  const value = cleanDisplayText(status.value)
  return !/sans objet/i.test(label) && !/sans objet/i.test(value)
}

function sortedStatuses(statuses: TaxonStatus[]): TaxonStatus[] {
  return [...statuses]
    .filter(usefulStatus)
    .sort((left, right) => {
      const category = STATUS_ORDER.indexOf(left.category) - STATUS_ORDER.indexOf(right.category)
      if (category !== 0) return category
      return shortStatusLabel(left).localeCompare(shortStatusLabel(right), 'fr')
    })
}

async function loadRealmData(realm: Realm, region: RegionCode): Promise<void> {
  state.loading = true
  state.error = null
  render()

  try {
    const [taxa, statuses] = await Promise.all([dataStore.loadTaxa(realm), dataStore.loadStatuses(realm, region)])
    if (state.realm !== realm || state.region !== region) return
    state.taxa = taxa
    state.statuses = statuses
    state.loading = false
    render()
  } catch {
    if (state.realm !== realm || state.region !== region) return
    state.loading = false
    state.error = navigator.onLine
      ? 'Impossible de charger les référentiels locaux. Réessayez.'
      : "Ce jeu de données n'est pas encore disponible hors connexion sur cet appareil."
    render()
  }
}

async function chooseRealm(realm: Realm): Promise<void> {
  state.screen = 'home'
  state.realm = realm
  state.query = ''
  state.selectedTaxon = null
  state.taxa = []
  state.statuses = []
  await loadRealmData(realm, state.region)
}

async function changeRegion(region: RegionCode): Promise<void> {
  state.region = region
  state.selectedTaxon = null
  state.statuses = []
  localStorage.setItem('region', region)
  if (state.screen === 'sources') {
    await loadRegionSources(region)
    return
  }
  if (state.realm) await loadRealmData(state.realm, region)
  else render()
}

async function loadRegionSources(region: RegionCode): Promise<void> {
  state.loading = true
  state.error = null
  render()

  try {
    const regionSources = await dataStore.listSourcesForRegion(region)
    if (state.screen !== 'sources' || state.region !== region) return
    state.regionSources = regionSources
    state.loading = false
    render()
  } catch {
    if (state.screen !== 'sources' || state.region !== region) return
    state.loading = false
    state.error = navigator.onLine
      ? 'Impossible de charger la liste des sources. Réessayez.'
      : "Ce jeu de données n'est pas encore disponible hors connexion sur cet appareil."
    render()
  }
}

async function openSources(): Promise<void> {
  state.screen = 'sources'
  state.realm = null
  state.query = ''
  state.selectedTaxon = null
  state.taxa = []
  state.statuses = []
  state.regionSources = []
  await loadRegionSources(state.region)
}

function closeSources(): void {
  state.screen = 'home'
  state.loading = false
  state.error = null
  state.regionSources = []
  render()
}

function bindRegionSelect(): void {
  const select = document.querySelector<HTMLSelectElement>('#region-select')
  select?.addEventListener('change', () => {
    void changeRegion(select.value as RegionCode)
  })
}

function renderRealmChoice(): void {
  root.innerHTML = `
    <main class="shell shell--centered">
      <section class="panel hero" aria-labelledby="app-title">
        <p class="eyebrow">Statuts espèces FR</p>
        <h1 id="app-title">Que recherchez-vous&nbsp;?</h1>
        <p class="intro">Consultez les statuts d'une espèce en quelques secondes, même hors connexion.</p>
        <div class="realm-grid">
          <button class="realm-card" data-realm="flora" type="button">
            <span class="realm-icon" aria-hidden="true">🌿</span>
            <span>Flore</span>
          </button>
          <button class="realm-card" data-realm="fauna" type="button">
            <span class="realm-icon" aria-hidden="true">🦋</span>
            <span>Faune</span>
          </button>
        </div>
        ${installMarkup()}
        <button class="sources-button" id="open-sources" type="button">Sources</button>
        <div class="home-status">${offlineBadge()}</div>
      </section>
      ${renderDataNotice()}
    </main>
  `

  document.querySelectorAll<HTMLButtonElement>('[data-realm]').forEach((button) => {
    button.addEventListener('click', () => {
      void chooseRealm(button.dataset.realm as Realm)
    })
  })
  document.querySelector<HTMLButtonElement>('#open-sources')?.addEventListener('click', () => {
    void openSources()
  })
  bindInstallAction()
}

function renderSources(): void {
  const region = regions.find((item) => item.code === state.region)

  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="link-button" id="back-home" type="button">← Accueil</button>
        ${offlineBadge()}
      </header>

      <section class="panel" aria-labelledby="sources-title">
        <p class="eyebrow">Provenance</p>
        <h1 id="sources-title">Sources</h1>
        <p class="intro">Référentiels utilisés pour ${escapeHtml(region?.name ?? state.region)}.</p>

        <label class="field-label" for="region-select">Région</label>
        <select id="region-select" class="field-control">${regionOptions()}</select>

        ${
          state.loading
            ? '<p class="empty-state" aria-live="polite">Chargement des sources…</p>'
            : state.error
              ? `<p class="empty-state" role="alert">${escapeHtml(state.error)}</p>
                 <button class="primary-button" id="retry-sources" type="button">Réessayer</button>`
              : state.regionSources.length
                ? `<ul class="source-list">
                    ${state.regionSources
                      .map(
                        (source) => `
                          <li class="source-item">
                            <p class="source-name">${escapeHtml(cleanDisplayText(source.name))}</p>
                            <p class="source-meta">${escapeHtml(cleanDisplayText(source.producer))}</p>
                            <p class="source-meta">
                              Version ${escapeHtml(cleanDisplayText(source.version))}
                              ${source.publicationYear ? ` · ${source.publicationYear}` : ''}
                              ${source.checkedAt ? ` · vérifié le ${escapeHtml(formatCheckedDate(source.checkedAt))}` : ''}
                            </p>
                          </li>
                        `,
                      )
                      .join('')}
                  </ul>`
                : '<p class="empty-state">Aucune source listée pour cette région dans le jeu chargé.</p>'
        }
      </section>

      ${renderDataNotice()}
    </main>
  `

  bindRegionSelect()
  document.querySelector<HTMLButtonElement>('#back-home')?.addEventListener('click', closeSources)
  document.querySelector<HTMLButtonElement>('#retry-sources')?.addEventListener('click', () => {
    void loadRegionSources(state.region)
  })
}

function renderLoading(): void {
  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="link-button" id="cancel-loading" type="button">← Retour</button>
        ${offlineBadge()}
      </header>
      <section class="panel loading-panel" aria-live="polite">
        <p class="eyebrow">${state.realm === 'flora' ? 'Flore' : 'Faune'}</p>
        <h1>Chargement des données locales...</h1>
        <p class="intro">Le prochain accès utilisera le cache de l'appareil.</p>
      </section>
    </main>
  `

  document.querySelector<HTMLButtonElement>('#cancel-loading')?.addEventListener('click', () => {
    state.realm = null
    state.screen = 'home'
    state.loading = false
    state.error = null
    render()
  })
}

function renderError(): void {
  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="link-button" id="error-back" type="button">← Retour</button>
        ${offlineBadge()}
      </header>
      <section class="panel">
        <p class="eyebrow">Données indisponibles</p>
        <h1>Référentiel non chargé</h1>
        <p class="intro">${escapeHtml(state.error ?? 'Une erreur est survenue.')}</p>
        <button class="primary-button" id="retry-load" type="button">Réessayer</button>
      </section>
    </main>
  `

  document.querySelector<HTMLButtonElement>('#error-back')?.addEventListener('click', () => {
    state.realm = null
    state.screen = 'home'
    state.error = null
    render()
  })
  document.querySelector<HTMLButtonElement>('#retry-load')?.addEventListener('click', () => {
    if (state.realm) void loadRealmData(state.realm, state.region)
  })
}

function renderSearch(): void {
  if (!state.realm) return

  const results = searchTaxa(state.taxa, state.realm, state.query)
  const realmLabel = state.realm === 'flora' ? 'Flore' : 'Faune'

  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="link-button" id="change-realm" type="button">← ${realmLabel}</button>
        ${offlineBadge()}
      </header>

      <section class="panel">
        <label class="field-label" for="region-select">Région</label>
        <select id="region-select" class="field-control">${regionOptions()}</select>

        <label class="field-label field-label--spaced" for="taxon-search">Espèce</label>
        <input
          id="taxon-search"
          class="field-control search-input"
          type="search"
          value="${escapeHtml(state.query)}"
          placeholder="Ex. chêne, Quercus, martin..."
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
        />
        <p class="field-hint">Nom scientifique ou vernaculaire, partiel ou approximatif.</p>

        <div class="results" aria-live="polite">
          ${
            state.query.length < 2
              ? '<p class="empty-state">Saisissez au moins 2 caractères.</p>'
              : results.length
                ? results
                    .map(
                      (taxon) => `
                        <button class="result-row" type="button" data-cd-ref="${taxon.cdRef}">
                          <span class="result-main">${escapeHtml(taxon.vernacularNames[0] ?? taxon.scientificName)}</span>
                          <span class="result-scientific"><i>${escapeHtml(taxon.scientificName)}</i></span>
                          ${taxon.family ? `<span class="result-family">${escapeHtml(taxon.family)}</span>` : ''}
                        </button>
                      `,
                    )
                    .join('')
                : '<p class="empty-state">Aucun résultat dans les données locales.</p>'
          }
        </div>
      </section>

      ${renderDataNotice()}
    </main>
  `

  bindRegionSelect()

  document.querySelector<HTMLButtonElement>('#change-realm')?.addEventListener('click', () => {
    state.realm = null
    state.screen = 'home'
    state.query = ''
    state.selectedTaxon = null
    render()
  })

  const input = document.querySelector<HTMLInputElement>('#taxon-search')
  input?.addEventListener('input', () => {
    state.query = input.value
    render()
    const refreshedInput = document.querySelector<HTMLInputElement>('#taxon-search')
    refreshedInput?.focus()
    refreshedInput?.setSelectionRange(state.query.length, state.query.length)
  })

  document.querySelectorAll<HTMLButtonElement>('[data-cd-ref]').forEach((button) => {
    button.addEventListener('click', () => {
      const cdRef = Number(button.dataset.cdRef)
      state.selectedTaxon = state.taxa.find((taxon) => taxon.cdRef === cdRef) ?? null
      render()
    })
  })
}

function renderDetail(): void {
  const taxon = state.selectedTaxon
  if (!taxon || !state.realm) return

  const region = regions.find((item) => item.code === state.region)
  const taxonStatuses = sortedStatuses(state.statuses.filter((status) => status.cdRef === taxon.cdRef))

  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="link-button" id="back-to-search" type="button">← Recherche</button>
        ${offlineBadge()}
      </header>

      <section class="panel taxon-card">
        <p class="eyebrow">${state.realm === 'flora' ? 'Flore' : 'Faune'} - ${escapeHtml(region?.name ?? state.region)}</p>
        <h1>${escapeHtml(taxon.vernacularNames[0] ?? taxon.scientificName)}</h1>
        <p class="scientific-name"><i>${escapeHtml(taxon.scientificName)}</i></p>
        <p class="taxon-meta">${taxon.family ? `${escapeHtml(taxon.family)} - ` : ''}CD_REF ${taxon.cdRef}</p>

        <div class="divider"></div>

        <h2>Statuts</h2>
        ${
          taxonStatuses.length
            ? `<dl class="status-list">
                ${taxonStatuses
                  .map(
                    (status) => `
                      <div class="status-row">
                        <dt>
                          ${escapeHtml(shortStatusLabel(status))}
                          ${status.scope === 'partial' && status.scopeLabel ? `<small>Portée : ${escapeHtml(cleanDisplayText(status.scopeLabel))}</small>` : ''}
                        </dt>
                        <dd>${escapeHtml(shortStatusValue(status))}</dd>
                      </div>
                    `,
                  )
                  .join('')}
              </dl>`
            : '<p class="empty-state">Aucun statut disponible pour ce taxon et cette région dans les référentiels chargés.</p>'
        }

        <p class="source-summary">${escapeHtml(sourceSummary(taxonStatuses))}</p>
      </section>

      ${renderDataNotice()}
    </main>
  `

  document.querySelector<HTMLButtonElement>('#back-to-search')?.addEventListener('click', () => {
    state.selectedTaxon = null
    render()
  })
}

function render(): void {
  if (state.screen === 'sources') {
    renderSources()
    return
  }

  if (!state.realm) {
    renderRealmChoice()
    return
  }

  if (state.loading) {
    renderLoading()
    return
  }

  if (state.error) {
    renderError()
    return
  }

  if (state.selectedTaxon) {
    renderDetail()
    return
  }

  renderSearch()
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  installPrompt = event as BeforeInstallPromptEvent
  refreshInstallArea()
})

window.addEventListener('appinstalled', () => {
  installPrompt = null
  iosInstallHelpVisible = false
  refreshInstallArea()
})

window.addEventListener('online', refreshOfflineBadges)
window.addEventListener('offline', refreshOfflineBadges)

render()
void dataStore.primeOffline().then((ready) => {
  state.offlineReady = ready
  refreshOfflineBadges()
})
