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
      },
    }),
  ],
})
