// Analizador del lenguaje de texto: texto -> tokens -> Programa.
//
//   // comentario
//   cuenta = 0
//   siempre {
//     mostrar(cuenta)
//     esperar(300)
//     cuenta += 1
//     si cuenta > 99 { cuenta = 0 }
//   }
import type { Expresion, OpAsignacion, OpBinario, Programa, Rango, Sentencia } from './ast.ts'
import { ErrorLenguaje } from './errores.ts'
import { PALABRAS_CLAVE } from './funciones.ts'

type TipoToken = 'numero' | 'nombre' | 'simbolo' | 'salto' | 'comentario' | 'fin'

interface Token {
  tipo: TipoToken
  texto: string
  desde: number
  hasta: number
  valor?: number
  base?: 2 | 10 | 16
}

const SIMBOLOS = ['==', '!=', '<=', '>=', '+=', '-=', '&&', '||', '{', '}', '(', ')', ',', ';', '+', '-', '*', '/', '%', '<', '>', '=', '!']
const LETRA = /[\p{L}_]/u
const LETRA_O_DIGITO = /[\p{L}\p{N}_]/u
const PALABRAS = new Set<string>(PALABRAS_CLAVE)

export function tokenizar(texto: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let parentesis = 0 // dentro de ( ) los saltos de linea no cuentan

  while (i < texto.length) {
    const c = texto[i]
    const desde = i

    if (c === '\n') {
      i++
      if (parentesis === 0) tokens.push({ tipo: 'salto', texto: '\n', desde, hasta: i })
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }
    if (texto.startsWith('//', i)) {
      while (i < texto.length && texto[i] !== '\n') i++
      tokens.push({ tipo: 'comentario', texto: texto.slice(desde + 2, i).trim(), desde, hasta: i })
      continue
    }
    if (c >= '0' && c <= '9') {
      let base: 2 | 10 | 16 = 10
      if (/^0[xX]/.test(texto.slice(i, i + 2))) base = 16
      else if (/^0[bB]/.test(texto.slice(i, i + 2))) base = 2
      if (base !== 10) i += 2
      const digito = base === 16 ? /[0-9a-fA-F_]/ : base === 2 ? /[01_]/ : /[0-9_]/
      const inicioDigitos = i
      while (i < texto.length && digito.test(texto[i])) i++
      const digitos = texto.slice(inicioDigitos, i).replaceAll('_', '')
      if (i < texto.length && LETRA_O_DIGITO.test(texto[i])) {
        while (i < texto.length && LETRA_O_DIGITO.test(texto[i])) i++
        throw new ErrorLenguaje(`Número mal escrito: "${texto.slice(desde, i)}"`, { rango: { desde, hasta: i } })
      }
      if (digitos === '') throw new ErrorLenguaje('Faltan dígitos después del prefijo', { rango: { desde, hasta: i } })
      tokens.push({ tipo: 'numero', texto: texto.slice(desde, i), desde, hasta: i, valor: parseInt(digitos, base), base })
      continue
    }
    if (LETRA.test(c)) {
      while (i < texto.length && LETRA_O_DIGITO.test(texto[i])) i++
      tokens.push({ tipo: 'nombre', texto: texto.slice(desde, i), desde, hasta: i })
      continue
    }
    const simbolo = SIMBOLOS.find((s) => texto.startsWith(s, i))
    if (simbolo) {
      i += simbolo.length
      if (simbolo === '(') parentesis++
      if (simbolo === ')') parentesis = Math.max(0, parentesis - 1)
      tokens.push({ tipo: 'simbolo', texto: simbolo, desde, hasta: i })
      continue
    }
    throw new ErrorLenguaje(`Carácter no válido: "${c}"`, { rango: { desde, hasta: desde + 1 } })
  }

  tokens.push({ tipo: 'fin', texto: '', desde: texto.length, hasta: texto.length })
  return tokens
}

function describir(t: Token) {
  if (t.tipo === 'fin') return 'el final'
  if (t.tipo === 'salto') return 'un salto de línea'
  if (t.tipo === 'comentario') return 'un comentario'
  return `"${t.texto}"`
}

