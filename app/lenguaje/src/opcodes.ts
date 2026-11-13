// Codigos de operacion de la maquina virtual del firmware (firmware/bloques/maquina.h).
// Deben coincidir con el enum OP_* de ese archivo.
export const OP = {
  FIN: 0x00,
  NUM: 0x01,
  LEER: 0x02,
  GUARDAR: 0x03,
  SUMA: 0x10,
  RESTA: 0x11,
  MULT: 0x12,
  DIV: 0x13,
  MOD: 0x14,
  NEG: 0x15,
  IGUAL: 0x18,
  DISTINTO: 0x19,
  MENOR: 0x1a,
  MENOR_IGUAL: 0x1b,
  MAYOR: 0x1c,
  MAYOR_IGUAL: 0x1d,
  Y: 0x1e,
  O: 0x1f,
  NO: 0x20,
  SALTO: 0x28,
  SALTO_SI_CERO: 0x29,
  ESPERAR: 0x30,
  LED: 0x31,
  LEDS: 0x32,
  NUMERO: 0x33,
  APAGAR_DISPLAYS: 0x34,
  BRILLO: 0x35,
  LCD_LIMPIAR: 0x36,
  LCD_TEXTO: 0x37, // + largo + bytes ASCII del texto
  LCD_NUMERO: 0x38,
  NUBE_ENVIAR: 0x39,
  LCD_LUZ: 0x3a,
  LCD_CURSOR: 0x3b,
  INVERTIR_POT: 0x3c,
  LCD_NUBE: 0x3d,
  POT: 0x40,
  DIP: 0x41,
  INTERRUPTOR: 0x42,
  ALEATORIO: 0x43,
  NUBE: 0x44,
} as const

// Limites de la maquina virtual
export const PROG_MAX = 768
export const VARS_MAX = 32
// Las ultimas variables quedan para los contadores ocultos de "repetir"
export const VARS_USUARIO = 24
// Columnas del LCD: un texto mas largo no cabe en una fila
export const LCD_COLUMNAS = 16
