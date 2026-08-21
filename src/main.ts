import './styles.css'
import { loadDataStore } from './catalog'
import { searchTaxa } from './search'
import type { Realm, RegionCode, SourceDataset, Taxon, TaxonStatus } from './types'

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

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null
let installHelp: string | null = null
let installed = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

const state: {
  realm: Realm | null
  region: RegionCode
  query: string
  selectedTaxon: Taxon | null
  taxa: Taxon[]
  statuses: TaxonStatus[]
  loading: boolean
  error: string | null
  offlineReady: boolean
} = {
  realm: null,
  region: defaultRegion,
  query: '',
  selectedTaxon: null,
  taxa: [],
  statuses: [],
  loading: false,
  error: null,
  offlineReady: dataStore.datasetVersion === 'demo',
}

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

function normalizeUiText(value: string): string {
  return value.replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim()
}

function formatDate(value?: string): string {
  if (!value) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function renderDataNotice(): string {
  if (!dataStore.warning) return ''
  return `<aside class="warning" role="note">${escapeHtml(normalizeUiText(dataStore.warning))}</aside>`
}

function offlineBadgeText(): string {
  if (state.offlineReady) return 'Hors ligne prêt'
  if (navigator.onLine) return 'Préparation hors ligne...'
  return 'Données hors ligne partielles'
}

function offlineBadge(): string {
  return `<span class="offline-badge">${escapeHtml(offlineBadgeText())}</span>`
}

function installButton(): string {
  if (installed) return ''
  return '<button class="install-button" id="install-app" type="button">Installer</button>'
}

function headerActions(): string {
  return `<div class="topbar-actions"><span class="install-action-slot">${installButton()}</span>${offlineBadge()}</div>`
}

function renderInstallHelp(): string {
  if (!installHelp) return ''
  return `
    <aside class="install-help" role="status">
      <span>${escapeHtml(installHelp)}</span>
      <button id="close-install-help" class="install-help-close" type="button">Fermer</button>
    </aside>
  `
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

async function requestInstall(): Promise<void> {
  if (deferredInstallPrompt) {
    const prompt = deferredInstallPrompt
    deferredInstallPrompt = null
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      installed = true
      installHelp = null
      render()
    }
    return
  }

  installHelp = isIos()
    ? 'Sur iPhone ou iPad : ouvrez Partager puis choisissez Ajouter à l’écran d’accueil.'
    : 'Dans le menu du navigateur, choisissez Installer l’application ou Ajouter à l’écran d’accueil.'
  render()
}

function bindCommonActions(): void {
  document.querySelector<HTMLButtonElement>('#install-app')?.addEventListener('click', () => {
    void requestInstall()
  })
  document.querySelector<HTMLButtonElement>('#close-install-help')?.addEventListener('click', () => {
    installHelp = null
    render()
  })
}

function refreshOfflineBadges(): void {
  document.querySelectorAll<HTMLElement>('.offline-badge').forEach((badge) => {
    badge.textContent = offlineBadgeText()
  })
}

function refreshInstallButtons(): void {
  document.querySelectorAll<HTMLElement>('.install-action-slot').forEach((slot) => {
    slot.innerHTML = installButton()
  })
  document.querySelectorAll<HTMLButtonElement>('#install-app').forEach((button) => {
    button.addEventListener('click', () => void requestInstall())
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

function statusLabel(status: TaxonStatus): string {
  const labels: Partial<Record<TaxonStatus['category'], string>> = {
    red_list_national: 'Liste rouge nationale',
    red_list_regional: 'Liste rouge régionale',
    protection_national: 'Protection nationale',
    protection_regional: 'Protection régionale',
    znieff: 'Déterminante ZNIEFF',
    pna: "Plan national d'actions",
    rarity: 'Rareté',
    indigenous_status: 'Indigénat',
  }
  return labels[status.category] ?? normalizeUiText(status.label)
}

function statusValue(status: TaxonStatus): string {
  const value = normalizeUiText(status.value)
  const longValue = /^([^:-]{1,24})(?:\s+-\s+|:\s+)(.{60,})$/.exec(value)
  if (longValue) return longValue[1].trim()
  if (value.length > 80) {
    const code = /^([A-Z0-9][A-Z0-9_./() -]{0,20})\b/.exec(value)?.[1]?.trim()
    return code || 'Oui'
  }
  return value || 'Oui'
}

function sourceSummary(): string {
  const bdc = sources.find((source) => source.id === 'bdc-v18') ?? sources.find((source) => /statut/i.test(source.name))
  const checkedAt = bdc?.checkedAt ?? sources.find((source) => source.checkedAt)?.checkedAt
  const version = bdc?.version ?? 'v18'
  const date = formatDate(checkedAt) || formatDate(dataStore.generatedAt)
  return `Sources et versions : TAXREF / BDC-Statuts PatriNat-SINP ${normalizeUiText(version)}${date ? ` - vérifié le ${date}` : ''}`
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
      : 'Ce jeu de données n’est pas encore disponible hors connexion sur cet appareil.'
    render()
  }
}

async function chooseRealm(realm: Realm): Promise<void> {
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
  if (state.realm) await loadRealmData(state.realm, region)
  else render()
}

function bindRegionSelect(): void {
  const select = document.querySelector<HTMLSelectElement>('#region-select')
  select?.addEventListener('change', () => void changeRegion(select.value as RegionCode))
}

function renderRealmChoice(): void {
  root.innerHTML = `
    <main class="shell shell--centered">
      <section class="panel hero" aria-labelledby="app-title">
        <p class="eyebrow">Statuts espèces FR</p>
        <h1 id="app-title">Que recherchez-vous&nbsp;?</h1>
        <p class="intro">Consultez les statuts d'une espèce en quelques secondes, même hors connexion.</p>
        <div class="realm-grid">
          <button class="realm-card" data-realm="flora" type="button"><span class="realm-icon" aria-hidden="true">🌿</span><span>Flore</span></button>
          <button class="realm-card" data-realm="fauna" type="button"><span class="realm-icon" aria-hidden="true">🦋</span><span>Faune</span></button>
        </div>
        <div class="home-actions"><span class="install-action-slot">${installButton()}</span>${offlineBadge()}</div>
        ${renderInstallHelp()}
      </section>
      ${renderDataNotice()}
    </main>
  `
  document.querySelectorAll<HTMLButtonElement>('[data-realm]').forEach((button) => {
    button.addEventListener('click', () => void chooseRealm(button.dataset.realm as Realm))
  })
  bindCommonActions()
}

function renderLoading(): void {
  root.innerHTML = `
    <main class="shell">
      <header class="topbar"><button class="link-button" id="cancel-loading" type="button">← Retour</button>${headerActions()}</header>
      ${renderInstallHelp()}
      <section class="panel loading-panel" aria-live="polite">
        <p class="eyebrow">${state.realm === 'flora' ? 'Flore' : 'Faune'}</p>
        <h1>Chargement des données locales...</h1>
        <p class="intro">Le prochain accès utilisera le cache de l’appareil.</p>
      </section>
    </main>
  `
  document.querySelector<HTMLButtonElement>('#cancel-loading')?.addEventListener('click', () => {
    state.realm = null
    state.loading = false
    state.error = null
    render()
  })
  bindCommonActions()
}

function renderError(): void {
  root.innerHTML = `
    <main class="shell">
      <header class="topbar"><button class="link-button" id="error-back" type="button">← Retour</button>${headerActions()}</header>
      ${renderInstallHelp()}
      <section class="panel">
        <p class="eyebrow">Données indisponibles</p><h1>Référentiel non chargé</h1>
        <p class="intro">${escapeHtml(state.error ?? 'Une erreur est survenue.')}</p>
        <button class="primary-button" id="retry-load" type="button">Réessayer</button>
      </section>
    </main>
  `
  document.querySelector<HTMLButtonElement>('#error-back')?.addEventListener('click', () => {
    state.realm = null
    state.error = null
    render()
  })
  document.querySelector<HTMLButtonElement>('#retry-load')?.addEventListener('click', () => {
    if (state.realm) void loadRealmData(state.realm, state.region)
  })
  bindCommonActions()
}

function renderSearch(): void {
  if (!state.realm) return
  const results = searchTaxa(state.taxa, state.realm, state.query)
  const realmLabel = state.realm === 'flora' ? 'Flore' : 'Faune'
  root.innerHTML = `
    <main class="shell">
      <header class="topbar"><button class="link-button" id="change-realm" type="button">← ${realmLabel}</button>${headerActions()}</header>
      ${renderInstallHelp()}
      <section class="panel">
        <label class="field-label" for="region-select">Région</label>
        <select id="region-select" class="field-control">${regionOptions()}</select>
        <label class="field-label field-label--spaced" for="taxon-search">Espèce</label>
        <input id="taxon-search" class="field-control search-input" type="search" value="${escapeHtml(state.query)}" placeholder="Ex. chêne, Quercus, martin..." autocomplete="off" autocapitalize="none" spellcheck="false" />
        <p class="field-hint">Nom scientifique ou vernaculaire, partiel ou approximatif.</p>
        <div class="results" aria-live="polite">
          ${state.query.length < 2
            ? '<p class="empty-state">Saisissez au moins 2 caractères.</p>'
            : results.length
              ? results.map((taxon) => `
                  <button class="result-row" type="button" data-cd-ref="${taxon.cdRef}">
                    <span class="result-main">${escapeHtml(taxon.vernacularNames[0] ?? taxon.scientificName)}</span>
                    <span class="result-scientific"><i>${escapeHtml(taxon.scientificName)}</i></span>
                    ${taxon.family ? `<span class="result-family">${escapeHtml(taxon.family)}</span>` : ''}
                  </button>`).join('')
              : '<p class="empty-state">Aucun résultat dans les données locales.</p>'}
        </div>
      </section>
      ${renderDataNotice()}
    </main>
  `
  bindRegionSelect()
  bindCommonActions()
  document.querySelector<HTMLButtonElement>('#change-realm')?.addEventListener('click', () => {
    state.realm = null
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
      state.selectedTaxon = state.taxa.find((taxon) => taxon.cdRef === Number(button.dataset.cdRef)) ?? null
      render()
    })
  })
}

function renderDetail(): void {
  const taxon = state.selectedTaxon
  if (!taxon || !state.realm) return
  const region = regions.find((item) => item.code === state.region)
  const taxonStatuses = state.statuses.filter((status) => status.cdRef === taxon.cdRef)

  root.innerHTML = `
    <main class="shell">
      <header class="topbar"><button class="link-button" id="back-to-search" type="button">← Recherche</button>${headerActions()}</header>
      ${renderInstallHelp()}
      <section class="panel taxon-card">
        <p class="eyebrow">${state.realm === 'flora' ? 'Flore' : 'Faune'} - ${escapeHtml(region?.name ?? state.region)}</p>
        <h1>${escapeHtml(taxon.vernacularNames[0] ?? taxon.scientificName)}</h1>
        <p class="scientific-name"><i>${escapeHtml(taxon.scientificName)}</i></p>
        <p class="taxon-meta">${taxon.family ? `${escapeHtml(taxon.family)} - ` : ''}CD_REF ${taxon.cdRef}</p>
        <div class="divider"></div>
        <h2>Statuts</h2>
        ${taxonStatuses.length
          ? `<dl class="status-list">${taxonStatuses.map((status) => `
              <div class="status-row">
                <dt>${escapeHtml(statusLabel(status))}${status.scope === 'partial' && status.scopeLabel ? `<small>Zone partielle : ${escapeHtml(normalizeUiText(status.scopeLabel))}</small>` : ''}</dt>
                <dd>${escapeHtml(statusValue(status))}</dd>
              </div>`).join('')}</dl>`
          : '<p class="empty-state">Aucun statut disponible pour ce taxon et cette région dans les référentiels chargés.</p>'}
        <p class="source-summary">${escapeHtml(sourceSummary())}</p>
      </section>
      ${renderDataNotice()}
    </main>
  `
  document.querySelector<HTMLButtonElement>('#back-to-search')?.addEventListener('click', () => {
    state.selectedTaxon = null
    render()
  })
  bindCommonActions()
}

function render(): void {
  if (!state.realm) return renderRealmChoice()
  if (state.loading) return renderLoading()
  if (state.error) return renderError()
  if (state.selectedTaxon) return renderDetail()
  renderSearch()
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredInstallPrompt = event as BeforeInstallPromptEvent
  refreshInstallButtons()
})
window.addEventListener('appinstalled', () => {
  installed = true
  deferredInstallPrompt = null
  installHelp = null
  refreshInstallButtons()
})
window.addEventListener('online', refreshOfflineBadges)
window.addEventListener('offline', refreshOfflineBadges)

render()
void dataStore.primeOffline().then((ready) => {
  state.offlineReady = ready
  refreshOfflineBadges()
})
