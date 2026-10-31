// Sitio del entrenador, publicado en GitHub Pages:
// https://davixcky.github.io/entrenador-atmega328p/
import { defineConfig } from 'astro/config'
import { enlacesDelRepo } from './src/enlaces.mjs'

export default defineConfig({
  site: 'https://davixcky.github.io',
  base: '/entrenador-atmega328p',
  trailingSlash: 'always',
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  markdown: {
    remarkPlugins: [enlacesDelRepo],
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
})
