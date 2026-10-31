// Diagrama de nodos <-> Programa. No depende de ninguna libreria de interfaz: la app
// lo dibuja con React Flow, pero el modelo es solo nodos, aristas y posiciones.
//
// Cada nodo es una instruccion. Las aristas son el orden de ejecucion: salen de una
// salida ("sig", "cuerpo", "entonces", "sino") y llegan a la entrada de otro nodo.
// La ejecucion empieza en el unico nodo "inicio".
import type { Expresion, OpAsignacion, Programa, Sentencia } from './ast.ts'
import { ErrorLenguaje } from './errores.ts'
import { formatearExpresion } from './formato.ts'
import { analizarExpresion, esNombreValido } from './sintaxis.ts'

export type TipoNodo =
  | 'inicio'
  | 'asignar'
  | 'mostrar'
  | 'leds'
  | 'led'
  | 'esperar'
  | 'apagar_displays'
  | 'llamada'
  | 'si'
  | 'mientras'
  | 'repetir'
  | 'siempre'
  | 'romper'
  | 'continuar'
  | 'detener'
  | 'comentario'

export type Salida = 'sig' | 'cuerpo' | 'entonces' | 'sino'

export interface Campo {
  nombre: string
  etiqueta: string
  // expresion: se analiza con el lenguaje; variable: un nombre; opcion: lista fija
  tipo: 'expresion' | 'variable' | 'opcion' | 'texto'
  opciones?: string[]
  inicial: string
}

export interface DefinicionNodo {
  titulo: string
  categoria: 'control' | 'salidas' | 'datos' | 'notas'
  campos: Campo[]
  // Salidas ademas de "sig" (inicio solo tiene "sig")
  ramas: Salida[]
  // false: no tiene entrada (inicio) o no tiene "sig"
  entrada: boolean
  siguiente: boolean
  ayuda: string
}

const expr = (nombre: string, etiqueta: string, inicial: string): Campo => ({ nombre, etiqueta, tipo: 'expresion', inicial })

export const NODOS: Record<TipoNodo, DefinicionNodo> = {
  inicio: { titulo: 'Al iniciar', categoria: 'control', campos: [], ramas: [], entrada: false, siguiente: true, ayuda: 'Aquí empieza el programa' },
  asignar: {
    titulo: 'Variable',
    categoria: 'datos',
    campos: [
      { nombre: 'variable', etiqueta: 'nombre', tipo: 'variable', inicial: 'x' },
      { nombre: 'op', etiqueta: 'operación', tipo: 'opcion', opciones: ['=', '+=', '-='], inicial: '=' },
      expr('valor', 'valor', '0'),
    ],
    ramas: [],
    entrada: true,
    siguiente: true,
    ayuda: 'Guarda un valor; += suma y -= resta al valor actual',
  },
  mostrar: { titulo: 'Mostrar en displays', categoria: 'salidas', campos: [expr('valor', 'número', '0')], ramas: [], entrada: true, siguiente: true, ayuda: 'Número de 0 a 99; fuera de rango muestra --' },
  leds: { titulo: 'LEDs (binario)', categoria: 'salidas', campos: [expr('valor', 'valor', '0b00000000')], ramas: [], entrada: true, siguiente: true, ayuda: 'Cada bit es un LED; el bit 0 es el de abajo' },
  led: {
    titulo: 'Un LED',
    categoria: 'salidas',
    campos: [expr('n', 'LED', '0'), expr('estado', 'estado', 'encendido')],
    ramas: [],
    entrada: true,
    siguiente: true,
    ayuda: 'LED 0 a 7; estado encendido/apagado o cualquier condición',
  },
  apagar_displays: { titulo: 'Apagar displays', categoria: 'salidas', campos: [], ramas: [], entrada: true, siguiente: true, ayuda: 'Apaga los dos displays' },
  esperar: { titulo: 'Esperar', categoria: 'control', campos: [expr('ms', 'ms', '500')], ramas: [], entrada: true, siguiente: true, ayuda: 'Pausa en milisegundos (1000 = 1 s)' },
  si: {
    titulo: 'Si',
    categoria: 'control',
    campos: [expr('condicion', 'condición', 'interruptor(1)')],
    ramas: ['entonces', 'sino'],
    entrada: true,
    siguiente: true,
    ayuda: 'Ejecuta "entonces" si la condición se cumple; si no, "sino"',
  },
  mientras: { titulo: 'Mientras', categoria: 'control', campos: [expr('condicion', 'condición', 'interruptor(1)')], ramas: ['cuerpo'], entrada: true, siguiente: true, ayuda: 'Repite el cuerpo mientras la condición se cumpla' },
  repetir: { titulo: 'Repetir', categoria: 'control', campos: [expr('veces', 'veces', '10')], ramas: ['cuerpo'], entrada: true, siguiente: true, ayuda: 'Repite el cuerpo un número de veces' },
  siempre: { titulo: 'Repetir siempre', categoria: 'control', campos: [], ramas: ['cuerpo'], entrada: true, siguiente: true, ayuda: 'Repite el cuerpo sin fin (hasta "romper")' },
  romper: { titulo: 'Salir del bucle', categoria: 'control', campos: [], ramas: [], entrada: true, siguiente: false, ayuda: 'Termina el bucle donde está' },
  continuar: { titulo: 'Siguiente vuelta', categoria: 'control', campos: [], ramas: [], entrada: true, siguiente: false, ayuda: 'Salta a la siguiente vuelta del bucle' },
  detener: { titulo: 'Detener programa', categoria: 'control', campos: [], ramas: [], entrada: true, siguiente: false, ayuda: 'Termina el programa' },
  llamada: {
    titulo: 'Instrucción',
    categoria: 'datos',
    campos: [
      { nombre: 'nombre', etiqueta: 'nombre', tipo: 'texto', inicial: 'mostrar' },
      { nombre: 'args', etiqueta: 'valores', tipo: 'texto', inicial: '' },
    ],
    ramas: [],
    entrada: true,
    siguiente: true,
    ayuda: 'Cualquier instrucción con sus valores separados por comas',
  },
  comentario: { titulo: 'Nota', categoria: 'notas', campos: [{ nombre: 'texto', etiqueta: 'texto', tipo: 'texto', inicial: '' }], ramas: [], entrada: true, siguiente: true, ayuda: 'Texto que no se ejecuta' },
}

