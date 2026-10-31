// Arbol de sintaxis del lenguaje del entrenador. Lo producen el analizador de texto
// (sintaxis.ts) y el diagrama (grafo.ts); lo consumen el compilador y el formateador.

// Rango en el texto fuente (desplazamientos desde el inicio, fin exclusivo)
export interface Rango {
  desde: number
  hasta: number
}

export type OpBinario = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'y' | 'o'
export type OpUnario = '-' | 'no'
export type OpAsignacion = '=' | '+=' | '-='

export type Expresion =
  | { tipo: 'numero'; valor: number; base?: 2 | 10 | 16; rango?: Rango }
  | { tipo: 'variable'; nombre: string; rango?: Rango }
  | { tipo: 'binaria'; op: OpBinario; a: Expresion; b: Expresion; rango?: Rango }
  | { tipo: 'unaria'; op: OpUnario; a: Expresion; rango?: Rango }
  | { tipo: 'llamada'; nombre: string; args: Expresion[]; rango?: Rango }

// `origen` identifica de donde salio la sentencia (id de nodo del diagrama) para
// señalar los errores en el lugar correcto.
interface Base {
  rango?: Rango
  origen?: string
}

export type Sentencia =
  | (Base & { tipo: 'asignar'; nombre: string; op: OpAsignacion; valor: Expresion })
  | (Base & { tipo: 'llamada'; nombre: string; args: Expresion[] })
  | (Base & { tipo: 'si'; condicion: Expresion; entonces: Sentencia[]; sino: Sentencia[] })
  | (Base & { tipo: 'mientras'; condicion: Expresion; cuerpo: Sentencia[] })
  | (Base & { tipo: 'repetir'; veces: Expresion; cuerpo: Sentencia[] })
  | (Base & { tipo: 'siempre'; cuerpo: Sentencia[] })
  | (Base & { tipo: 'romper' })
  | (Base & { tipo: 'continuar' })
  | (Base & { tipo: 'detener' })
  | (Base & { tipo: 'comentario'; texto: string })

export interface Programa {
  cuerpo: Sentencia[]
}
