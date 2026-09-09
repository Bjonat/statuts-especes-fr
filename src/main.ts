import './styles.css'
import { createDemoDataStore, loadDataStore } from './catalog'
import type { DataStore, DataStoreLoadResult } from './catalog'
import { REGIONS, assertDepartmentInRegion } from '../data-pipeline/regions.mjs'
import { searchTaxa } from './search'
import { resolveStatuses } from './resolve-statuses'
import {
  NO_IDENTIFIED_STATUS_MESSAGE,
  buildStatusHelp,
  formatStatusValueForDisplay,
} from './status-help'
import type { OfflineDownloadProgress, OfflineInventory } from './offline-data'
import type { Realm, RegionCode, SourceDataset, StatusCategory, Taxon, TaxonStatus } from './types'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Élément #app introuvable')
const root = rootElement

type AppDataMode =
  | { state: 'loading' }
  | { state: 'official'; store: DataStore }
  | { state: 'download_required'; reason: 'offline_without_data' }
  | { state: 'recoverable_error'; reason: 'manifest_unavailable' | 'manifest_invalid' }
  | { state: 'demo'; store: DataStore }

let dataMode: AppDataMode = { state: 'loading' }

function activeStore(): DataStore | null {
  return dataMode.state === 'official' || dataMode.state === 'demo' ? dataMode.store : null
}

function store(): DataStore {
  const current = activeStore()
  if (!current) throw new Error('Jeu de données non chargé')
  return current
}

function readStoredDepartment(region: RegionCode): string | null {
  const stored = localStorage.getItem('department')
  if (stored === null) return null
  try {
    return assertDepartmentInRegion(region, stored)
  } catch {
    localStorage.removeItem('department')
    return null
  }
}

let installPrompt: BeforeInstallPromptEvent | null = null
let iosInstallHelpVisible = false

const state: {
  screen: 'home' | 'sources' | 'offline'
  realm: Realm | null
  region: RegionCode
  department: string | null
  query: string
  selectedTaxon: Taxon | null
  taxa: Taxon[]
  statuses: TaxonStatus[]
  regionSources: SourceDataset[]
  loading: boolean
  error: string | null
  offlineInventory: OfflineInventory | null
  offlinePreparing: RegionCode | null
  offlineProgress: OfflineDownloadProgress | null
  offlineNotice: string | null
  offlineConfirmRemove: RegionCode | null
} = {
  screen: 'home',
  realm: null,
  region: 'CVL',
  department: null,
  query: '',
  selectedTaxon: null,
  taxa: [],
  statuses: [],
  regionSources: [],
  loading: false,
  error: null,
  offlineInventory: null,
  offlinePreparing: null,
  offlineProgress: null,
  offlineNotice: null,
  offlineConfirmRemove: null,
}

let offlineAbort: AbortController | null = null

const OFFLINE_INTERRUPTED_MESSAGE =
  'Téléchargement interrompu. Les fichiers déjà récupérés sont conservés.'
const OFFLINE_STORAGE_MESSAGE =
  'Espace de stockage insuffisant pour terminer le téléchargement. Les fichiers déjà téléchargés sont conservés.'

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
  const current = activeStore()
  if (!current?.warning) return ''
  const retryOfficial =
    dataMode.state === 'demo'
      ? `<button class="link-button" id="retry-official-from-demo" type="button">Réessayer les données officielles</button>`
      : ''
  return `<aside class="warning" role="note">
    <p>${escapeHtml(cleanDisplayText(current.warning))}</p>
    ${retryOfficial}
  </aside>`
}

function offlineBadgeText(): string {
  if (dataMode.state === 'demo') return 'Démonstration'
  const inventory = state.offlineInventory
  if (!inventory) return 'Vérification hors ligne…'
  if (inventory.readyRegionCount === 0) return 'Aucune région hors ligne'
  if (inventory.readyRegionCount === inventory.regions.length) {
    return `${inventory.readyRegionCount} régions hors ligne`
  }
  return `Hors ligne : ${inventory.readyRegionCount}/${inventory.regions.length} régions`
}

