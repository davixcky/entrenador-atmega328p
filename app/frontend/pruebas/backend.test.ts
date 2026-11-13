// node --test pruebas/   (las partes del backend que no necesitan navegador ni placa)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Lineas, lineasPrograma, parsearPantalla, parsearTelemetria } from '../src/backend/protocolo.ts'
import { FUSIBLES, grabarAtmega, paginasHex, PAGINA } from '../src/backend/isp.ts'

test('telemetría del entrenador', () => {
  assert.deepEqual(parsearTelemetria('T 512 3 129 42 1 0'), { pot: 512, dip: 3, leds: 129, numero: 42, corriendo: true, error: 0 })
  assert.equal(parsearTelemetria('T 0 0 0 - 0 2').numero, null)
  assert.throws(() => parsearTelemetria('T 1 2 3'), /inválida/)
  assert.throws(() => parsearTelemetria('OK'), /inválida/)
})

test('cargar un programa: B, D en trozos de 32 bytes y E con la suma', () => {
  const bytes = Array.from({ length: 40 }, (_, i) => i)
  const l = lineasPrograma(bytes)
  assert.equal(l[0], 'B')
  assert.equal(l[1], 'D 0 ' + bytes.slice(0, 32).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(''))
  assert.equal(l[2], 'D 32 2021222324252627')
  assert.equal(l[3], `E 40 ${bytes.reduce((a, b) => a + b, 0)}`)
})

test('las líneas llegan en trozos y con \\r\\n', () => {
  const lineas = new Lineas()
  assert.deepEqual(lineas.agregar('PUENTE O'), [])
  assert.deepEqual(lineas.agregar('K\r\nOK ENTR'), ['PUENTE OK'])
  assert.deepEqual(lineas.agregar('ENADOR 2\nT 1'), ['OK ENTRENADOR 2'])
})

test('Intel HEX del firmware bloques -> páginas de 128 bytes', () => {
  const hex = readFileSync(new URL('../../firmware/bloques.hex', import.meta.url), 'utf8')
  const paginas = paginasHex(hex)
  assert.ok(paginas.size > 10)
  for (const [dir, datos] of paginas) {
    assert.equal(dir % PAGINA, 0)
    assert.equal(datos.length, PAGINA)
  }
  // programa desde 0x0000 y Optiboot en los ultimos 512 bytes
  assert.ok(paginas.has(0))
  assert.ok(paginas.has(0x7e00))
  assert.throws(() => paginasHex(':0300000002000AF0\n'), /suma/)
})

// ESP32 simulado: guarda las paginas y los fusibles como lo haria el chip
function esp32Falso(firma = '1E950F') {
  const flash = new Map<number, string>()
  const fusibles: Record<string, number> = { L: 0xff, H: 0xde, E: 0xfd }
  const enviados: string[] = []
  const comando = async (l: string) => {
    enviados.push(l.split(' ').slice(0, 2).join(' '))
    const p = l.split(' ')
    if (l === '@ISP INICIO') return `OK ${firma}`
    if (p[1] === 'PAGINA') flash.set(Number(p[2]), p[3])
    if (p[1] === 'LEER') return `OK ${flash.get(Number(p[2])) ?? 'FF'.repeat(PAGINA)}`
    if (p[1] === 'FUSIBLE') fusibles[p[2]] = parseInt(p[3], 16)
    if (p[1] === 'FUSIBLES') return `OK ${[fusibles.L, fusibles.H, fusibles.E | 0xf8, 0xff].map((x) => x.toString(16)).join(' ')}`
    return 'OK'
  }
  return { comando, flash, fusibles, enviados }
}

test('grabar el ATmega por el ESP32: borra, graba, verifica, fusibles y suelta el ISP', async () => {
  const hex = ':10000000000102030405060708090A0B0C0D0E0F78\n:00000001FF\n'
  const e = esp32Falso()
  const etapas: string[] = []
  await grabarAtmega(e.comando, hex, (a) => etapas.push(a.etapa), () => {})
  assert.equal(e.flash.get(0)!.slice(0, 32), '000102030405060708090A0B0C0D0E0F')
  assert.deepEqual(e.fusibles, { L: FUSIBLES.L, H: FUSIBLES.H, E: FUSIBLES.E })
  assert.deepEqual(e.enviados.slice(0, 3), ['@ISP INICIO', '@ISP BORRAR', '@ISP PAGINA'])
  assert.equal(e.enviados.at(-1), '@ISP FIN')
  assert.equal(etapas.at(-1), 'listo')
})

test('si la firma no es de un ATmega328P no graba y suelta el ISP', async () => {
  const e = esp32Falso('000000')
  await assert.rejects(grabarAtmega(e.comando, ':00000001FF\n:0100000001FE\n', () => {}, () => {}), /HEX vacío|Firma/)
  const e2 = esp32Falso('000000')
  await assert.rejects(grabarAtmega(e2.comando, ':0100000001FE\n:00000001FF\n', () => {}, () => {}), /Firma 000000/)
  assert.ok(!e2.enviados.includes('@ISP BORRAR'))
  assert.equal(e2.enviados.at(-1), '@ISP FIN')
})

test('pantalla (comando P): LCD en hexadecimal y brillo', () => {
  const texto = 'ADC:       700  VALOR1:     37  '
  const hex = [...texto].map((c) => c.charCodeAt(0).toString(16).toUpperCase()).join('')
  assert.deepEqual(parsearPantalla(`OK 1 37 ${hex}`), { lcd: 1, brillo: 37, lineas: ['ADC:       700  ', 'VALOR1:     37  '] })
  assert.deepEqual(parsearPantalla(`OK 1 37 ${hex} 0 2`), { lcd: 1, brillo: 37, lineas: ['ADC:       700  ', 'VALOR1:     37  '], luz: 0, cursor: 2 })
  assert.throws(() => parsearPantalla(`OK 1 37 ${hex} 0`), /inválida/)
  assert.throws(() => parsearPantalla('OK 1 37 4142'), /inválida/)
  assert.throws(() => parsearPantalla('ERR comando'), /inválida/)
})
