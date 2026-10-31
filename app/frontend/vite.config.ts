import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const lenguaje = fileURLToPath(new URL('../lenguaje', import.meta.url))

export default defineConfig({
  plugins: [react()],
  // La libreria del lenguaje vive en app/lenguaje, fuera de esta carpeta
  resolve: { alias: { '@entrenador/lenguaje': lenguaje + '/src/index.ts' } },
  server: { fs: { allow: ['.', lenguaje] } },
  // App de escritorio: un solo paquete de JS esta bien
  build: { chunkSizeWarningLimit: 1500 },
})
