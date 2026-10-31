// node --test pruebas/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analizar,
  analizarExpresion,
  compilar,
  compilarTexto,
  ejemplos,
  ErrorLenguaje,
  formatear,
  formatearExpresion,
  generarArduino,
  listado,
  grafoAPrograma,
  lineaColumna,
  OP,
  programaAGrafo,
  type Grafo,
} from '../src/index.ts'

// Quita rangos y origenes para comparar arboles
const limpio = (x: unknown): unknown =>
  JSON.parse(JSON.stringify(x, (k, v) => (k === 'rango' || k === 'origen' ? undefined : v)))

function errorDe(f: () => unknown): ErrorLenguaje {
  try {
    f()
  } catch (e) {
    assert.ok(e instanceof ErrorLenguaje, `se esperaba ErrorLenguaje y llegó ${e}`)
    return e
  }
  assert.fail('no hubo error')
}

test('los ejemplos compilan y caben', () => {
  for (const { nombre, codigo } of ejemplos) {
    const bytes = compilarTexto(codigo)
    assert.ok(bytes.length > 0 && bytes.length < 768, nombre)
    assert.equal(bytes.at(-1), OP.FIN, nombre)
  }
})

test('texto -> arbol -> texto conserva el programa', () => {
  for (const { nombre, codigo } of ejemplos) {
    const arbol = analizar(codigo)
    const texto = formatear(arbol)
    assert.deepEqual(limpio(analizar(texto)), limpio(arbol), nombre)
    assert.equal(formatear(analizar(texto)), texto, nombre)
  }
})

test('texto -> diagrama -> texto conserva el programa', () => {
  for (const { nombre, codigo } of ejemplos) {
    const arbol = analizar(codigo)
    const grafo: Grafo = JSON.parse(JSON.stringify(programaAGrafo(arbol)))
    const { programa, sueltos } = grafoAPrograma(grafo)
    assert.deepEqual(sueltos, [], nombre)
    assert.equal(formatear(programa), formatear(arbol), nombre)
    assert.deepEqual(compilar(programa).bytes, compilar(arbol).bytes, nombre)
  }
})

test('el acomodo no encima nodos', () => {
  const g = programaAGrafo(analizar(ejemplos[4].codigo))
  for (const a of g.nodos) {
    for (const b of g.nodos) {
      if (a === b) continue
      const juntos = Math.abs(a.x - b.x) < 240 && Math.abs(a.y - b.y) < 40
      assert.ok(!juntos, `${a.id} (${a.tipo}) y ${b.id} (${b.tipo}) se enciman`)
    }
  }
})

test('parentesis solo donde hacen falta', () => {
  const casos: [string, string][] = [
    ['(a + b) * c', '(a + b) * c'],
    ['a + (b * c)', 'a + b * c'],
    ['a - (b - c)', 'a - (b - c)'],
    ['(a - b) - c', 'a - b - c'],
    ['no (a y b)', 'no (a y b)'],
    ['(no a) y b', 'no a y b'],
    ['-(a + 1)', '-(a + 1)'],
    ['(a < b) == c', '(a < b) == c'],
    ['0xff + 0b101', '0xFF + 0b00000101'],
    ['-32768', '-32768'],
  ]
  for (const [entrada, salida] of casos) assert.equal(formatearExpresion(analizarExpresion(entrada)), salida, entrada)
})

test('sino si encadenado', () => {
  const codigo = 'x = dip()\nsi x == 1 {\n  mostrar(1)\n} sino si x == 2 {\n  mostrar(2)\n} sino {\n  mostrar(0)\n}\n'
  assert.equal(formatear(analizar(codigo)), codigo)
  // "sino" en la linea siguiente tambien vale
  assert.equal(formatear(analizar('si 1 {\n}\nsino {\n  detener\n}')), 'si 1 {} sino {\n  detener\n}\n')
})