// Instrucciones con nodo propio: tipo de nodo -> campos en el orden de los argumentos
const INSTRUCCIONES: Partial<Record<TipoNodo, string[]>> = {
  mostrar: ['valor'],
  leds: ['valor'],
  led: ['n', 'estado'],
  esperar: ['ms'],
  apagar_displays: [],
}

export interface Nodo {
  id: string
  tipo: TipoNodo
  campos: Record<string, string>
  x: number
  y: number
}

export interface Arista {
  id: string
  origen: string
  salida: Salida
  destino: string
}

export interface Grafo {
  nodos: Nodo[]
  aristas: Arista[]
}

export function nuevoNodo(tipo: TipoNodo, id: string, x = 0, y = 0): Nodo {
  const campos: Record<string, string> = {}
  for (const c of NODOS[tipo].campos) campos[c.nombre] = c.inicial
  return { id, tipo, campos, x, y }
}

export function idArista(origen: string, salida: Salida) {
  return `${origen}:${salida}`
}

// ---- Diagrama -> Programa ----

export interface Convertido {
  programa: Programa
  // Nodos que no estan conectados al inicio: no se ejecutan
  sueltos: string[]
}

export function grafoAPrograma(g: Grafo): Convertido {
  const porId = new Map(g.nodos.map((n) => [n.id, n]))
  const inicios = g.nodos.filter((n) => n.tipo === 'inicio')
  if (inicios.length === 0) throw new ErrorLenguaje('Falta el nodo "Al iniciar"')
  if (inicios.length > 1) throw new ErrorLenguaje('Solo puede haber un nodo "Al iniciar"', { origen: inicios[1].id })

  const salidas = new Map<string, string>()
  const entradas = new Map<string, number>()
  for (const a of g.aristas) {
    if (!porId.has(a.origen) || !porId.has(a.destino)) continue
    const clave = idArista(a.origen, a.salida)
    if (salidas.has(clave)) throw new ErrorLenguaje('Una salida solo puede ir a un nodo', { origen: a.origen })
    salidas.set(clave, a.destino)
    entradas.set(a.destino, (entradas.get(a.destino) ?? 0) + 1)
  }
  for (const [id, n] of entradas) {
    if (n > 1) throw new ErrorLenguaje('A este nodo llegan varias flechas: cada nodo tiene un solo paso anterior', { origen: id })
  }

  const visitados = new Set<string>()

  const campo = (n: Nodo, nombre: string): Expresion => {
    try {
      return analizarExpresion(n.campos[nombre] ?? '')
    } catch (e) {
      const etiqueta = NODOS[n.tipo].campos.find((c) => c.nombre === nombre)?.etiqueta ?? nombre
      const mensaje = e instanceof Error ? e.message : String(e)
      throw new ErrorLenguaje(`${NODOS[n.tipo].titulo}, ${etiqueta}: ${mensaje}`, { origen: n.id, campo: nombre })
    }
  }

  const cadena = (desde: string | undefined): Sentencia[] => {
    const lista: Sentencia[] = []
    for (let id = desde; id; ) {
      if (visitados.has(id)) throw new ErrorLenguaje('El diagrama vuelve a un nodo anterior; para repetir usa un bucle', { origen: id })
      visitados.add(id)
      const n = porId.get(id)!
      if (n.tipo === 'inicio') throw new ErrorLenguaje('"Al iniciar" no puede estar dentro del programa', { origen: id })
      lista.push(sentencia(n))
      id = NODOS[n.tipo].siguiente ? salidas.get(idArista(id, 'sig')) : undefined
    }
    return lista
  }

  const rama = (n: Nodo, salida: Salida) => cadena(salidas.get(idArista(n.id, salida)))

  const sentencia = (n: Nodo): Sentencia => {
    const origen = n.id
    const args = INSTRUCCIONES[n.tipo]
    if (args) return { tipo: 'llamada', nombre: n.tipo, args: args.map((a) => campo(n, a)), origen }

    switch (n.tipo) {
      case 'asignar': {
        const nombre = (n.campos.variable ?? '').trim()
        if (!esNombreValido(nombre)) {
          throw new ErrorLenguaje(`"${nombre}" no sirve como nombre de variable: usa letras, números y _`, { origen, campo: 'variable' })
        }
        const op = (['=', '+=', '-='].includes(n.campos.op) ? n.campos.op : '=') as OpAsignacion
        return { tipo: 'asignar', nombre, op, valor: campo(n, 'valor'), origen }
      }
      case 'llamada': {
        const nombre = (n.campos.nombre ?? '').trim()
        if (!esNombreValido(nombre)) throw new ErrorLenguaje(`"${nombre}" no es un nombre de instrucción`, { origen, campo: 'nombre' })
        let args: Expresion[]
        try {
          const llamada = analizarExpresion(`${nombre}(${n.campos.args ?? ''})`)
          args = llamada.tipo === 'llamada' ? llamada.args : []
        } catch (e) {
          throw new ErrorLenguaje(`Valores: ${e instanceof Error ? e.message : e}`, { origen, campo: 'args' })
        }
        return { tipo: 'llamada', nombre, args, origen }
      }
      case 'si':
        return { tipo: 'si', condicion: campo(n, 'condicion'), entonces: rama(n, 'entonces'), sino: rama(n, 'sino'), origen }
      case 'mientras':
        return { tipo: 'mientras', condicion: campo(n, 'condicion'), cuerpo: rama(n, 'cuerpo'), origen }
      case 'repetir':
        return { tipo: 'repetir', veces: campo(n, 'veces'), cuerpo: rama(n, 'cuerpo'), origen }
      case 'siempre':
        return { tipo: 'siempre', cuerpo: rama(n, 'cuerpo'), origen }
      case 'comentario':
        return { tipo: 'comentario', texto: (n.campos.texto ?? '').replace(/\s*\n\s*/g, ' ').trim(), origen }
      case 'romper':
      case 'continuar':
      case 'detener':
        return { tipo: n.tipo, origen }
    }
    throw new ErrorLenguaje(`Nodo desconocido: ${n.tipo}`, { origen })
  }

  visitados.add(inicios[0].id)
  const cuerpo = cadena(salidas.get(idArista(inicios[0].id, 'sig')))
  const sueltos = g.nodos.filter((n) => !visitados.has(n.id)).map((n) => n.id)
  return { programa: { cuerpo }, sueltos }
}

