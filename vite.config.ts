import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'models/**/*'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,glb}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "Don't Wake Dad",
        short_name: "Don't Wake Dad",
        description: 'Get the snack. Do not wake Dad.',
        theme_color: '#0d1024',
        background_color: '#0d1024',
        display: 'fullscreen',
        orientation: 'landscape',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
});
