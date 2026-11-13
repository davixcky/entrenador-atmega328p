import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textoLcd, MAX_TEXTO_LCD } from '../src/backend/texto-lcd.ts'

test('mensajes largos conservan mas de una pantalla y normalizan el alfabeto del LCD', () => {
  assert.equal(textoLcd('Información desde la nube para el entrenador'), 'Informacion desde la nube para el entrenador')
  assert.equal(textoLcd('a'.repeat(200)), 'a'.repeat(MAX_TEXTO_LCD))
  assert.equal(textoLcd('Hola'), 'Hola')
  assert.equal(textoLcd(''), '')
  assert.equal(textoLcd('uno\ndos'), 'uno?dos')
})
