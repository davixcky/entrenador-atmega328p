// Exportar e importar la configuracion de la app en un archivo JSON: conexion a la nube
// (URL, clave anon, dispositivo), los Ajustes y el nombre de la red Wi-Fi del ESP32.
// La clave Wi-Fi no se guarda nunca. La clave anon es la publica de Supabase (la misma
// que va en la app y en el ESP32), pero igual conviene no publicar el archivo.
import { AJUSTES_INICIALES, type Ajustes } from './ajustes'
import { configGuardada, guardarConfig, type ConfigNube } from './backend/nube'

const CLAVE_AJUSTES = 'entrenador.ajustes'
const CLAVE_WIFI = 'entrenador.wifi'

export interface Configuracion {
  tipo: 'entrenador-configuracion'
  version: 1
  exportado: string
  nube: ConfigNube
  ajustes: Ajustes
  wifi: { ssid: string }
}

export function redGuardada(): string {
  try {
    const w = JSON.parse(localStorage.getItem(CLAVE_WIFI) ?? '{}')
    return typeof w?.ssid === 'string' ? w.ssid : ''
  } catch {
    return ''
  }
}

export function guardarRed(ssid: string) {
  try {
    localStorage.setItem(CLAVE_WIFI, JSON.stringify({ ssid }))
  } catch {
    // sin almacenamiento
  }
}

export function exportarConfiguracion(ajustes: Ajustes): string {
  const c: Configuracion = {
    tipo: 'entrenador-configuracion',
    version: 1,
    exportado: new Date().toISOString(),
    nube: configGuardada(),
    ajustes,
    wifi: { ssid: redGuardada() },
  }
  return JSON.stringify(c, null, 2) + '\n'
}

const esTexto = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max

// Valida el archivo y lo deja guardado; la app se recarga despues para tomarlo.
// Devuelve un resumen para mostrar.
export function importarConfiguracion(texto: string): string {
  let c: Partial<Configuracion>
  try {
    c = JSON.parse(texto)
  } catch {
    throw new Error('El archivo no es JSON.')
  }
  if (c?.tipo !== 'entrenador-configuracion' || c.version !== 1) {
    throw new Error('No es un archivo de configuración del entrenador (exportado desde Ajustes).')
  }
  const n = c.nube
  if (!n || !esTexto(n.url) || !esTexto(n.llave, 2000) || !esTexto(n.dispositivo, 100) || !/^https?:\/\//.test(n.url)) {
    throw new Error('La sección "nube" del archivo no es válida.')
  }
  const a = { ...AJUSTES_INICIALES, ...(c.ajustes ?? {}) }
  const ajustes: Ajustes = {
    lcdLuz: a.lcdLuz !== false,
    lcdCursor: a.lcdCursor === 1 || a.lcdCursor === 2 ? a.lcdCursor : 0,
    brillo: Number.isInteger(a.brillo) && a.brillo >= 0 && a.brillo <= 100 ? a.brillo : 100,
    potInvertido: a.potInvertido === true,
  }
  guardarConfig({ url: n.url, llave: n.llave, dispositivo: n.dispositivo })
  try {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes))
  } catch {
    // sin almacenamiento
  }
  const ssid = esTexto(c.wifi?.ssid, 32) ? c.wifi.ssid : ''
  if (ssid) guardarRed(ssid)
  return `Nube: ${n.url} (${n.dispositivo})${n.llave ? '' : ', sin clave'}${ssid ? ` · Wi-Fi: ${ssid}` : ''}`
}
