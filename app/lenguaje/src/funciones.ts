// Funciones y constantes predefinidas del lenguaje. El compilador, el editor de
// texto (autocompletado) y el diagrama (paleta) leen esta tabla.
import { OP } from './opcodes.ts'

export interface Funcion {
  // Nombres de los parametros, para mensajes y ayuda
  parametros: string[]
  // true: devuelve un valor (se usa en expresiones); false: es una instruccion
  devuelve: boolean
  descripcion: string
  // Codigo que se emite despues de apilar los argumentos en orden
  codigo: number[]
}

export const FUNCIONES: Record<string, Funcion> = {
  // Instrucciones
  esperar: { parametros: ['ms'], devuelve: false, descripcion: 'Espera los milisegundos indicados', codigo: [OP.ESPERAR] },
  led: { parametros: ['n', 'estado'], devuelve: false, descripcion: 'Enciende o apaga el LED n (0 a 7)', codigo: [OP.LED] },
  leds: { parametros: ['valor'], devuelve: false, descripcion: 'Muestra un valor de 8 bits en los LEDs', codigo: [OP.LEDS] },
  mostrar: { parametros: ['numero'], devuelve: false, descripcion: 'Muestra un número 0 a 99 en los displays', codigo: [OP.NUMERO] },
  apagar_displays: { parametros: [], devuelve: false, descripcion: 'Apaga los dos displays', codigo: [OP.APAGAR_DISPLAYS] },
  // Valores
  pot: { parametros: [], devuelve: true, descripcion: 'Potenciómetro de 0 a 1023', codigo: [OP.POT] },
  // pot * 25 / 256 = 0..99 sin desbordar int16 (1023 * 25 = 25575)
  pot99: {
    parametros: [],
    devuelve: true,
    descripcion: 'Potenciómetro de 0 a 99',
    codigo: [OP.POT, OP.NUM, 25, 0, OP.MULT, OP.NUM, 0, 1, OP.DIV],
  },
  dip: { parametros: [], devuelve: true, descripcion: 'DIP switch como número de 0 a 15', codigo: [OP.DIP] },
  interruptor: { parametros: ['n'], devuelve: true, descripcion: 'Interruptor n del DIP (1 a 4): 1 cerrado, 0 abierto', codigo: [OP.INTERRUPTOR] },
  aleatorio: { parametros: ['min', 'max'], devuelve: true, descripcion: 'Número al azar entre min y max', codigo: [OP.ALEATORIO] },
}

export const CONSTANTES: Record<string, number> = {
  verdadero: 1,
  falso: 0,
  encendido: 1,
  apagado: 0,
}

export const PALABRAS_CLAVE = ['si', 'sino', 'mientras', 'repetir', 'siempre', 'romper', 'continuar', 'detener', 'y', 'o', 'no'] as const
