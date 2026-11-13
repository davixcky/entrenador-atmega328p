// Ajustes del entrenador que la app agrega sola al inicio de cada programa: luz y cursor
// del LCD, brillo de los LEDs y sentido del potenciometro. Se ven en "Generado" (sketch de Arduino y bytecode).
// Las lineas del LCD solo se agregan si el programa usa el LCD: sin LCD el firmware no
// toca el I2C y PC4 queda para DIP4.
import { useCallback, useEffect, useState } from 'react'
import { analizar, formatear, type Programa } from '@entrenador/lenguaje'

export interface Ajustes {
  lcdLuz: boolean
  lcdCursor: 0 | 1 | 2
  brillo: number // 0..100
  potInvertido: boolean
}

export const AJUSTES_INICIALES: Ajustes = { lcdLuz: true, lcdCursor: 0, brillo: 100, potInvertido: false }

const CLAVE = 'entrenador.ajustes'

function cargar(): Ajustes {
  try {
    const a = JSON.parse(localStorage.getItem(CLAVE) ?? 'null')
    if (a && typeof a === 'object') {
      return {
        lcdLuz: a.lcdLuz !== false,
        lcdCursor: a.lcdCursor === 1 || a.lcdCursor === 2 ? a.lcdCursor : 0,
        brillo: Number.isInteger(a.brillo) && a.brillo >= 0 && a.brillo <= 100 ? a.brillo : 100,
        potInvertido: a.potInvertido === true,
      }
    }
  } catch {
    // sin almacenamiento: valores de fabrica
  }
  return AJUSTES_INICIALES
}

export function useAjustes() {
  const [ajustes, setAjustes] = useState<Ajustes>(cargar)
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(ajustes))
    } catch {
      // sin almacenamiento: los ajustes duran esta sesion
    }
  }, [ajustes])
  const cambiar = useCallback((cambios: Partial<Ajustes>) => setAjustes((a) => ({ ...a, ...cambios })), [])
  return { ajustes, cambiar }
}

export function usaLcd(programa: Programa): boolean {
  return /\blcd_/.test(formatear(programa))
}

// Lineas de codigo que se agregan; vacio si todo esta como al encender
export function lineasAjustes(a: Ajustes, conLcd: boolean): string[] {
  const lineas: string[] = []
  if (conLcd) {
    lineas.push(`lcd_luz(${a.lcdLuz ? 'encendido' : 'apagado'})`)
    lineas.push(`lcd_cursor(${a.lcdCursor})`)
  }
  if (a.brillo !== 100) lineas.push(`brillo(${a.brillo})`)
  if (a.potInvertido) lineas.push('invertir_pot(encendido)')
  return lineas
}

// Programa con los ajustes al inicio, precedidos de un comentario
export function aplicarAjustes(programa: Programa, a: Ajustes): Programa {
  const lineas = lineasAjustes(a, usaLcd(programa))
  if (!lineas.length) return programa
  const cabecera = analizar(['// Ajustes de la app (botón Ajustes)', ...lineas].join('\n'))
  return { cuerpo: [...cabecera.cuerpo, ...programa.cuerpo] }
}