function offlineBadge(): string {
  const demoClass = dataMode.state === 'demo' ? ' offline-badge--demo' : ''
  return `<span class="offline-badge${demoClass}">${escapeHtml(offlineBadgeText())}</span>`
}

function refreshOfflineBadges(): void {
  document.querySelectorAll<HTMLElement>('.offline-badge').forEach((badge) => {
    badge.textContent = offlineBadgeText()
  })
}

function formatEstimatedVolume(bytes: number): string {
  const mio = bytes / (1024 * 1024)
  return `≈ ${mio.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio`
}

function volumeMarkup(bytes: number | undefined, suffix = ''): string {
  if (bytes === undefined) {
    return `<p class="offline-volume">Volume non disponible pour cette version</p>`
  }
  return `<p class="offline-volume">${escapeHtml(formatEstimatedVolume(bytes))}${suffix ? ` ${escapeHtml(suffix)}` : ''}</p>`
}

async function inspectOfflineCache(): Promise<void> {
  const current = activeStore()
  if (!current?.offline) {
    state.offlineInventory = null
    return
  }
  state.offlineInventory = await current.offline.inspect()
}

async function openOffline(): Promise<void> {
  if (dataMode.state !== 'official' || !store().offline) return
  state.screen = 'offline'
  state.realm = null
  state.query = ''
  state.selectedTaxon = null
  state.offlineNotice = null
  state.offlineConfirmRemove = null
  render()
  await inspectOfflineCache()
  if (state.screen === 'offline') render()
}

function closeOffline(): void {
  offlineAbort?.abort()
  state.screen = 'home'
  state.offlineConfirmRemove = null
  state.offlineNotice = null
  render()
}

async function refreshOfflineScreen(): Promise<void> {
  if (state.offlinePreparing) return
  await inspectOfflineCache()
  if (state.screen === 'offline') render()
  else refreshOfflineBadges()
}

async function prepareOfflineRegion(region: RegionCode): Promise<void> {
  const manager = store().offline
  if (!manager || state.offlinePreparing) return
  if (!navigator.onLine) {
    state.offlineNotice = 'Connexion nécessaire pour télécharger cette région.'
    render()
    return
  }

  state.offlinePreparing = region
  state.offlineProgress = null
  state.offlineNotice = null
  state.offlineConfirmRemove = null
  offlineAbort = new AbortController()
  render()

  const result = await manager.prepareRegion(region, {
    signal: offlineAbort.signal,
    onProgress: (progress) => {
      if (state.offlinePreparing !== region) return
      state.offlineProgress = progress
      if (state.screen === 'offline') render()
    },
  })

  if (dataMode.state !== 'official') return
  state.offlineInventory = result.inventory
  if (state.offlinePreparing === region) {
    state.offlinePreparing = null
    state.offlineProgress = null
    offlineAbort = null
    if (result.outcome === 'cancelled') {
      state.offlineNotice = OFFLINE_INTERRUPTED_MESSAGE
    } else if (result.outcome === 'failed') {
      state.offlineNotice = result.reason === 'storage' ? OFFLINE_STORAGE_MESSAGE : OFFLINE_INTERRUPTED_MESSAGE
    } else {
      state.offlineNotice = null
    }
  }

  if (state.screen === 'offline') render()
  else refreshOfflineBadges()
}

function cancelOfflinePrepare(): void {
  offlineAbort?.abort()
}

function requestRemoveOfflineRegion(region: RegionCode): void {
  state.offlineConfirmRemove = region
  render()
}

function cancelRemoveOfflineRegion(): void {
  state.offlineConfirmRemove = null
  render()
}

async function confirmRemoveOfflineRegion(region: RegionCode): Promise<void> {
  const manager = store().offline
  if (!manager) return
  state.offlineConfirmRemove = null
  const result = await manager.removeRegion(region)
  state.offlineInventory = result.inventory
  render()
}

function sharedStatusLabel(availability: OfflineInventory['shared']['availability']): string {
  if (availability === 'ready') return 'Prêt'
  if (availability === 'partial') return 'Partiel'
  return 'Non téléchargé'
}

