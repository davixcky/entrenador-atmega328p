import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const lenguaje = fileURLToPath(new URL('../lenguaje', import.meta.url))
// Firmware que la app graba (hex del ATmega, imagen del ESP32) y biblioteca para el .zip
const firmware = fileURLToPath(new URL('../firmware', import.meta.url))
const esp32 = fileURLToPath(new URL('../../firmware/esp32-puente/dist', import.meta.url))

export default defineConfig({
  plugins: [react()],
  // La libreria del lenguaje vive en app/lenguaje, fuera de esta carpeta
  resolve: { alias: { '@entrenador/lenguaje': lenguaje + '/src/index.ts' } },
  server: { fs: { allow: ['.', lenguaje, firmware, esp32] } },
  // La URL y la clave de Supabase estan en nube/.env.local (una sola copia para todo)
  envDir: fileURLToPath(new URL('../../nube', import.meta.url)),
  // Rutas relativas: la version web se puede publicar en cualquier carpeta (GitHub Pages)
  base: './',
  // App de escritorio: un solo paquete de JS esta bien
  build: { chunkSizeWarningLimit: 1500 },
})
