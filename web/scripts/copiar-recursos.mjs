// Copia al sitio (public/archivos) los PDF, el esquematico y las fotos del repositorio.
// public/archivos no se versiona: se regenera en cada build.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const raiz = path.resolve(web, '..')
const destino = path.join(web, 'public', 'archivos')

const ARCHIVOS = [
  'kicad/esquematico.png',
  'kicad/esquematico.pdf',
  'kicad/CONEXIONES.pdf',
  'GUIA-USO.pdf',
  'USER-GUIDE.pdf',
  'presentacion/presentacion-final.pdf',
  'capturas/01-montaje-protoboard.jpg',
  'capturas/02-prueba-segmentos.jpg',
  'capturas/03-contador-00-a-10.jpg',
  'capturas/05-app-diagrama-codigo.png',
  'capturas/06-app-monitor-placa.png',
  'kicad/fabricacion/render-arriba.png',
]

rmSync(destino, { recursive: true, force: true })
mkdirSync(destino, { recursive: true })
for (const archivo of ARCHIVOS) cpSync(path.join(raiz, archivo), path.join(destino, path.basename(archivo)))
console.log(`${ARCHIVOS.length} archivos copiados en public/archivos`)
