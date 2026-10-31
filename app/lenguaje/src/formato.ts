// Programa -> texto. Es la inversa de sintaxis.ts: analizar(formatear(p)) da el mismo programa.
import type { Expresion, Programa, Sentencia } from './ast.ts'

const SANGRIA = '  '

// Mayor numero = une mas fuerte
function precedencia(e: Expresion): number {
  switch (e.tipo) {
    case 'binaria':
      switch (e.op) {
        case 'o':
          return 1
        case 'y':
          return 2
        case '+':
        case '-':
          return 5
        case '*':
        case '/':
        case '%':
          return 6
        default:
          return 4 // comparaciones
      }
    case 'unaria':
      return e.op === 'no' ? 3 : 7
    case 'numero':
      return e.valor < 0 ? 7 : 8
    default:
      return 8
  }
}

function numero(valor: number, base: 2 | 10 | 16 = 10) {
  const sinSigno = valor & 0xffff
  if (base === 16) return '0x' + sinSigno.toString(16).toUpperCase()
  if (base === 2) return '0b' + sinSigno.toString(2).padStart(sinSigno <= 0xff ? 8 : 16, '0')
  return String(valor)
}

export function formatearExpresion(e: Expresion): string {
  const sub = (hijo: Expresion, minimo: number) => {
    const texto = formatearExpresion(hijo)
    return precedencia(hijo) < minimo ? `(${texto})` : texto
  }
  switch (e.tipo) {
    case 'numero':
      return numero(e.valor, e.base)
    case 'variable':
      return e.nombre
    case 'llamada':
      return `${e.nombre}(${e.args.map(formatearExpresion).join(', ')})`
    case 'unaria':
      return e.op === 'no' ? `no ${sub(e.a, 3)}` : `-${sub(e.a, 7)}`
    case 'binaria': {
      const p = precedencia(e)
      // Asociativas por la izquierda; las comparaciones no se encadenan
      const izquierda = p === 4 ? p + 1 : p
      return `${sub(e.a, izquierda)} ${e.op} ${sub(e.b, p + 1)}`
    }
  }
}

function bloque(cuerpo: Sentencia[], nivel: number): string {
  if (cuerpo.length === 0) return '{}'
  return `{\n${cuerpo.map((s) => sentencia(s, nivel + 1)).join('\n')}\n${SANGRIA.repeat(nivel)}}`
}

function sentencia(s: Sentencia, nivel: number): string {
  const sangria = SANGRIA.repeat(nivel)
  switch (s.tipo) {
    case 'asignar':
      return `${sangria}${s.nombre} ${s.op} ${formatearExpresion(s.valor)}`
    case 'llamada':
      return `${sangria}${s.nombre}(${s.args.map(formatearExpresion).join(', ')})`
    case 'si': {
      let texto = `${sangria}si ${formatearExpresion(s.condicion)} ${bloque(s.entonces, nivel)}`
      if (s.sino.length === 1 && s.sino[0].tipo === 'si') {
        texto += ' sino ' + sentencia(s.sino[0], nivel).trimStart()
      } else if (s.sino.length > 0) {
        texto += ' sino ' + bloque(s.sino, nivel)
      }
      return texto
    }
    case 'mientras':
      return `${sangria}mientras ${formatearExpresion(s.condicion)} ${bloque(s.cuerpo, nivel)}`
    case 'repetir':
      return `${sangria}repetir ${formatearExpresion(s.veces)} ${bloque(s.cuerpo, nivel)}`
    case 'siempre':
      return `${sangria}siempre ${bloque(s.cuerpo, nivel)}`
    case 'comentario':
      return `${sangria}// ${s.texto}`.trimEnd()
    default:
      return sangria + s.tipo
  }
}

export function formatear(p: Programa): string {
  return p.cuerpo.map((s) => sentencia(s, 0)).join('\n') + '\n'
}
