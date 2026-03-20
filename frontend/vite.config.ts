import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/postcss'
import { SvelteKitPWA as pwa } from '@vite-pwa/sveltekit'
import postcssLightningcss from 'postcss-lightningcss'
import { defineConfig } from 'vite'
import { imagetools } from 'vite-imagetools'

export default defineConfig({
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        postcssLightningcss({
          browsers: '>= .25%',
          lightningcssOptions: {
            drafts: {
              customMedia: true,
            },
            errorRecovery: true,
          },
        }),
      ],
    },
  },
  envPrefix: 'URARA_',
  plugins: [
    imagetools(),
    sveltekit(),
    pwa({
      base: '/',
      manifest: false,
      registerType: 'autoUpdate',
      scope: '/',
      workbox: {
        globIgnores: ['**/sw*', '**/workbox-*'],
        globPatterns: ['**/*.{js,css,html,svg,ico,png,webp,avif}'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(js|css|html|svg|ico|png|webp|avif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
            },
          },
        ],
      },
    }),
  ],
  server: {
    fs: {
      allow: ['.', 'static', 'node_modules', '.svelte-kit'],
    },
  },
})
