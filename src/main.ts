import './styles.css'
import { loadDataStore } from './catalog'
import { searchTaxa } from './search'
import type { Realm, RegionCode, Taxon, TaxonStatus } from './types'

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Élément #app introuvable')
const root = rootElement

const dataStore = await loadDataStore()
const { regions, sources } = dataStore

const storedRegion = localStorage.getItem('region')
const defaultRegion = regions.some((region) => region.code === storedRegion) ? (storedRegion as RegionCode) : 'CVL'

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

function safeExternalUrl(value?: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function renderDataNotice(): string {
  if (!dataStore.warning) return ''
  return `<aside class="warning" role="note">${escapeHtml(dataStore.warning)}</aside>`
}

function offlineBadge(): string {
  if (state.offlineReady) return '<span class="offline-badge">Hors ligne prêt</span>'
  if (navigator.onLine) return '<span class="offline-badge">Préparation hors ligne…</span>'
  return '<span class="offline-badge">Données hors ligne partielles</span>'
}

function regionOptions(): string {
  return regions
    .map(
      (region) =>
        `<option value="${region.code}" ${region.code === state.region ? 'selected' : ''}>${escapeHtml(region.name)}</option>`,
    )
    .join('')
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
        <h1>Chargement des données locales…</h1>
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
          placeholder="Ex. chêne, Quercus, martin…"
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
  const taxonStatuses = state.statuses.filter((status) => status.cdRef === taxon.cdRef)
  const sourceIds = [...new Set([taxon.sourceId, ...taxonStatuses.map((status) => status.sourceId)].filter(Boolean))] as string[]
  const taxonSources = sources.filter((source) => sourceIds.includes(source.id))

  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="link-button" id="back-to-search" type="button">← Recherche</button>
        ${offlineBadge()}
      </header>

      <section class="panel taxon-card">
        <p class="eyebrow">${state.realm === 'flora' ? 'Flore' : 'Faune'} · ${escapeHtml(region?.name ?? state.region)}</p>
        <h1>${escapeHtml(taxon.vernacularNames[0] ?? taxon.scientificName)}</h1>
        <p class="scientific-name"><i>${escapeHtml(taxon.scientificName)}</i></p>
        <p class="taxon-meta">${taxon.family ? `${escapeHtml(taxon.family)} · ` : ''}CD_REF ${taxon.cdRef}</p>

        <div class="divider"></div>

        <h2>Statuts</h2>
        ${
          taxonStatuses.length
            ? `<dl class="status-list">
                ${taxonStatuses
                  .map((status) => {
                    const documentUrl = safeExternalUrl(status.documentUrl)
                    return `
                      <div class="status-row">
                        <dt>
                          ${escapeHtml(status.label)}
                          ${status.scope === 'partial' && status.scopeLabel ? `<small>Zone partielle : ${escapeHtml(status.scopeLabel)}</small>` : ''}
                        </dt>
                        <dd>${escapeHtml(status.value)}</dd>
                        ${status.citation ? `<p class="status-source">${escapeHtml(status.citation)}${documentUrl ? ` · <a href="${escapeHtml(documentUrl)}" target="_blank" rel="noopener noreferrer">source</a>` : ''}</p>` : ''}
                      </div>
                    `
                  })
                  .join('')}
              </dl>`
            : '<p class="empty-state">Aucun statut disponible pour ce taxon et cette région dans les référentiels chargés.</p>'
        }

        <details class="sources-details">
          <summary>Sources et versions</summary>
          ${
            taxonSources.length
              ? taxonSources
                  .map((source) => {
                    const sourceUrl = safeExternalUrl(source.url)
                    return `
                      <div class="source-row">
                        <strong>${escapeHtml(source.name)}</strong>
                        <span>${escapeHtml(source.producer)} · ${escapeHtml(source.version)}</span>
                        <span>${source.official ? 'Source officielle' : 'Source de démonstration'}${source.checkedAt ? ` · vérifiée le ${escapeHtml(source.checkedAt)}` : ''}</span>
                        ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir la source</a>` : ''}
                      </div>
                    `
                  })
                  .join('')
              : '<p>Aucune source associée.</p>'
          }
          <p class="source-row">Jeu généré le ${escapeHtml(new Date(dataStore.generatedAt).toLocaleDateString('fr-FR'))}.</p>
        </details>
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

render()
void dataStore.primeOffline().then((ready) => {
  if (state.offlineReady === ready) return
  state.offlineReady = ready
  render()
})
