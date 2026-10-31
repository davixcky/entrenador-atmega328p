# Sitio web

Sitio del proyecto en español e inglés, hecho con [Astro](https://astro.build) y publicado
en GitHub Pages: <https://davixcky.github.io/entrenador-atmega328p/>.

No tiene copias de la documentación: las páginas de guía, lenguaje y biblioteca son los
mismos `.md` del repositorio (`src/content.config.ts`), y `scripts/copiar-recursos.mjs`
copia los PDF, el esquemático y las fotos en cada build. Los enlaces relativos de esos
documentos se reescriben (`src/enlaces.mjs`): a su página en el sitio si la tiene, o al
archivo en GitHub. El ejemplo de la portada se genera con la librería del lenguaje
(`app/lenguaje`).

```bash
cd web
npm install
npm run dev       # http://localhost:4321/entrenador-atmega328p/
npm run build     # deja el sitio en dist/
```

Requiere Node 22.12 o posterior. Cada push a `main` lo publica con
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml).

| Archivo | Contenido |
|---|---|
| `src/i18n.ts` | Textos en los dos idiomas y rutas equivalentes (`/es/guia/` ↔ `/en/guide/`) |
| `src/layouts/Base.astro` | Cabecera, menú, cambio de idioma y pie |
| `src/pages/[lang]/index.astro` | Portada |
| `src/pages/[lang]/[pagina].astro` | Guía, esquemático, lenguaje y biblioteca |
