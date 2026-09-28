import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'RankR',
        short_name: 'RankR',
        description: 'Rank your favorite things and compare lists with friends.',
        theme_color: '#0d0e12',
        background_color: '#0d0e12',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // the small word file behind "similar vibe" matching: keep it after the first download
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/vibes/'),
            handler: 'CacheFirst',
            options: { cacheName: 'vibes', expiration: { maxEntries: 4 } },
          },
        ],
      },
    }),
  ],
})