function renderOfflineRegionCard(regionCode: RegionCode): string {
  const inventory = state.offlineInventory
  const region = store().regions.find((item) => item.code === regionCode)
  const status = inventory?.regions.find((item) => item.region === regionCode)
  const name = region?.name ?? regionCode
  const preparing = state.offlinePreparing === regionCode
  const busy = state.offlinePreparing !== null
  const online = navigator.onLine

  if (!inventory?.storageAvailable) {
    return `
      <li class="offline-region-card">
        <div>
          <h2>${escapeHtml(name)}</h2>
          <p class="offline-region-status">Stockage indisponible</p>
        </div>
      </li>
    `
  }

  if (!status) return ''

  let statusText = 'À télécharger'
  if (status.consultableOffline) statusText = 'Disponible hors ligne'
  else if (status.availability === 'partial') statusText = 'Téléchargement incomplet'
  if (preparing) statusText = 'Téléchargement…'

  const progress = preparing && state.offlineProgress
    ? `<p class="offline-progress" aria-live="polite">${state.offlineProgress.completedFiles} / ${state.offlineProgress.totalFiles} fichiers${
        state.offlineProgress.bytesTotal !== undefined && state.offlineProgress.bytesCompleted !== undefined
          ? ` · ${escapeHtml(formatEstimatedVolume(state.offlineProgress.bytesCompleted))} / ${escapeHtml(formatEstimatedVolume(state.offlineProgress.bytesTotal))}`
          : ''
      }</p>`
    : status.availability === 'partial' && !preparing
      ? `<p class="offline-progress">${status.cachedFiles} / ${status.totalFiles} fichiers régionaux</p>`
      : ''

  const volume = status.consultableOffline
    ? volumeMarkup(status.bytesTotal, 'de données régionales')
    : volumeMarkup(status.bytesTotal)

  let actions = ''
  if (state.offlineConfirmRemove === regionCode) {
    actions = `
      <div class="offline-confirm" role="group" aria-label="Confirmation de suppression">
        <p>Supprimer les données hors ligne pour ${escapeHtml(name)}&nbsp;?</p>
        <button class="secondary-button" type="button" data-cancel-remove="${regionCode}">Annuler</button>
        <button class="danger-button" type="button" data-confirm-remove="${regionCode}">Supprimer</button>
      </div>
    `
  } else if (preparing) {
    actions = `<button class="secondary-button" type="button" data-cancel-prepare="${regionCode}">Annuler</button>`
  } else {
    const prepareDisabled = busy || !online
    const prepareLabel = status.availability === 'missing' ? 'Télécharger' : status.availability === 'partial' ? 'Reprendre' : ''
    const prepareTitle = !online ? 'Connexion nécessaire' : ''
    const prepareButton = prepareLabel
      ? `<button class="primary-button" type="button" data-prepare-region="${regionCode}" ${prepareDisabled ? 'disabled' : ''} ${prepareTitle ? `title="${prepareTitle}"` : ''}>${prepareLabel}</button>${!online && !busy ? '<p class="field-hint">Connexion nécessaire</p>' : ''}`
      : ''
    const removeButton =
      status.availability !== 'missing'
        ? `<button class="danger-button" type="button" data-remove-region="${regionCode}" ${busy ? 'disabled' : ''}>Supprimer</button>`
        : ''
    actions = `<div class="offline-region-actions">${prepareButton}${removeButton}</div>`
  }

  return `
    <li class="offline-region-card">
      <div>
        <h2>${escapeHtml(name)}</h2>
        <p class="offline-region-status">${escapeHtml(statusText)}</p>
        ${progress}
        ${volume}
      </div>
      ${actions}
    </li>
  `
}

function bindOfflineActions(): void {
  document.querySelector<HTMLButtonElement>('#offline-back')?.addEventListener('click', closeOffline)
  document.querySelector<HTMLButtonElement>('#offline-refresh')?.addEventListener('click', () => {
    void refreshOfflineScreen()
  })
  document.querySelectorAll<HTMLButtonElement>('[data-prepare-region]').forEach((button) => {
    button.addEventListener('click', () => {
      void prepareOfflineRegion(button.dataset.prepareRegion as RegionCode)
    })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-cancel-prepare]').forEach((button) => {
    button.addEventListener('click', cancelOfflinePrepare)
  })
  document.querySelectorAll<HTMLButtonElement>('[data-remove-region]').forEach((button) => {
    button.addEventListener('click', () => {
      requestRemoveOfflineRegion(button.dataset.removeRegion as RegionCode)
    })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-cancel-remove]').forEach((button) => {
    button.addEventListener('click', cancelRemoveOfflineRegion)
  })
  document.querySelectorAll<HTMLButtonElement>('[data-confirm-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      void confirmRemoveOfflineRegion(button.dataset.confirmRemove as RegionCode)
    })
  })
}

