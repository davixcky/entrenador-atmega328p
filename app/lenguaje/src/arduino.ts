// Programa -> sketch de Arduino (C++) que usa la biblioteca Entrenador
// (firmware/libraries/Entrenador). Cada instruccion del lenguaje queda como una linea
// de C++ con el mismo nombre; la biblioteca reproduce lo que hace la maquina virtual.
import type { Expresion, Programa, Sentencia } from './ast.ts'
import { compilar } from './compilador.ts'
import { CONSTANTES } from './funciones.ts'

const SANGRIA = '  '

// Nombres que no puede usar una variable en el sketch: C++, Arduino y la biblioteca
const RESERVADOS = new Set(
  (
    'alignas alignof and and_eq asm auto bitand bitor bool break case catch char char16_t char32_t class compl ' +
    'const constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export ' +
    'extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr ' +
    'operator or or_eq private protected public register reinterpret_cast return short signed sizeof static ' +
    'static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename ' +
    'union unsigned using virtual void volatile wchar_t while xor xor_eq ' +
    'setup loop main delay delayMicroseconds millis micros pinMode digitalWrite digitalRead analogRead analogWrite ' +
    'analogReference random randomSeed map constrain min max abs sq sqrt pow round bit bitRead bitWrite bitSet ' +
    'bitClear lowByte highByte byte word boolean String Serial tone noTone shiftIn shiftOut pulseIn interrupts ' +
    'noInterrupts attachInterrupt detachInterrupt yield sei cli ' +
    'int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t size_t ' +
    'entrenador_iniciar esperar led leds mostrar apagar_displays pot pot99 dip interruptor aleatorio dividir ' +
    'modulo detener leds_actuales displays_encendidos numero_actual verdadero falso encendido apagado'
  ).split(' '),
)

// Nombre del lenguaje -> identificador de C++: sin tildes (el compilador de AVR no las
// acepta) y sin chocar con nombres reservados ni macros (las macros van en mayusculas).
function identificadorC(nombre: string) {
  let c = nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9_]/g, '_')
  if (RESERVADOS.has(c) || /^[A-Z][A-Z0-9_]*$/.test(c) || c.startsWith('_') || c.includes('__')) c = 'v_' + c.replace(/^_+/, '')
  return c
}

// Mayor numero = une mas fuerte (precedencia de C++)
function precedencia(e: Expresion): number {
  switch (e.tipo) {
    case 'binaria':
      switch (e.op) {
        case 'o':
          return 1
        case 'y':
          return 2
        case '==':
        case '!=':
          return 3
        case '<':
        case '<=':
        case '>':
        case '>=':
          return 4
        case '+':
        case '-':
          return 5
        default:
          return 6 // * / %
      }
    case 'unaria':
      return 7
    case 'numero':
      return e.valor < 0 ? 7 : 8
    default:
      return 8
  }
}

const OPERADOR_C: Record<string, string> = { y: '&&', o: '||' }

function numero(valor: number, base: 2 | 10 | 16 = 10) {
  const sinSigno = valor & 0xffff
  // Los literales hexadecimales y binarios mayores que 0x7FFF son negativos en int16_t
  const conTipo = (texto: string) => (sinSigno > 0x7fff ? `(int16_t)${texto}` : texto)
  if (base === 16) return conTipo('0x' + sinSigno.toString(16).toUpperCase())
  if (base === 2) return conTipo('0b' + sinSigno.toString(2).padStart(sinSigno <= 0xff ? 8 : 16, '0'))
  return String(valor)
}

class Generador {
  lineas: string[] = []
  private nombres = new Map<string, string>()
  private contadores: string[] = []
  private profundidadRepetir = 0

  constructor(variables: Iterable<string>) {
    const usados = new Set<string>()
    for (const v of variables) {
      let c = identificadorC(v)
      for (let i = 2; usados.has(c); i++) c = `${identificadorC(v)}_${i}`
      usados.add(c)
      this.nombres.set(v, c)
    }
    // Contadores de "repetir": vuelta, vuelta2, ... sin chocar con las variables
    for (let i = 1, n = 0; n < 8; i++) {
      const c = i === 1 ? 'vuelta' : `vuelta${i}`
      if (!usados.has(c)) {
        this.contadores.push(c)
        n++
      }
    }
  }

  get variables() {
    return [...this.nombres.values()]
  }

  nombre(v: string) {
    return this.nombres.get(v) ?? identificadorC(v)
  }

