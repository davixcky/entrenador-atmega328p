import type { Rango } from './ast.ts'

// Error de cualquier etapa (lexico, sintaxis, compilacion, diagrama). Lleva el
// rango en el texto o el nodo del diagrama (y su campo) donde esta el problema.
export class ErrorLenguaje extends Error {
  rango?: Rango
  origen?: string
  campo?: string

  constructor(mensaje: string, donde: { rango?: Rango; origen?: string; campo?: string } = {}) {
    super(mensaje)
    this.name = 'ErrorLenguaje'
    this.rango = donde.rango
    this.origen = donde.origen
    this.campo = donde.campo
  }
}

// Linea y columna (desde 1) de un desplazamiento en el texto
export function lineaColumna(texto: string, desplazamiento: number) {
  let linea = 1
  let inicioLinea = 0
  for (let i = 0; i < desplazamiento && i < texto.length; i++) {
    if (texto[i] === '\n') {
      linea++
      inicioLinea = i + 1
    }
  }
  return { linea, columna: desplazamiento - inicioLinea + 1 }
}
