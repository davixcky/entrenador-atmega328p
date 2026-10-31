// Programa -> bytecode de la maquina virtual del firmware (firmware/bloques/maquina.h).
import type { Expresion, OpBinario, Programa, Sentencia } from './ast.ts'
import { ErrorLenguaje } from './errores.ts'
import { CONSTANTES, FUNCIONES } from './funciones.ts'
import { OP, PROG_MAX, VARS_MAX, VARS_USUARIO } from './opcodes.ts'

const OPS_BINARIOS: Record<OpBinario, number> = {
  '+': OP.SUMA,
  '-': OP.RESTA,
  '*': OP.MULT,
  '/': OP.DIV,
  '%': OP.MOD,
  '==': OP.IGUAL,
  '!=': OP.DISTINTO,
  '<': OP.MENOR,
  '<=': OP.MENOR_IGUAL,
  '>': OP.MAYOR,
  '>=': OP.MAYOR_IGUAL,
  y: OP.Y,
  o: OP.O,
}

interface Bucle {
  saltosSalir: number[]
  saltosContinuar: number[]
}

export interface Compilado {
  bytes: number[]
  // Nombre de variable -> casilla en la maquina virtual
  variables: Map<string, number>
}

class Emisor {
  bytes: number[] = []
  variables = new Map<string, number>()
  private bucles: Bucle[] = []
  private temporales = 0

  get pos() {
    return this.bytes.length
  }

  op(...codigos: number[]) {
    this.bytes.push(...codigos)
  }

  num(n: number) {
    this.op(OP.NUM)
    this.u16(n & 0xffff)
  }

  u16(v: number) {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff)
  }

  // Emite un salto y devuelve la posicion de su direccion para parchearla despues
  salto(codigo: number, destino = 0) {
    this.op(codigo)
    const p = this.pos
    this.u16(destino)
    return p
  }

  parchear(p: number, destino = this.pos) {
    this.bytes[p] = destino & 0xff
    this.bytes[p + 1] = (destino >> 8) & 0xff
  }

  conTemporal(f: (v: number) => void) {
    const v = VARS_USUARIO + this.temporales
    if (v >= VARS_MAX) throw new ErrorLenguaje(`No se pueden anidar más de ${VARS_MAX - VARS_USUARIO} "repetir"`)
    this.temporales++
    try {
      f(v)
    } finally {
      this.temporales--
    }
  }

  // Cuerpo de un bucle. "romper" salta al final (lo parchea quien llama) y
  // "continuar" a lo que emita despuesCuerpo.
  bucle(cuerpo: () => void, despuesCuerpo: () => void) {
    const b: Bucle = { saltosSalir: [], saltosContinuar: [] }
    this.bucles.push(b)
    try {
      cuerpo()
    } finally {
      this.bucles.pop()
    }
    for (const p of b.saltosContinuar) this.parchear(p)
    despuesCuerpo()
    return b
  }

  bucleActual(que: string) {
    const b = this.bucles[this.bucles.length - 1]
    if (!b) throw new ErrorLenguaje(`"${que}" solo se puede usar dentro de un bucle`)
    return b
  }
}

// Recorre el programa y numera las variables que reciben valor
function asignarCasillas(cuerpo: Sentencia[], variables: Map<string, number>) {
  for (const s of cuerpo) {
    try {
      if (s.tipo === 'asignar') {
        if (s.nombre in CONSTANTES) throw new ErrorLenguaje(`"${s.nombre}" es una constante; no se le puede asignar un valor`)
        if (s.nombre in FUNCIONES) throw new ErrorLenguaje(`"${s.nombre}" es una función; elige otro nombre para la variable`)
        if (!variables.has(s.nombre)) {
          if (variables.size >= VARS_USUARIO) throw new ErrorLenguaje(`Hay más de ${VARS_USUARIO} variables`)
          variables.set(s.nombre, variables.size)
        }
      }
    } catch (e) {
      throw conUbicacion(e, s)
    }
    if (s.tipo === 'si') {
      asignarCasillas(s.entonces, variables)
      asignarCasillas(s.sino, variables)
    } else if (s.tipo === 'mientras' || s.tipo === 'repetir' || s.tipo === 'siempre') {
      asignarCasillas(s.cuerpo, variables)
    }
  }
}

// Completa la ubicacion de un error con la de la sentencia donde ocurrio
function conUbicacion(e: unknown, s: Sentencia) {
  if (e instanceof ErrorLenguaje) {
    if (!e.rango && !e.origen) e.rango = s.rango
    if (!e.origen) e.origen = s.origen
  }
  return e
}

