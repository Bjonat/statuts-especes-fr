import './styles.css'
import { loadCatalog } from './catalog'
import { searchTaxa } from './search'
import type { Realm, RegionCode, Taxon } from './types'

const rootElement = document.querySelector<HTMLDivElement>('#app')
if (!rootElement) throw new Error('Élément #app introuvable')
const root = rootElement

const catalog = await loadCatalog()
const { regions, sources, statuses, taxa } = catalog

const storedRegion = localStorage.getItem('region')
const defaultRegion = regions.some((region) => region.code === storedRegion) ? (storedRegion as RegionCode) : 'CVL'

const state: {
  realm: Realm | null
  region: RegionCode
  query: string
  selectedTaxon: Taxon | null
} = {
  realm: null,
  region: defaultRegion,
  query: '',
  selectedTaxon: null,
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

function renderDataNotice(): string {
  if (!catalog.warning) return ''
  return `<aside class="warning" role="note">${escapeHtml(catalog.warning)}</aside>`
}

function regionOptions(): string {
  return regions
    .map(
      (region) =>
        `<option value="${region.code}" ${region.code === state.region ? 'selected' : ''}>${escapeHtml(region.name)}</option>`,
    )
    .join('')
}

function bindRegionSelect(): void {
  const select = document.querySelector<HTMLSelectElement>('#region-select')
  select?.addEventListener('change', () => {
    state.region = select.value as RegionCode
    localStorage.setItem('region', state.region)
    render()
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
      </section>
      ${renderDataNotice()}
    </main>
  `

  document.querySelectorAll<HTMLButtonElement>('[data-realm]').forEach((button) => {
    button.addEventListener('click', () => {
      state.realm = button.dataset.realm as Realm
      state.query = ''
      state.selectedTaxon = null
      render()
    })
  })
}

function renderSearch(): void {
  if (!state.realm) return

  const results = searchTaxa(taxa, state.realm, state.query)
  const realmLabel = state.realm === 'flora' ? 'Flore' : 'Faune'

  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="link-button" id="change-realm" type="button">← ${realmLabel}</button>
        <span class="offline-badge">Hors ligne prêt</span>
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
      state.selectedTaxon = taxa.find((taxon) => taxon.cdRef === cdRef) ?? null
      render()
    })
  })
}

function renderDetail(): void {
  const taxon = state.selectedTaxon
  if (!taxon || !state.realm) return

  const region = regions.find((item) => item.code === state.region)
  const taxonStatuses = statuses.filter((status) => status.cdRef === taxon.cdRef && status.region === state.region)
  const sourceIds = [...new Set([taxon.sourceId, ...taxonStatuses.map((status) => status.sourceId)].filter(Boolean))] as string[]
  const taxonSources = sources.filter((source) => sourceIds.includes(source.id))

  root.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <button class="link-button" id="back-to-search" type="button">← Recherche</button>
        <span class="offline-badge">Hors ligne prêt</span>
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
                  .map(
                    (status) => `
                      <div class="status-row">
                        <dt>
                          ${escapeHtml(status.label)}
                          ${status.scope === 'partial' && status.scopeLabel ? `<small>Zone partielle : ${escapeHtml(status.scopeLabel)}</small>` : ''}
                        </dt>
                        <dd>${escapeHtml(status.value)}</dd>
                        ${status.citation ? `<p class="status-source">${escapeHtml(status.citation)}</p>` : ''}
                      </div>
                    `,
                  )
                  .join('')}
              </dl>`
            : '<p class="empty-state">Aucun statut disponible pour ce taxon et cette région dans les données locales actuelles.</p>'
        }

        <details class="sources-details">
          <summary>Sources et versions</summary>
          ${
            taxonSources.length
              ? taxonSources
                  .map(
                    (source) => `
                      <div class="source-row">
                        <strong>${escapeHtml(source.name)}</strong>
                        <span>${escapeHtml(source.producer)} · ${escapeHtml(source.version)}</span>
                        <span>${source.official ? 'Source officielle' : 'Source de démonstration'}</span>
                      </div>
                    `,
                  )
                  .join('')
              : '<p>Aucune source associée.</p>'
          }
          <p class="source-row">Catalogue généré le ${escapeHtml(new Date(catalog.generatedAt).toLocaleDateString('fr-FR'))}.</p>
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

  if (state.selectedTaxon) {
    renderDetail()
    return
  }

  renderSearch()
}

render()
