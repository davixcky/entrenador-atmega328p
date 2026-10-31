// Los documentos del sitio son los mismos .md del repositorio: no hay copias que mantener.
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'

const docs = defineCollection({
  loader: glob({
    base: '..',
    pattern: ['GUIA-USO.md', 'USER-GUIDE.md', 'app/lenguaje/README.md', 'app/lenguaje/README.en.md', 'firmware/libraries/Entrenador/README.md'],
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
})

export const collections = { docs }