const OPS_COMPARACION: Record<string, OpBinario> = { '==': '==', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' }
const OPS_SUMA: Record<string, OpBinario> = { '+': '+', '-': '-' }
const OPS_PRODUCTO: Record<string, OpBinario> = { '*': '*', '/': '/', '%': '%' }
const OPS_ASIGNACION: Record<string, OpAsignacion> = { '=': '=', '+=': '+=', '-=': '-=' }
const SUGERENCIAS: Record<string, string> = { '&&': 'y', '||': 'o', '!': 'no' }

class Analizador {
  private i = 0
  private tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private get actual() {
    return this.tokens[this.i]
  }

  private avanzar() {
    const t = this.tokens[this.i]
    if (t.tipo !== 'fin') this.i++
    return t
  }

  private es(texto: string) {
    const t = this.actual
    return (t.tipo === 'simbolo' || t.tipo === 'nombre') && t.texto === texto
  }

  private error(mensaje: string, t = this.actual): never {
    throw new ErrorLenguaje(mensaje, { rango: { desde: t.desde, hasta: Math.max(t.hasta, t.desde + 1) } })
  }

  private esperar(texto: string, contexto?: string) {
    if (!this.es(texto)) {
      const sugerencia = SUGERENCIAS[this.actual.texto]
      if (sugerencia) this.error(`Usa "${sugerencia}" en lugar de "${this.actual.texto}"`)
      this.error(`Se esperaba "${texto}"${contexto ? ' ' + contexto : ''} y llegó ${describir(this.actual)}`)
    }
    return this.avanzar()
  }

  private haySalto() {
    return this.actual.tipo === 'salto'
  }

  private saltarSaltos() {
    while (this.actual.tipo === 'salto' || this.es(';')) this.avanzar()
  }

  programa(): Programa {
    const cuerpo = this.sentencias()
    if (this.actual.tipo !== 'fin') this.error(`Sobra ${describir(this.actual)}: no hay un bloque abierto que cerrar`)
    return { cuerpo }
  }

  // Lee sentencias hasta "}" o el final, sin consumirlos
  private sentencias(): Sentencia[] {
    const lista: Sentencia[] = []
    for (;;) {
      this.saltarSaltos()
      if (this.actual.tipo === 'fin' || this.es('}')) return lista
      lista.push(this.sentencia())
      const t = this.actual
      if (!(t.tipo === 'salto' || t.tipo === 'comentario' || t.tipo === 'fin' || this.es(';') || this.es('}'))) {
        this.error(`Se esperaba un salto de línea antes de ${describir(t)}`)
      }
    }
  }

  private bloque(contexto: string): Sentencia[] {
    this.esperar('{', contexto)
    const cuerpo = this.sentencias()
    this.esperar('}', 'para cerrar el bloque')
    return cuerpo
  }

  private sentencia(): Sentencia {
    const t = this.actual
    const desde = t.desde
    const rango = (): Rango => ({ desde, hasta: this.tokens[this.i - 1].hasta })

    if (t.tipo === 'comentario') {
      this.avanzar()
      return { tipo: 'comentario', texto: t.texto, rango: rango() }
    }
    if (t.tipo !== 'nombre') this.error(`Se esperaba una instrucción y llegó ${describir(t)}`)

    switch (t.texto) {
      case 'si':
        return this.si()
      case 'mientras': {
        this.avanzar()
        const condicion = this.expresion()
        const cuerpo = this.bloque('después de la condición de "mientras"')
        return { tipo: 'mientras', condicion, cuerpo, rango: rango() }
      }
      case 'repetir': {
        this.avanzar()
        const veces = this.expresion()
        const cuerpo = this.bloque('después de las veces de "repetir"')
        return { tipo: 'repetir', veces, cuerpo, rango: rango() }
      }
      case 'siempre': {
        this.avanzar()
        const cuerpo = this.bloque('después de "siempre"')
        return { tipo: 'siempre', cuerpo, rango: rango() }
      }
      case 'romper':
      case 'continuar':
      case 'detener':
        this.avanzar()
        return { tipo: t.texto as 'romper' | 'continuar' | 'detener', rango: rango() }
      case 'sino':
        this.error('"sino" debe ir justo después del bloque de un "si"')
    }
    if (PALABRAS.has(t.texto)) this.error(`"${t.texto}" no puede empezar una instrucción`)

    this.avanzar()
    if (this.es('(')) {
      const args = this.argumentos()
      return { tipo: 'llamada', nombre: t.texto, args, rango: rango() }
    }
    const op = OPS_ASIGNACION[this.actual.texto]
    if (this.actual.tipo === 'simbolo' && op) {
      this.avanzar()
      const valor = this.expresion()
      return { tipo: 'asignar', nombre: t.texto, op, valor, rango: rango() }
    }
    if (this.es('==')) this.error('Para guardar un valor usa "=" (con "==" se compara)')
    this.error(`Después de "${t.texto}" se esperaba "=" o "(" y llegó ${describir(this.actual)}`)
  }

  private si(): Sentencia {
    const desde = this.avanzar().desde
    const condicion = this.expresion()
    const entonces = this.bloque('después de la condición de "si"')
    let sino: Sentencia[] = []

    // "sino" puede ir en la misma linea que "}" o en la siguiente
    const guardado = this.i
    while (this.haySalto()) this.avanzar()
    if (this.es('sino')) {
      this.avanzar()
      sino = this.es('si') ? [this.si()] : this.bloque('después de "sino"')
    } else {
      this.i = guardado
    }
    return { tipo: 'si', condicion, entonces, sino, rango: { desde, hasta: this.tokens[this.i - 1].hasta } }
  }

  private argumentos(): Expresion[] {
    this.esperar('(')
    const args: Expresion[] = []
    if (!this.es(')')) {
      args.push(this.expresion())
      while (this.es(',')) {
        this.avanzar()
        args.push(this.expresion())
      }
    }
    this.esperar(')', 'para cerrar los argumentos')
    return args
  }

  expresionCompleta(): Expresion {
    while (this.haySalto()) this.avanzar()
    const e = this.expresion()
    while (this.haySalto()) this.avanzar()
    if (this.actual.tipo !== 'fin') this.error(`Sobra ${describir(this.actual)} al final de la expresión`)
    return e
  }

  private expresion(): Expresion {
    return this.o()
  }

  private binaria(op: OpBinario, a: Expresion, b: Expresion): Expresion {
    return { tipo: 'binaria', op, a, b, rango: { desde: a.rango!.desde, hasta: b.rango!.hasta } }
  }

  private o(): Expresion {
    let a = this.y()
    while (this.es('o')) {
      this.avanzar()
      a = this.binaria('o', a, this.y())
    }
    return a
  }

  private y(): Expresion {
    let a = this.no()
    while (this.es('y')) {
      this.avanzar()
      a = this.binaria('y', a, this.no())
    }
    return a
  }

  private no(): Expresion {
    if (this.es('no')) {
      const desde = this.avanzar().desde
      const a = this.no()
      return { tipo: 'unaria', op: 'no', a, rango: { desde, hasta: a.rango!.hasta } }
    }
    return this.comparacion()
  }

  private comparacion(): Expresion {
    const a = this.suma()
    const op = this.actual.tipo === 'simbolo' ? OPS_COMPARACION[this.actual.texto] : undefined
    if (!op) return a
    this.avanzar()
    const b = this.suma()
    if (this.actual.tipo === 'simbolo' && OPS_COMPARACION[this.actual.texto]) {
      this.error('No se pueden encadenar comparaciones: usa "y" (por ejemplo a < b y b < c)')
    }
    return this.binaria(op, a, b)
  }

  private suma(): Expresion {
    let a = this.producto()
    for (let op: OpBinario | undefined; this.actual.tipo === 'simbolo' && (op = OPS_SUMA[this.actual.texto]); ) {
      this.avanzar()
      a = this.binaria(op, a, this.producto())
    }
    return a
  }

  private producto(): Expresion {
    let a = this.unario()
    for (let op: OpBinario | undefined; this.actual.tipo === 'simbolo' && (op = OPS_PRODUCTO[this.actual.texto]); ) {
      this.avanzar()
      a = this.binaria(op, a, this.unario())
    }
    return a
  }

  private unario(): Expresion {
    if (this.es('-')) {
      const menos = this.avanzar()
      // -32768 solo existe como literal negativo
      if (this.actual.tipo === 'numero' && this.actual.base === 10) {
        const t = this.avanzar()
        const valor = -t.valor!
        if (valor < -32768) this.error('El número es muy pequeño: el mínimo es -32768', t)
        return { tipo: 'numero', valor, rango: { desde: menos.desde, hasta: t.hasta } }
      }
      const a = this.unario()
      return { tipo: 'unaria', op: '-', a, rango: { desde: menos.desde, hasta: a.rango!.hasta } }
    }
    return this.primario()
  }

  private primario(): Expresion {
    const t = this.actual
    if (t.tipo === 'numero') {
      this.avanzar()
      let valor = t.valor!
      if (t.base === 10 && valor > 32767) this.error('El número es muy grande: el máximo es 32767', t)
      if (t.base !== 10) {
        if (valor > 0xffff) this.error('El número no cabe en 16 bits', t)
        if (valor > 32767) valor -= 65536
      }
      return { tipo: 'numero', valor, base: t.base, rango: { desde: t.desde, hasta: t.hasta } }
    }
    if (t.tipo === 'nombre' && !PALABRAS.has(t.texto)) {
      this.avanzar()
      if (this.es('(')) {
        const args = this.argumentos()
        return { tipo: 'llamada', nombre: t.texto, args, rango: { desde: t.desde, hasta: this.tokens[this.i - 1].hasta } }
      }
      return { tipo: 'variable', nombre: t.texto, rango: { desde: t.desde, hasta: t.hasta } }
    }
    if (this.es('(')) {
      this.avanzar()
      const e = this.expresion()
      this.esperar(')', 'para cerrar el paréntesis')
      return e
    }
    const sugerencia = SUGERENCIAS[t.texto]
    if (sugerencia) this.error(`Usa "${sugerencia}" en lugar de "${t.texto}"`)
    this.error(`Se esperaba un valor y llegó ${describir(t)}`)
  }
}

// Texto completo de un programa
export function analizar(texto: string): Programa {
  return new Analizador(tokenizar(texto)).programa()
}

// Una sola expresion (campos del diagrama)
export function analizarExpresion(texto: string): Expresion {
  if (texto.trim() === '') throw new ErrorLenguaje('Falta un valor')
  return new Analizador(tokenizar(texto)).expresionCompleta()
}

// Nombre valido para una variable
export function esNombreValido(nombre: string) {
  return /^[\p{L}_][\p{L}\p{N}_]*$/u.test(nombre) && !PALABRAS.has(nombre)
}
