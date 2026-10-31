// Plugin de remark: los documentos son los .md del repositorio, con enlaces relativos
// pensados para GitHub. En el sitio, los que tienen pagina propia apuntan a ella y el
// resto al archivo en GitHub.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = 'https://github.com/davixcky/entrenador-atmega328p'
const BASE = '/entrenador-atmega328p'
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// Documento del repositorio -> pagina del sitio
export const PAGINAS = {
  'GUIA-USO.md': '/es/guia/',
  'USER-GUIDE.md': '/en/guide/',
  'app/lenguaje/README.md': '/es/lenguaje/',
  'app/lenguaje/README.en.md': '/en/language/',
  'firmware/libraries/Entrenador/README.md': '/es/biblioteca/',
  'README.md': '/es/',
  'README.en.md': '/en/',
}

function visitar(nodo, f) {
  f(nodo)
  for (const hijo of nodo.children ?? []) visitar(hijo, f)
}

export function enlacesDelRepo() {
  return (arbol, archivo) => {
    const origen = archivo.path ?? archivo.history?.[0]
    if (!origen) return
    const carpeta = path.relative(RAIZ, path.dirname(origen))
    visitar(arbol, (nodo) => {
      if (nodo.type !== 'link' && nodo.type !== 'image') return
      const url = nodo.url
      if (!url || /^([a-z]+:|#|\/)/i.test(url)) return
      const [ruta, ancla] = url.split('#')
      const destino = path.posix.normalize(path.posix.join(carpeta.split(path.sep).join('/'), ruta))
      if (PAGINAS[destino]) {
        nodo.url = BASE + PAGINAS[destino] + (ancla ? '#' + ancla : '')
      } else if (nodo.type === 'image') {
        nodo.url = `${REPO}/raw/main/${destino}`
      } else {
        const esCarpeta = ruta.endsWith('/') || !path.posix.extname(destino)
        nodo.url = `${REPO}/${esCarpeta ? 'tree' : 'blob'}/main/${destino}${ancla ? '#' + ancla : ''}`
      }
    })
  }
}
