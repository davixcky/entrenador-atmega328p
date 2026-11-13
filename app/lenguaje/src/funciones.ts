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
  // Posiciones de los parametros que son texto entre comillas: no se apilan, sus bytes
  // van justo despues del codigo (largo + caracteres)
  textos?: number[]
}

export const FUNCIONES: Record<string, Funcion> = {
  // Instrucciones
  esperar: { parametros: ['ms'], devuelve: false, descripcion: 'Espera los milisegundos indicados', codigo: [OP.ESPERAR] },
  led: { parametros: ['n', 'estado'], devuelve: false, descripcion: 'Enciende o apaga el LED n (0 a 7)', codigo: [OP.LED] },
  leds: { parametros: ['valor'], devuelve: false, descripcion: 'Muestra un valor de 8 bits en los LEDs', codigo: [OP.LEDS] },
  mostrar: { parametros: ['numero'], devuelve: false, descripcion: 'Muestra un número 0 a 99 en los displays', codigo: [OP.NUMERO] },
  apagar_displays: { parametros: [], devuelve: false, descripcion: 'Apaga los dos displays', codigo: [OP.APAGAR_DISPLAYS] },
  brillo: { parametros: ['porcentaje'], devuelve: false, descripcion: 'Brillo de los LEDs de 0 a 100 % (PWM)', codigo: [OP.BRILLO] },
  lcd_limpiar: { parametros: [], devuelve: false, descripcion: 'Borra el LCD', codigo: [OP.LCD_LIMPIAR] },
  lcd_texto: {
    parametros: ['fila', 'columna', 'texto'],
    devuelve: false,
    descripcion: 'Escribe un texto entre comillas en el LCD (fila 0 o 1, columna 0 a 15)',
    codigo: [OP.LCD_TEXTO],
    textos: [2],
  },
  lcd_numero: {
    parametros: ['fila', 'columna', 'numero', 'ancho'],
    devuelve: false,
    descripcion: 'Escribe un número en el LCD alineado a la derecha en "ancho" columnas (1 a 6)',
    codigo: [OP.LCD_NUMERO],
  },
  lcd_luz: { parametros: ['estado'], devuelve: false, descripcion: 'Enciende (1) o apaga (0) la luz de fondo del LCD', codigo: [OP.LCD_LUZ] },
  lcd_cursor: {
    parametros: ['modo'],
    devuelve: false,
    descripcion: 'Cursor del LCD: 0 sin cursor, 1 raya fija, 2 bloque que parpadea',
    codigo: [OP.LCD_CURSOR],
  },
  invertir_pot: {
    parametros: ['estado'],
    devuelve: false,
    descripcion: 'Con encendido, pot() da 1023 con el potenciómetro al mínimo (sentido de giro al revés)',
    codigo: [OP.INVERTIR_POT],
  },
  lcd_nube: {
    parametros: ['fila'],
    devuelve: false,
    descripcion: 'Escribe en la fila 0 o 1 del LCD el texto que llega de la nube (lcd1 / lcd2 en Supabase)',
    codigo: [OP.LCD_NUBE],
  },
  nube_enviar: { parametros: ['n', 'valor'], devuelve: false, descripcion: 'Envía un valor a la nube por el ESP32 (n de 1 a 4)', codigo: [OP.NUBE_ENVIAR] },
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
  nube: { parametros: ['n'], devuelve: true, descripcion: 'Último valor recibido de la nube por el ESP32 (n de 1 a 4)', codigo: [OP.NUBE] },
}

export const CONSTANTES: Record<string, number> = {
  verdadero: 1,
  falso: 0,
  encendido: 1,
  apagado: 0,
}

export const PALABRAS_CLAVE = ['si', 'sino', 'mientras', 'repetir', 'siempre', 'romper', 'continuar', 'detener', 'y', 'o', 'no'] as const