test('repetir y romper generan los saltos correctos', () => {
  // repetir 2 { romper }: el romper salta despues del bucle
  const b = compilarTexto('repetir 2 {\n  romper\n}\n')
  const fin = b.length - 1
  assert.equal(b[fin], OP.FIN)
  const salto = b.indexOf(OP.SALTO, b.indexOf(OP.SALTO_SI_CERO) + 3)
  assert.equal(b[salto + 1] | (b[salto + 2] << 8), fin)
})

test('errores con ubicacion', () => {
  const texto = 'x = 1\nmostrar(x +)\n'
  const e = errorDe(() => analizar(texto))
  assert.deepEqual(lineaColumna(texto, e.rango!.desde), { linea: 2, columna: 12 })

  assert.match(errorDe(() => analizar('si a && b {}')).message, /Usa "y"/)
  assert.match(errorDe(() => analizar('x == 1')).message, /usa "="/)
  assert.match(errorDe(() => analizar('mostrar(1) mostrar(2)')).message, /salto de línea/)
  assert.match(errorDe(() => analizar('siempre {')).message, /cerrar el bloque/)
  assert.match(errorDe(() => analizar('x = 40000')).message, /muy grande/)

  assert.match(errorDe(() => compilarTexto('romper')).message, /dentro de un bucle/)
  assert.match(errorDe(() => compilarTexto('mostrar(y)')).message, /"y"|valor/)
  assert.match(errorDe(() => compilarTexto('mostrar(z)')).message, /nunca recibe un valor/)
  assert.match(errorDe(() => compilarTexto('mostrar(1, 2)')).message, /recibe 1/)
  assert.match(errorDe(() => compilarTexto('x = mostrar(1)')).message, /no devuelve/)
  assert.match(errorDe(() => compilarTexto('pot()')).message, /devuelve un valor/)
  assert.match(errorDe(() => compilarTexto('mostrar(pot)')).message, /pot\(\)/)
  assert.match(errorDe(() => compilarTexto('encendido = 2')).message, /constante/)
  assert.match(errorDe(() => compilarTexto('mostar(1)')).message, /No existe/)

  const e2 = errorDe(() => compilarTexto('siempre {\n  esperar(cosa)\n}'))
  assert.equal(lineaColumna('siempre {\n  esperar(cosa)\n}', e2.rango!.desde).linea, 2)
})

test('errores del diagrama apuntan al nodo', () => {
  const g = programaAGrafo(analizar('siempre {\n  esperar(100)\n}'))
  const esperar = g.nodos.find((n) => n.tipo === 'esperar')!
  esperar.campos.ms = '100 +'
  const e = errorDe(() => grafoAPrograma(g))
  assert.equal(e.origen, esperar.id)
  assert.equal(e.campo, 'ms')

  esperar.campos.ms = 'nada'
  const e2 = errorDe(() => compilar(grafoAPrograma(g).programa))
  assert.equal(e2.origen, esperar.id)

  // Ciclo: el cuerpo vuelve al "siempre"
  const siempre = g.nodos.find((n) => n.tipo === 'siempre')!
  esperar.campos.ms = '1'
  g.aristas.push({ id: 'ciclo', origen: esperar.id, salida: 'sig', destino: siempre.id })
  assert.match(errorDe(() => grafoAPrograma(g)).message, /varias flechas|vuelve/)
})

test('nodos sueltos no se ejecutan', () => {
  const g = programaAGrafo(analizar('mostrar(1)'))
  g.nodos.push({ id: 'suelto', tipo: 'detener', campos: {}, x: 0, y: 0 })
  const r = grafoAPrograma(g)
  assert.deepEqual(r.sueltos, ['suelto'])
  assert.equal(formatear(r.programa), 'mostrar(1)\n')
})

const sketch = (codigo: string) => generarArduino(analizar(codigo))
const cuerpoSketch = (codigo: string) =>
  sketch(codigo)
    .split('\n')
    .filter((l) => l.startsWith('  ') && !l.includes('entrenador_iniciar'))
    .map((l) => l.slice(2))
    .join('\n')