function renderOffline(): void {
  const inventory = state.offlineInventory

  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="link-button" id="offline-back" type="button">← Accueil</button>
        ${offlineBadge()}
      </header>

      <section class="panel" aria-labelledby="offline-title">
        <p class="eyebrow">Préparation terrain</p>
        <h1 id="offline-title">Données hors ligne</h1>
        <p class="intro">Préparez les régions dont vous aurez besoin avant votre sortie terrain.</p>

        <div class="offline-toolbar">
          <button class="secondary-button" id="offline-refresh" type="button" ${state.offlinePreparing ? 'disabled' : ''}>Actualiser</button>
        </div>

        ${
          state.offlineNotice
            ? `<p class="offline-notice" role="status" aria-live="polite">${escapeHtml(state.offlineNotice)}</p>`
            : ''
        }

        ${
          !inventory
            ? `<p class="empty-state" aria-live="polite">Vérification du cache local…</p>`
            : !inventory.storageAvailable
              ? `<p class="empty-state" role="status">Le stockage hors ligne n’est pas disponible dans ce navigateur.</p>`
              : `
              <section class="offline-shared" aria-labelledby="offline-shared-title">
                <h2 id="offline-shared-title">Socle partagé</h2>
                <p class="offline-region-status">${escapeHtml(sharedStatusLabel(inventory.shared.availability))}</p>
                ${volumeMarkup(inventory.shared.bytesTotal)}
                <p class="field-hint">Géré automatiquement</p>
              </section>
              <ul class="offline-region-list">
                ${inventory.regions.map((item) => renderOfflineRegionCard(item.region)).join('')}
              </ul>
            `
        }
      </section>
    </main>
  `

  bindOfflineActions()
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
  return store()
    .regions.map(
      (region) =>
        `<option value="${region.code}" ${region.code === state.region ? 'selected' : ''}>${escapeHtml(region.name)}</option>`,
    )
    .join('')
}

function departmentOptions(): string {
  const region = REGIONS.find((item) => item.code === state.region)
  const departments = region?.departments ?? []
  return [
    `<option value="" ${state.department === null ? 'selected' : ''}>Toute la région</option>`,
    ...departments.map(
      (code) =>
        `<option value="${escapeHtml(code)}" ${state.department === code ? 'selected' : ''}>${escapeHtml(code)}</option>`,
    ),
  ].join('')
}

function departmentFieldMarkup(spaced = false): string {
  const labelClass = spaced ? 'field-label field-label--spaced' : 'field-label'
  return `
    <div class="territory-filter">
      <label class="${labelClass}" for="department-select">Département (facultatif)</label>
      <select id="department-select" class="field-control">${departmentOptions()}</select>
      <p class="field-hint">Affinez les statuts de portée départementale ou d’ancienne région.</p>
    </div>
  `
}

function changeDepartment(value: string): void {
  if (value.trim() === '') {
    state.department = null
    localStorage.removeItem('department')
    render()
    return
  }

  try {
    const normalized = assertDepartmentInRegion(state.region, value)
    state.department = normalized
    localStorage.setItem('department', normalized)
  } catch {
    state.department = null
    localStorage.removeItem('department')
  }
  render()
}

function renderTerritoryNotices(warnings: string[]): string {
  if (warnings.length === 0) return ''
  const body =
    warnings.length === 1
      ? `<p>${escapeHtml(warnings[0])}</p>`
      : `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
  return `<aside class="territory-notice" role="note">${body}</aside>`
}

function formatCheckedDate(value?: string): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return 'date inconnue'
  return `${match[3]}/${match[2]}/${match[1]}`
}

