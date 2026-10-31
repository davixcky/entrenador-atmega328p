// Bytecode -> listado legible: direccion, bytes y la instruccion de la maquina virtual.
import { OP, VARS_USUARIO } from './opcodes.ts'

export interface InstruccionListada {
  direccion: number
  bytes: number[]
  nombre: string
  // Operando ya legible: numero, variable o direccion de salto
  operando?: string
  // Direccion a la que salta (SALTO, SALTO_SI_CERO)
  destino?: number
}

const NOMBRES = new Map<number, string>(Object.entries(OP).map(([nombre, codigo]) => [codigo, nombre]))

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, '0')

// variables: nombre -> casilla, como lo devuelve compilar()
export function desensamblar(bytes: number[], variables?: Map<string, number>): InstruccionListada[] {
  const nombreVariable = new Map<number, string>()
  for (const [nombre, casilla] of variables ?? []) nombreVariable.set(casilla, nombre)
  const variable = (v: number) =>
    nombreVariable.get(v) ?? (v === VARS_USUARIO ? 'vuelta' : v > VARS_USUARIO ? `vuelta${v - VARS_USUARIO + 1}` : `v${v}`)

  const lista: InstruccionListada[] = []
  let pc = 0
  while (pc < bytes.length) {
    const direccion = pc
    const op = bytes[pc++]
    const nombre = NOMBRES.get(op) ?? `?${op.toString(16).padStart(2, '0')}`
    const i: InstruccionListada = { direccion, bytes: [op], nombre }
    const u16 = () => {
      const v = bytes[pc] | (bytes[pc + 1] << 8)
      i.bytes.push(bytes[pc], bytes[pc + 1])
      pc += 2
      return v
    }
    switch (op) {
      case OP.NUM: {
        const v = u16()
        i.operando = String(v > 0x7fff ? v - 0x10000 : v)
        break
      }
      case OP.LEER:
      case OP.GUARDAR:
        i.bytes.push(bytes[pc])
        i.operando = variable(bytes[pc++])
        break
      case OP.SALTO:
      case OP.SALTO_SI_CERO:
        i.destino = u16()
        i.operando = hex4(i.destino)
        break
    }
    lista.push(i)
  }
  return lista
}

// Listado de texto, con una etiqueta en cada destino de salto
export function listado(bytes: number[], variables?: Map<string, number>): string {
  const instrucciones = desensamblar(bytes, variables)
  const destinos = new Set(instrucciones.flatMap((i) => (i.destino === undefined ? [] : [i.destino])))
  const lineas: string[] = []
  for (const i of instrucciones) {
    if (destinos.has(i.direccion)) lineas.push(`${hex4(i.direccion)}:`)
    const crudos = i.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
    lineas.push(`  ${hex4(i.direccion)}  ${crudos.padEnd(9)}  ${i.nombre.padEnd(16)}${i.operando ?? ''}`.trimEnd())
  }
  return lineas.join('\n') + '\n'
}
