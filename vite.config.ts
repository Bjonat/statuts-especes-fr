import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: 'Statuts espèces FR',
        short_name: 'Statuts FR',
        description: 'Consultation hors ligne des statuts réglementaires et patrimoniaux des espèces en France.',
        theme_color: '#f6f6f1',
        background_color: '#f6f6f1',
        display: 'standalone',
        start_url: '/',
        lang: 'fr',
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
