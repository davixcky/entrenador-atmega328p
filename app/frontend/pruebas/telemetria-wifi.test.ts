import { test } from 'node:test'
import assert from 'node:assert/strict'
import { telemetriaWifi, wifiVigente, VIGENCIA_WIFI_MS } from '../src/backend/telemetria-wifi.ts'

test('Wi-Fi refleja el estado real, incluido el texto visible y brillo del LCD', () => {
  const texto = 'Estado real'.padEnd(16) + 'Fila 2'.padEnd(16)
  const t = telemetriaWifi({ telemetria: 'T 512 3 129 42 1 0',
    pantalla: `OK 1 27 ${Buffer.from(texto).toString('hex')} 0 2` })
  assert.deepEqual(t, { pot: 512, dip: 3, leds: 129, numero: 42, corriendo: true, error: 0,
    pantalla: { lcd: 1, brillo: 27, lineas: [texto.slice(0, 16), texto.slice(16)], luz: 0, cursor: 2 } })
})

test('lecturas antiguas o invalidas no inventan estado; pantalla es opcional', () => {
  assert.equal(telemetriaWifi({}), null)
  assert.equal(telemetriaWifi({ telemetria: null, pantalla: null }), null)
  assert.equal(telemetriaWifi({ telemetria: 'T 1 2 3' }), null)
  for (const pantalla of [undefined, null, 'ERR comando', 'OK 1 50 bad']) {
    assert.deepEqual(telemetriaWifi({ telemetria: 'T 0 0 0 - 0 2', pantalla }), {
      pot: 0, dip: 0, leds: 0, numero: null, corriendo: false, error: 2, pantalla: null,
    })
  }
})

test('caduca el estado aunque no lleguen mas eventos; rechaza fechas invalidas', () => {
  const ahora = Date.parse('2026-11-14T00:00:00Z')
  assert.equal(wifiVigente(new Date(ahora - VIGENCIA_WIFI_MS).toISOString(), ahora), true)
  assert.equal(wifiVigente(new Date(ahora - VIGENCIA_WIFI_MS - 1).toISOString(), ahora), false)
  assert.equal(wifiVigente(new Date(ahora + 60000).toISOString(), ahora), false)
  assert.equal(wifiVigente(null, ahora), false)
  assert.equal(wifiVigente('invalid', ahora), false)
})