function sourceSummary(statuses: TaxonStatus[]): string {
  if (!store().official) return 'Sources et versions : données de démonstration'

  const taxref = store().sources.find((source) => source.id === 'taxref-v18')
  const bdc = store().sources.find((source) => source.id === 'bdc-v18')
  const bdcVersion = bdc?.version ?? taxref?.version ?? store().datasetVersion
  const usedSourceIds = new Set(statuses.map((status) => status.sourceId))
  const regionalSources = store().sources.filter(
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
  return formatStatusValueForDisplay(cleanDisplayText(status.value))
}

function renderStatusHelpPanel(status: TaxonStatus, index: number): string {
  const help = buildStatusHelp(status)
  const titleParts = [help.title]
  if (help.code) titleParts.push(help.code)

  return `
    <div class="status-help" id="status-help-${index}" hidden>
      <p class="status-help-family">${escapeHtml(help.familyLabel)}</p>
      <p class="status-help-title">${escapeHtml(titleParts.join(' — '))}</p>
      ${
        help.explanation
          ? `<p class="status-help-text">${escapeHtml(help.explanation)}</p>`
          : '<p class="status-help-text status-help-text--muted">Libellé issu du référentiel ; aucune explication complémentaire n’est disponible hors ligne pour ce code.</p>'
      }
      <button type="button" class="status-help-close" data-help-close="${index}">Fermer</button>
    </div>
  `
}

async function loadRealmData(realm: Realm, region: RegionCode): Promise<void> {
  state.loading = true
  state.error = null
  render()

  try {
    const [taxa, statuses] = await Promise.all([store().loadTaxa(realm), store().loadStatuses(realm, region)])
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
  state.department = null
  state.selectedTaxon = null
  state.statuses = []
  localStorage.setItem('region', region)
  localStorage.removeItem('department')
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
    const regionSources = await store().listSourcesForRegion(region)
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

function bindDepartmentSelect(): void {
  const select = document.querySelector<HTMLSelectElement>('#department-select')
  select?.addEventListener('change', () => {
    changeDepartment(select.value)
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
        ${
          dataMode.state === 'official'
            ? '<button class="sources-button" id="open-offline" type="button">Données hors ligne</button>'
            : ''
        }
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
  document.querySelector<HTMLButtonElement>('#open-offline')?.addEventListener('click', () => {
    void openOffline()
  })
  bindInstallAction()
}

function renderSources(): void {
  const region = store().regions.find((item) => item.code === state.region)

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

        ${departmentFieldMarkup(true)}

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
  bindDepartmentSelect()

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

  const region = store().regions.find((item) => item.code === state.region)
  const result = resolveStatuses({
    cdRef: taxon.cdRef,
    region: state.region,
    department: state.department ?? undefined,
    statuses: state.statuses,
  })
  const taxonStatuses = result.statuses
  const territoryContext = state.department
    ? `${state.realm === 'flora' ? 'Flore' : 'Faune'} - ${region?.name ?? state.region} - département ${state.department}`
    : `${state.realm === 'flora' ? 'Flore' : 'Faune'} - ${region?.name ?? state.region}`

  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="link-button" id="back-to-search" type="button">← Recherche</button>
        ${offlineBadge()}
      </header>

      <section class="panel taxon-card">
        <p class="eyebrow">${escapeHtml(territoryContext)}</p>
        <h1>${escapeHtml(taxon.vernacularNames[0] ?? taxon.scientificName)}</h1>
        <p class="scientific-name"><i>${escapeHtml(taxon.scientificName)}</i></p>
        <p class="taxon-meta">${taxon.family ? `${escapeHtml(taxon.family)} - ` : ''}CD_REF ${taxon.cdRef}</p>

        <div class="divider"></div>

        ${departmentFieldMarkup()}

        <div class="status-results" aria-live="polite">
        ${renderTerritoryNotices(result.warnings)}
        <h2>Statuts</h2>
        ${
          taxonStatuses.length
            ? `<dl class="status-list">
                ${taxonStatuses
                  .map(
                    (status, index) => `
                      <div class="status-item">
                        <div class="status-row">
                          <dt>
                            ${escapeHtml(shortStatusLabel(status))}
                            ${status.scope === 'partial' && status.scopeLabel ? `<small>Portée : ${escapeHtml(cleanDisplayText(status.scopeLabel))}</small>` : ''}
                          </dt>
                          <dd>
                            <span class="status-value-line">
                              <span class="status-value">${escapeHtml(shortStatusValue(status))}</span>
                              <button
                                type="button"
                                class="status-help-btn"
                                data-help-toggle="${index}"
                                aria-expanded="false"
                                aria-controls="status-help-${index}"
                                title="Explication du statut"
                              >ⓘ<span class="visually-hidden">Aide sur ce statut</span></button>
                            </span>
                          </dd>
                        </div>
                        ${renderStatusHelpPanel(status, index)}
                      </div>
                    `,
                  )
                  .join('')}
              </dl>`
            : `<div class="empty-status">
                <p class="empty-state">${escapeHtml(NO_IDENTIFIED_STATUS_MESSAGE)}</p>
                <button class="link-button" id="open-sources-from-detail" type="button">Voir les sources couvertes</button>
              </div>`
        }

        <p class="source-summary">${escapeHtml(sourceSummary(taxonStatuses))}</p>
        </div>
      </section>

      ${renderDataNotice()}
    </main>
  `

  bindDepartmentSelect()

  document.querySelector<HTMLButtonElement>('#back-to-search')?.addEventListener('click', () => {
    state.selectedTaxon = null
    render()
  })

  document.querySelector<HTMLButtonElement>('#open-sources-from-detail')?.addEventListener('click', () => {
    void openSources()
  })

  const closeAllStatusHelp = (): void => {
    root.querySelectorAll<HTMLElement>('.status-help').forEach((panel) => {
      panel.hidden = true
    })
    root.querySelectorAll<HTMLButtonElement>('[data-help-toggle]').forEach((button) => {
      button.setAttribute('aria-expanded', 'false')
    })
  }

  root.querySelectorAll<HTMLButtonElement>('[data-help-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = button.dataset.helpToggle
      const panel = root.querySelector<HTMLElement>(`#status-help-${index}`)
      if (!panel) return
      const willOpen = panel.hidden
      closeAllStatusHelp()
      if (willOpen) {
        panel.hidden = false
        button.setAttribute('aria-expanded', 'true')
      }
    })
  })

  root.querySelectorAll<HTMLButtonElement>('[data-help-close]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = button.dataset.helpClose
      closeAllStatusHelp()
      const toggle = index
        ? root.querySelector<HTMLButtonElement>(`[data-help-toggle="${index}"]`)
        : null
      toggle?.focus()
    })
  })
}