  expresion(e: Expresion): string {
    const sub = (hijo: Expresion, minimo: number, padre?: string) => {
      const texto = this.expresion(hijo)
      // && dentro de || y una comparacion dentro de otra llevan parentesis aunque no hagan
      // falta: se lee mejor (y gcc no avisa)
      const comparacion = (x: Expresion) => x.tipo === 'binaria' && (precedencia(x) === 3 || precedencia(x) === 4)
      const claridad =
        (padre === 'o' && hijo.tipo === 'binaria' && hijo.op === 'y') || (padre !== undefined && comparacion(e) && comparacion(hijo))
      return precedencia(hijo) < minimo || claridad ? `(${texto})` : texto
    }
    switch (e.tipo) {
      case 'numero':
        return numero(e.valor, e.base)
      case 'variable':
        // Las constantes (encendido, verdadero...) existen con el mismo nombre en la biblioteca
        return e.nombre in CONSTANTES ? e.nombre : this.nombre(e.nombre)
      case 'llamada':
        return `${e.nombre}(${e.args.map((a) => this.expresion(a)).join(', ')})`
      case 'unaria': {
        const texto = sub(e.a, 7)
        if (e.op === 'no') return `!${texto}`
        return texto.startsWith('-') ? `-(${texto})` : `-${texto}`
      }
      case 'binaria': {
        // Dividir entre 0 da 0 en el lenguaje: solo se usa "/" si el divisor es un numero distinto de 0
        if ((e.op === '/' || e.op === '%') && !(e.b.tipo === 'numero' && e.b.valor !== 0)) {
          return `${e.op === '/' ? 'dividir' : 'modulo'}(${this.expresion(e.a)}, ${this.expresion(e.b)})`
        }
        const p = precedencia(e)
        return `${sub(e.a, p, e.op)} ${OPERADOR_C[e.op] ?? e.op} ${sub(e.b, p + 1, e.op)}`
      }
    }
  }

  bloque(cuerpo: Sentencia[], nivel: number) {
    for (const s of cuerpo) this.sentencia(s, nivel)
  }

  private linea(nivel: number, texto: string) {
    this.lineas.push(SANGRIA.repeat(nivel) + texto)
  }

  sentencia(s: Sentencia, nivel: number, siguienteDeSino = false): void {
    switch (s.tipo) {
      case 'comentario':
        this.linea(nivel, `// ${s.texto}`.trimEnd())
        return
      case 'asignar':
        this.linea(nivel, `${this.nombre(s.nombre)} ${s.op} ${this.expresion(s.valor)};`)
        return
      case 'llamada':
        this.linea(nivel, `${s.nombre}(${s.args.map((a) => this.expresion(a)).join(', ')});`)
        return
      case 'si': {
        const cabecera = `if (${this.expresion(s.condicion)}) {`
        if (siguienteDeSino) this.lineas[this.lineas.length - 1] += ' ' + cabecera
        else this.linea(nivel, cabecera)
        this.bloque(s.entonces, nivel + 1)
        if (s.sino.length === 1 && s.sino[0].tipo === 'si') {
          this.linea(nivel, '} else')
          this.sentencia(s.sino[0], nivel, true)
          return
        }
        if (s.sino.length > 0) {
          this.linea(nivel, '} else {')
          this.bloque(s.sino, nivel + 1)
        }
        this.linea(nivel, '}')
        return
      }
      case 'mientras':
        this.linea(nivel, `while (${this.expresion(s.condicion)}) {`)
        this.bloque(s.cuerpo, nivel + 1)
        this.linea(nivel, '}')
        return
      case 'siempre':
        this.linea(nivel, 'while (true) {')
        this.bloque(s.cuerpo, nivel + 1)
        this.linea(nivel, '}')
        return
      case 'repetir': {
        const c = this.contadores[this.profundidadRepetir]
        this.profundidadRepetir++
        this.linea(nivel, `for (int16_t ${c} = ${this.expresion(s.veces)}; ${c} > 0; ${c}--) {`)
        this.bloque(s.cuerpo, nivel + 1)
        this.linea(nivel, '}')
        this.profundidadRepetir--
        return
      }
      case 'romper':
        this.linea(nivel, 'break;')
        return
      case 'continuar':
        this.linea(nivel, 'continue;')
        return
      case 'detener':
        this.linea(nivel, 'detener();')
        return
    }
  }
}

export interface OpcionesArduino {
  // Nombre del programa para el comentario de cabecera
  nombre?: string
}

// Genera el sketch. Lanza ErrorLenguaje igual que compilar() si el programa tiene errores.
export function generarArduino(p: Programa, opciones: OpcionesArduino = {}): string {
  const { variables } = compilar(p)
  const g = new Generador(variables.keys())
  g.bloque(p.cuerpo, 1)

  const salida = [
    `// ${opciones.nombre ?? 'Programa'} para el entrenador ATmega328P.`,
    '// Generado por la app desde el lenguaje del entrenador: los cambios se pierden al volver a generarlo.',
    '// Necesita la biblioteca Entrenador (firmware/libraries/Entrenador del repositorio).',
    '#include <Entrenador.h>',
    '',
  ]
  if (g.variables.length > 0) {
    salida.push('// Variables del programa (empiezan en 0, como en la app)')
    for (const v of g.variables) salida.push(`int16_t ${v} = 0;`)
    salida.push('')
  }
  salida.push('void setup() {', `${SANGRIA}entrenador_iniciar();`)
  if (g.lineas.length > 0) salida.push('', ...g.lineas)
  salida.push(
    '}',
    '',
    '// El programa corre una vez en setup(); al terminar, las salidas quedan como están.',
    'void loop() {}',
    '',
  )
  return salida.join('\n')
}