// ---- Programa -> Diagrama ----

export function programaAGrafo(p: Programa): Grafo {
  const nodos: Nodo[] = []
  const aristas: Arista[] = []
  let contador = 0

  const agregar = (tipo: TipoNodo, campos: Record<string, string> = {}) => {
    const n = nuevoNodo(tipo, `n${++contador}`)
    Object.assign(n.campos, campos)
    nodos.push(n)
    return n
  }
  const unir = (origen: string, salida: Salida, destino: string | undefined) => {
    if (destino) aristas.push({ id: idArista(origen, salida), origen, salida, destino })
  }

  // Crea los nodos de una secuencia y devuelve el id del primero
  const cadena = (cuerpo: Sentencia[]): string | undefined => {
    let primero: string | undefined
    let anterior: Nodo | undefined
    for (const s of cuerpo) {
      const n = nodo(s)
      if (anterior) unir(anterior.id, 'sig', n.id)
      else primero = n.id
      anterior = n
      // Lo que sigue a romper/continuar/detener nunca se ejecuta y no tiene donde colgarse
      if (!NODOS[n.tipo].siguiente) break
    }
    return primero
  }

  const nodo = (s: Sentencia): Nodo => {
    switch (s.tipo) {
      case 'asignar':
        return agregar('asignar', { variable: s.nombre, op: s.op, valor: formatearExpresion(s.valor) })
      case 'llamada': {
        const campos = INSTRUCCIONES[s.nombre as TipoNodo]
        if (campos && campos.length === s.args.length) {
          const valores: Record<string, string> = {}
          campos.forEach((c, i) => (valores[c] = formatearExpresion(s.args[i])))
          return agregar(s.nombre as TipoNodo, valores)
        }
        return agregar('llamada', { nombre: s.nombre, args: s.args.map(formatearExpresion).join(', ') })
      }
      case 'si': {
        const n = agregar('si', { condicion: formatearExpresion(s.condicion) })
        unir(n.id, 'entonces', cadena(s.entonces))
        unir(n.id, 'sino', cadena(s.sino))
        return n
      }
      case 'mientras': {
        const n = agregar('mientras', { condicion: formatearExpresion(s.condicion) })
        unir(n.id, 'cuerpo', cadena(s.cuerpo))
        return n
      }
      case 'repetir': {
        const n = agregar('repetir', { veces: formatearExpresion(s.veces) })
        unir(n.id, 'cuerpo', cadena(s.cuerpo))
        return n
      }
      case 'siempre': {
        const n = agregar('siempre')
        unir(n.id, 'cuerpo', cadena(s.cuerpo))
        return n
      }
      case 'comentario':
        return agregar('comentario', { texto: s.texto })
      default:
        return agregar(s.tipo)
    }
  }

  const inicio = agregar('inicio')
  unir(inicio.id, 'sig', cadena(p.cuerpo))
  return ordenar({ nodos, aristas })
}