function enterLoadedStore(mode: 'official' | 'demo', next: DataStore): void {
  dataMode = { state: mode, store: next }
  const storedRegion = localStorage.getItem('region')
  const defaultRegion = next.regions.some((region) => region.code === storedRegion)
    ? (storedRegion as RegionCode)
    : 'CVL'
  state.screen = 'home'
  state.realm = null
  state.region = defaultRegion
  state.department = readStoredDepartment(defaultRegion)
  state.query = ''
  state.selectedTaxon = null
  state.taxa = []
  state.statuses = []
  state.regionSources = []
  state.loading = false
  state.error = null
  state.offlineInventory = null
  state.offlinePreparing = null
  state.offlineProgress = null
  state.offlineNotice = null
  state.offlineConfirmRemove = null
  offlineAbort = null
  render()
  if (mode !== 'official' || !next.offline) return
  void next.offline.inspect().then((inventory) => {
    if (dataMode.state !== 'official' || dataMode.store !== next) return
    state.offlineInventory = inventory
    if (state.screen === 'offline') render()
    else refreshOfflineBadges()
  })
}

function applyLoadResult(result: DataStoreLoadResult): void {
  if (result.state === 'available') {
    enterLoadedStore('official', result.store)
    return
  }
  dataMode = result
  render()
}

async function retryOfficialData(): Promise<void> {
  dataMode = { state: 'loading' }
  render()
  applyLoadResult(await loadDataStore())
}

function openDemonstration(): void {
  enterLoadedStore('demo', createDemoDataStore())
}