test('arduino: instrucciones y bucles', () => {
  assert.equal(
    cuerpoSketch('x = 1\nrepetir 3 {\n  repetir x { x += 1 }\n  si x > 9 { romper }\n}\nsiempre { continuar }\ndetener'),
    [
      'x = 1;',
      'for (int16_t vuelta = 3; vuelta > 0; vuelta--) {',
      '  for (int16_t vuelta2 = x; vuelta2 > 0; vuelta2--) {',
      '    x += 1;',
      '  }',
      '  if (x > 9) {',
      '    break;',
      '  }',
      '}',
      'while (true) {',
      '  continue;',
      '}',
      'detener();',
    ].join('\n'),
  )
})

test('arduino: sino si encadenado', () => {
  assert.equal(
    cuerpoSketch('x = 0\nsi x == 1 { leds(1) } sino si x == 2 { leds(2) } sino { leds(3) }'),
    ['x = 0;', 'if (x == 1) {', '  leds(1);', '} else if (x == 2) {', '  leds(2);', '} else {', '  leds(3);', '}'].join('\n'),
  )
})

test('arduino: expresiones con la precedencia de C', () => {
  const casos: [string, string][] = [
    ['no a == b', '!(a == b)'],
    ['a == (b < c)', 'a == (b < c)'],
    ['(a < b) == c', '(a < b) == c'],
    ['a o b y c', 'a || (b && c)'],
    ['(a + b) * c', '(a + b) * c'],
    ['a - (b - c)', 'a - (b - c)'],
    ['-(-a)', '-(-a)'],
    ['a / 2 + a % 3', 'a / 2 + a % 3'],
    ['a / b', 'dividir(a, b)'],
    ['a % (b - 1)', 'modulo(a, b - 1)'],
    ['a / 0', 'dividir(a, 0)'],
    ['0xFF00 + 0b1010', '(int16_t)0xFF00 + 0b00001010'],
    ['led(a, encendido) ', ''],
  ]
  for (const [entrada, salida] of casos.slice(0, -1)) {
    const linea = cuerpoSketch(`a = 1\nb = 2\nc = 3\nr = ${entrada}`).split('\n').pop()
    assert.equal(linea, `r = ${salida};`, entrada)
  }
  assert.match(sketch('led(0, encendido)'), /led\(0, encendido\);/)
})

test('arduino: nombres validos en C++', () => {
  const s = sketch('año = 1\nint = 2\nañó = 3\nPORTB = 4\nvuelta = 5\nrepetir 2 { leds(año + int + añó + PORTB + vuelta) }')
  assert.match(s, /int16_t ano = 0;/)
  assert.match(s, /int16_t v_int = 0;/)
  assert.match(s, /int16_t ano_2 = 0;/)
  assert.match(s, /int16_t v_PORTB = 0;/)
  assert.match(s, /for \(int16_t vuelta2 = 2;/)
  assert.match(s, /leds\(ano \+ v_int \+ ano_2 \+ v_PORTB \+ vuelta\);/)
})

test('arduino: los errores son los del compilador', () => {
  assert.match(errorDe(() => sketch('romper')).message, /dentro de un bucle/)
  assert.match(errorDe(() => sketch('leds(x)')).message, /nunca recibe un valor/)
})

test('listado del bytecode', () => {
  const p = analizar('x = 5\nmientras x > 0 { x -= 1 }')
  const { bytes, variables } = compilar(p)
  assert.equal(
    listado(bytes, variables),
    [
      '  0000  01 05 00   NUM             5',
      '  0003  03 00      GUARDAR         x',
      '0005:',
      '  0005  02 00      LEER            x',
      '  0007  01 00 00   NUM             0',
      '  000A  1C         MAYOR',
      '  000B  29 19 00   SALTO_SI_CERO   0019',
      '  000E  02 00      LEER            x',
      '  0010  01 01 00   NUM             1',
      '  0013  11         RESTA',
      '  0014  03 00      GUARDAR         x',
      '  0016  28 05 00   SALTO           0005',
      '0019:',
      '  0019  00         FIN',
      '',
    ].join('\n'),
  )
})
