// Lenguaje del entrenador ATmega328P: texto y diagrama de nodos que compilan al
// bytecode de la maquina virtual del firmware (firmware/bloques/maquina.h) o se
// traducen a un sketch de Arduino con la biblioteca Entrenador.
export type { Expresion, OpAsignacion, OpBinario, OpUnario, Programa, Rango, Sentencia } from './ast.ts'
export { ErrorLenguaje, lineaColumna } from './errores.ts'
export { CONSTANTES, FUNCIONES, PALABRAS_CLAVE, type Funcion } from './funciones.ts'
export { OP, PROG_MAX, VARS_MAX, VARS_USUARIO } from './opcodes.ts'
export { analizar, analizarExpresion, esNombreValido, tokenizar } from './sintaxis.ts'
export { formatear, formatearExpresion } from './formato.ts'
export { compilar, type Compilado } from './compilador.ts'
export { generarArduino, type OpcionesArduino } from './arduino.ts'
export { desensamblar, listado, type InstruccionListada } from './desensamblador.ts'
export {
  ANCHO_NODO,
  NODOS,
  SANGRIA_X,
  altoNodo,
  grafoAPrograma,
  idArista,
  nuevoNodo,
  ordenar,
  programaAGrafo,
  type Arista,
  type Campo,
  type Convertido,
  type DefinicionNodo,
  type Grafo,
  type Nodo,
  type Salida,
  type TipoNodo,
} from './grafo.ts'
export { ejemplos } from './ejemplos.ts'

import { analizar } from './sintaxis.ts'
import { compilar } from './compilador.ts'

// Atajo: texto -> bytecode
export function compilarTexto(texto: string): number[] {
  return compilar(analizar(texto)).bytes
}
