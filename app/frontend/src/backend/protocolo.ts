// Partes del protocolo serie del entrenador que no dependen del puerto: las usa el
// backend web y se prueban en el PC (pruebas/protocolo.test.ts). Es lo mismo que hace
// app/conexion.go en la app de escritorio.
import type { Pantalla, Telemetria } from '../componentes/Placa'

export const BAUDIOS = 19200
// Bytes por linea "D" al cargar un programa: cabe en el buffer de linea del entrenador
export const BYTES_POR_LINEA = 32

// "T <pot> <dip> <leds> <numero|-> <corriendo> <error>"
export function parsearTelemetria(l: string): Telemetria {
  const campos = l.trim().split(/\s+/)
  if (campos.length !== 7 || campos[0] !== 'T') throw new Error(`telemetría inválida "${l}"`)
  const n = (i: number) => {
    if (!/^-?\d+$/.test(campos[i])) throw new Error(`telemetría inválida "${l}"`)
    return Number(campos[i])
  }
  return {
    pot: n(1),
    dip: n(2),
    leds: n(3),
    numero: campos[4] === '-' ? null : n(4),
    corriendo: n(5) === 1,
    error: n(6),
  }
}

// "OK <lcd> <brillo> <64 digitos hex> [<luz> <cursor>]": respuesta al comando P (firmware bloques 2)
export function parsearPantalla(l: string): Pantalla {
  const campos = l.trim().split(/\s+/)
  const [ok, lcd, brillo, hex, luz, cursor] = campos
  const extraValido = campos.length === 4 || (campos.length === 6 && /^\d$/.test(luz) && /^\d$/.test(cursor))
  if (!extraValido || ok !== 'OK' || !/^\d$/.test(lcd ?? '') || !/^\d+$/.test(brillo ?? '') || !/^[0-9A-Fa-f]{64}$/.test(hex ?? '')) {
    throw new Error(`pantalla inválida "${l}"`)
  }
  const texto = String.fromCharCode(...hex.match(/../g)!.map((x) => parseInt(x, 16)))
  const p: Pantalla = { lcd: Number(lcd), brillo: Number(brillo), lineas: [texto.slice(0, 16), texto.slice(16)] }
  if (campos.length === 6) Object.assign(p, { luz: Number(luz), cursor: Number(cursor) })
  return p
}

// Comandos para cargar un programa: B, D <pos> <hex>... y E <largo> <suma>
export function lineasPrograma(bytes: number[]): string[] {
  const lineas = ['B']
  for (let pos = 0; pos < bytes.length; pos += BYTES_POR_LINEA) {
    const trozo = bytes.slice(pos, pos + BYTES_POR_LINEA)
    lineas.push(`D ${pos} ${trozo.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('')}`)
  }
  const suma = bytes.reduce((s, b) => s + b, 0) % 65536
  lineas.push(`E ${bytes.length} ${suma}`)
  return lineas
}

// Una respuesta termina la transaccion; las demas lineas son mensajes sueltos
export function esRespuesta(l: string) {
  return l.startsWith('OK') || l.startsWith('T ') || l.startsWith('ERR')
}

// Junta los trozos que llegan por el puerto y devuelve las lineas completas sin \r
export class Lineas {
  private pendiente = ''

  agregar(trozo: string): string[] {
    this.pendiente += trozo
    const partes = this.pendiente.split('\n')
    this.pendiente = partes.pop() ?? ''
    return partes.map((p) => p.replace(/\r$/, ''))
  }

  vaciar() {
    this.pendiente = ''
  }
}
