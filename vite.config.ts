import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Le chemin public exact du FTP n'est pas connu au build. Un base relatif
  // permet au même dist/ de fonctionner à la racine ou dans un sous-dossier.
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      scope: './',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Statuts espèces FR',
        short_name: 'Statuts FR',
        description: 'Consultation hors ligne des statuts réglementaires et patrimoniaux des espèces en France.',
        theme_color: '#f6f6f1',
        background_color: '#f6f6f1',
        display: 'standalone',
        start_url: './',
        scope: './',
        lang: 'fr',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json}'],
        globIgnores: [
          'data/manifest.json',
          'data/taxa-*.json',
          'data/status-definitions-*.json',
          'data/status-links-*.json',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/data\/manifest\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'statuts-data-manifest',
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\/data\/(?:taxa-[a-z0-9-]+|status-definitions|status-links-[a-z0-9-]+)-[a-f0-9]+\.json$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'statuts-data-catalogs',
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
})
