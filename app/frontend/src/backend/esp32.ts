// ESP32 puente (firmware/esp32-puente): estado, configuracion de Wi-Fi y nube por los
// comandos @ (INTEGRADOR.md) y, en el navegador, grabar su firmware con esptool-js.
import { ESPLoader, Transport } from 'esptool-js'

type Comando = (linea: string, esperaMs?: number) => Promise<string>

export interface EstadoEsp32 {
  wifi: string
  ip: string
  nube: string
  dispositivo: string
  detalle: string // paso que fallo en el ultimo ciclo de la nube (get:401, post:-1, entrenador...) o -
}

// "OK ESP32 1 wifi=conectado ip=192.168.1.50 nube=ok dispositivo=entrenador-1"
export function parsearEstado(l: string): EstadoEsp32 {
  if (!l.startsWith('OK ESP32')) throw new Error(`El puente no es un ESP32 ("${l}"). ¿Es el Uno?`)
  const campos = Object.fromEntries(
    l
      .split(/\s+/)
      .filter((c) => c.includes('='))
      .map((c) => [c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)]),
  )
  return { wifi: campos.wifi ?? '?', ip: campos.ip ?? '-', nube: campos.nube ?? '?', dispositivo: campos.dispositivo ?? '?', detalle: campos.detalle ?? '-' }
}

export async function estadoEsp32(comando: Comando) {
  return parsearEstado(await comando('@?'))
}

export interface ConfigEsp32 {
  ssid?: string
  clave?: string
  url?: string
  llave?: string
  dispositivo?: string
  periodo_ms?: number
}

// Solo manda las claves con valor: el ESP32 conserva las demas (NVS)
export async function configurarEsp32(comando: Comando, c: ConfigEsp32) {
  const datos = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && v !== ''))
  await comando('@CONF ' + JSON.stringify(datos), 3000)
}

export async function activarNube(comando: Comando, activa: boolean) {
  await comando(`@NUBE ${activa ? 1 : 0}`)
}

// Imagen unica (bootloader + particiones + app) que deja `idf.py` + `esptool merge_bin`
// en firmware/esp32-puente/dist; si todavia no se compilo, no hay imagen.
const imagenes = import.meta.glob('../../../../firmware/esp32-puente/dist/esp32-puente-merged.bin', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>
export const urlImagenEsp32: string | undefined = Object.values(imagenes)[0]

// Graba el ESP32 desde el navegador. El puerto debe estar cerrado (desconectar antes).
export async function grabarEsp32(puerto: SerialPort, avance: (fraccion: number) => void, registrar: (l: string) => void) {
  if (!urlImagenEsp32) throw new Error('No está la imagen del ESP32: compila firmware/esp32-puente (ver su README).')
  const datos = new Uint8Array(await (await fetch(urlImagenEsp32)).arrayBuffer())
  let binario = ''
  for (let i = 0; i < datos.length; i += 0x8000) binario += String.fromCharCode(...datos.subarray(i, i + 0x8000))

  const transporte = new Transport(puerto, false)
  const terminal = {
    clean() {},
    writeLine: (l: string) => l.trim() && registrar('esptool: ' + l.trim()),
    write: () => {},
  }
  const cargador = new ESPLoader({ transport: transporte, baudrate: 460800, romBaudrate: 115200, terminal })
  try {
    const chip = await cargador.main()
    registrar(`esptool: ${chip}`)
    await cargador.writeFlash({
      fileArray: [{ data: binario, address: 0 }],
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (_i, escrito, total) => avance(escrito / total),
    })
    await cargador.after('hard_reset')
  } finally {
    await transporte.disconnect().catch(() => undefined)
  }
}
