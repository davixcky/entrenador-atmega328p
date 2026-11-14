import { parsearPantalla, parsearTelemetria } from './protocolo.ts'
import type { Telemetria } from '../componentes/Placa'

export const VIGENCIA_WIFI_MS = 10000

export function telemetriaWifi(lectura: { telemetria?: string | null; pantalla?: string | null }): Telemetria | null {
  if (!lectura.telemetria) return null
  let t: Telemetria
  try { t = parsearTelemetria(lectura.telemetria) } catch { return null }
  t.pantalla = null
  if (lectura.pantalla) {
    try { t.pantalla = parsearPantalla(lectura.pantalla) } catch { /* firmware sin pantalla valida */ }
  }
  return t
}

export function wifiVigente(fecha: string | null, ahora: number): boolean {
  if (!fecha) return false
  const instante = Date.parse(fecha)
  return Number.isFinite(instante) && Math.abs(ahora - instante) <= VIGENCIA_WIFI_MS
}