function bindBootstrapActions(): void {
  document.querySelector<HTMLButtonElement>('#retry-official')?.addEventListener('click', () => {
    void retryOfficialData()
  })
  document.querySelector<HTMLButtonElement>('#open-demo')?.addEventListener('click', openDemonstration)
}

function bindDataNoticeActions(): void {
  document.querySelector<HTMLButtonElement>('#retry-official-from-demo')?.addEventListener('click', () => {
    void retryOfficialData()
  })
}

function bootstrapActionsMarkup(): string {
  return `
    <div class="bootstrap-actions">
      <button class="primary-button" id="retry-official" type="button">Réessayer</button>
      <button class="secondary-button" id="open-demo" type="button">Ouvrir la démonstration</button>
    </div>
  `
}

function renderBootstrap(): void {
  if (dataMode.state === 'loading') {
    root.innerHTML = `
      <main class="shell shell--centered">
        <section class="panel loading-panel" aria-live="polite" aria-labelledby="bootstrap-title">
          <p class="eyebrow">Statuts espèces FR</p>
          <h1 id="bootstrap-title">Chargement des données…</h1>
          <p class="intro">Vérification du jeu officiel sur cet appareil.</p>
        </section>
      </main>
    `
    return
  }

  if (dataMode.state === 'download_required') {
    root.innerHTML = `
      <main class="shell shell--centered">
        <section class="panel" role="alert" aria-labelledby="bootstrap-title">
          <p class="eyebrow">Première utilisation</p>
          <h1 id="bootstrap-title">Données nécessaires</h1>
          <p class="intro">Les données officielles ne sont pas encore disponibles sur cet appareil.</p>
          <p class="intro">Connectez-vous à Internet pour préparer l'application avant votre sortie terrain.</p>
          ${bootstrapActionsMarkup()}
        </section>
      </main>
    `
    bindBootstrapActions()
    return
  }

  if (dataMode.state === 'recoverable_error' && dataMode.reason === 'manifest_invalid') {
    root.innerHTML = `
      <main class="shell shell--centered">
        <section class="panel" role="alert" aria-labelledby="bootstrap-title">
          <p class="eyebrow">Jeu de données</p>
          <h1 id="bootstrap-title">Jeu de données non reconnu</h1>
          <p class="intro">La description du jeu de données reçue est invalide. L'application refuse de l'utiliser pour éviter d'afficher des résultats incohérents.</p>
          ${bootstrapActionsMarkup()}
        </section>
      </main>
    `
    bindBootstrapActions()
    return
  }

  root.innerHTML = `
    <main class="shell shell--centered">
      <section class="panel" role="alert" aria-labelledby="bootstrap-title">
        <p class="eyebrow">Données officielles</p>
        <h1 id="bootstrap-title">Impossible de charger les données officielles</h1>
        <p class="intro">Le serveur de données est momentanément indisponible. Les données officielles ne peuvent pas être chargées actuellement. Vos données locales existantes ne sont pas remplacées.</p>
        ${bootstrapActionsMarkup()}
      </section>
    </main>
  `
  bindBootstrapActions()
}

function render(): void {
  if (dataMode.state === 'loading' || dataMode.state === 'download_required' || dataMode.state === 'recoverable_error') {
    renderBootstrap()
    return
  }

  if (state.screen === 'offline') {
    renderOffline()
    return
  }

  if (state.screen === 'sources') {
    renderSources()
    bindDataNoticeActions()
    return
  }

  if (!state.realm) {
    renderRealmChoice()
    bindDataNoticeActions()
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
    bindDataNoticeActions()
    return
  }

  renderSearch()
  bindDataNoticeActions()
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

window.addEventListener('online', () => {
  refreshOfflineBadges()
  if (state.screen === 'offline') render()
})
window.addEventListener('offline', () => {
  refreshOfflineBadges()
  if (state.screen === 'offline') render()
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  if (dataMode.state !== 'official') return
  if (state.offlinePreparing) return
  void inspectOfflineCache().then(() => {
    if (state.screen === 'offline') render()
    else refreshOfflineBadges()
  })
})

async function start(): Promise<void> {
  render()
  applyLoadResult(await loadDataStore())
}

void start()