// ---- Acomodo automatico ----

// Medidas que usa el acomodo; la interfaz dibuja los nodos con este ancho
export const ANCHO_NODO = 240
export const SANGRIA_X = 48
const SEPARACION_Y = 28
const SEPARACION_X = 40

export function altoNodo(tipo: TipoNodo) {
  const d = NODOS[tipo]
  return 36 + d.campos.length * 34 + (d.ramas.length ? 22 : 0) + (d.campos.length ? 8 : 0)
}

// Coloca los nodos conectados al inicio como un esquema con sangria: la secuencia
// baja en una columna, los cuerpos van debajo y a la derecha, y "sino" al lado de
// "entonces". Los nodos sueltos quedan donde estaban.
export function ordenar(g: Grafo, x0 = 40, y0 = 40): Grafo {
  const porId = new Map(g.nodos.map((n) => [n.id, { ...n }]))
  const salidas = new Map(g.aristas.map((a) => [idArista(a.origen, a.salida), a.destino]))
  const colocados = new Set<string>()

  // Devuelve el borde inferior y el borde derecho de lo colocado
  const cadena = (desde: string | undefined, x: number, y: number): { abajo: number; derecha: number } => {
    let abajo = y - SEPARACION_Y
    let derecha = x + ANCHO_NODO
    for (let id = desde; id && !colocados.has(id); ) {
      const n = porId.get(id)
      if (!n) break
      colocados.add(id)
      n.x = x
      n.y = abajo + SEPARACION_Y
      let fondo = n.y + altoNodo(n.tipo)
      const ramas = NODOS[n.tipo].ramas
      if (ramas.length) {
        const yRama = fondo + SEPARACION_Y
        const primera = cadena(salidas.get(idArista(id, ramas[0])), x + SANGRIA_X, yRama)
        fondo = Math.max(fondo, primera.abajo)
        derecha = Math.max(derecha, primera.derecha)
        if (ramas[1]) {
          const segunda = cadena(salidas.get(idArista(id, ramas[1])), primera.derecha + SEPARACION_X, yRama)
          fondo = Math.max(fondo, segunda.abajo)
          derecha = Math.max(derecha, segunda.derecha)
        }
      }
      abajo = fondo
      id = salidas.get(idArista(id, 'sig'))
    }
    return { abajo, derecha }
  }

  for (const inicio of g.nodos.filter((n) => n.tipo === 'inicio')) {
    cadena(inicio.id, x0, y0)
  }
  return { nodos: g.nodos.map((n) => porId.get(n.id)!), aristas: g.aristas }
}