function llamada(e: Emisor, nombre: string, args: Expresion[], comoValor: boolean, rango: Expresion['rango']) {
  const f = FUNCIONES[nombre]
  if (!f) throw new ErrorLenguaje(`No existe la función "${nombre}"`, { rango })
  if (comoValor && !f.devuelve) throw new ErrorLenguaje(`"${nombre}" es una instrucción y no devuelve un valor`, { rango })
  if (!comoValor && f.devuelve) {
    throw new ErrorLenguaje(`"${nombre}()" devuelve un valor: úsalo en una expresión, por ejemplo x = ${nombre}(...)`, { rango })
  }
  if (args.length !== f.parametros.length) {
    const esperados = f.parametros.length === 0 ? 'ningún valor' : `${f.parametros.length} (${f.parametros.join(', ')})`
    throw new ErrorLenguaje(`"${nombre}" recibe ${esperados} y se le dieron ${args.length}`, { rango })
  }
  for (const a of args) expresion(e, a)
  e.op(...f.codigo)
}

function expresion(e: Emisor, x: Expresion): void {
  switch (x.tipo) {
    case 'numero':
      e.num(x.valor)
      return
    case 'variable': {
      const constante = CONSTANTES[x.nombre]
      if (constante !== undefined) {
        e.num(constante)
        return
      }
      const v = e.variables.get(x.nombre)
      if (v === undefined) {
        const funcion = FUNCIONES[x.nombre]
        if (funcion?.devuelve) throw new ErrorLenguaje(`Para leer "${x.nombre}" escribe ${x.nombre}()`, { rango: x.rango })
        throw new ErrorLenguaje(`La variable "${x.nombre}" nunca recibe un valor`, { rango: x.rango })
      }
      e.op(OP.LEER, v)
      return
    }
    case 'unaria':
      expresion(e, x.a)
      e.op(x.op === 'no' ? OP.NO : OP.NEG)
      return
    case 'binaria':
      expresion(e, x.a)
      expresion(e, x.b)
      e.op(OPS_BINARIOS[x.op])
      return
    case 'llamada':
      llamada(e, x.nombre, x.args, true, x.rango)
      return
  }
}

function secuencia(e: Emisor, cuerpo: Sentencia[]) {
  for (const s of cuerpo) {
    try {
      sentencia(e, s)
    } catch (err) {
      throw conUbicacion(err, s)
    }
  }
}

function sentencia(e: Emisor, s: Sentencia): void {
  switch (s.tipo) {
    case 'comentario':
      return
    case 'asignar': {
      const v = e.variables.get(s.nombre)!
      if (s.op === '=') {
        expresion(e, s.valor)
      } else {
        e.op(OP.LEER, v)
        expresion(e, s.valor)
        e.op(s.op === '+=' ? OP.SUMA : OP.RESTA)
      }
      e.op(OP.GUARDAR, v)
      return
    }
    case 'llamada':
      llamada(e, s.nombre, s.args, false, s.rango)
      return
    case 'si': {
      expresion(e, s.condicion)
      const aSino = e.salto(OP.SALTO_SI_CERO)
      secuencia(e, s.entonces)
      if (s.sino.length === 0) {
        e.parchear(aSino)
        return
      }
      const alFinal = e.salto(OP.SALTO)
      e.parchear(aSino)
      secuencia(e, s.sino)
      e.parchear(alFinal)
      return
    }
    case 'mientras': {
      const inicio = e.pos
      expresion(e, s.condicion)
      const salir = e.salto(OP.SALTO_SI_CERO)
      const b = e.bucle(
        () => secuencia(e, s.cuerpo),
        () => e.salto(OP.SALTO, inicio),
      )
      e.parchear(salir)
      for (const p of b.saltosSalir) e.parchear(p)
      return
    }
    case 'repetir':
      expresion(e, s.veces)
      e.conTemporal((t) => {
        e.op(OP.GUARDAR, t)
        const inicio = e.pos
        e.op(OP.LEER, t)
        e.num(0)
        e.op(OP.MAYOR)
        const salir = e.salto(OP.SALTO_SI_CERO)
        const b = e.bucle(
          () => secuencia(e, s.cuerpo),
          () => {
            e.op(OP.LEER, t)
            e.num(1)
            e.op(OP.RESTA, OP.GUARDAR, t)
            e.salto(OP.SALTO, inicio)
          },
        )
        e.parchear(salir)
        for (const p of b.saltosSalir) e.parchear(p)
      })
      return
    case 'siempre': {
      const inicio = e.pos
      const b = e.bucle(
        () => secuencia(e, s.cuerpo),
        () => e.salto(OP.SALTO, inicio),
      )
      for (const p of b.saltosSalir) e.parchear(p)
      return
    }
    case 'romper':
      e.bucleActual('romper').saltosSalir.push(e.salto(OP.SALTO))
      return
    case 'continuar':
      e.bucleActual('continuar').saltosContinuar.push(e.salto(OP.SALTO))
      return
    case 'detener':
      e.op(OP.FIN)
      return
  }
}

export function compilar(p: Programa): Compilado {
  const e = new Emisor()
  asignarCasillas(p.cuerpo, e.variables)
  secuencia(e, p.cuerpo)
  e.op(OP.FIN)
  if (e.bytes.length > PROG_MAX) {
    throw new ErrorLenguaje(`El programa ocupa ${e.bytes.length} bytes; el máximo es ${PROG_MAX}`)
  }
  return { bytes: e.bytes, variables: e.variables }
}
