// Vista en vivo del entrenador y control manual de LEDs y displays.
import { useState } from 'react'
import { Display7, segmentosDe } from './Display7'

export interface Telemetria {
  pot: number
  dip: number
  leds: number
  numero: number | null
  corriendo: boolean
  error: number
}

const ERRORES = ['', 'pila llena', 'pila vacía', 'instrucción inválida', 'salto fuera del programa', 'variable inválida']

interface Props {
  t: Telemetria | null
  habilitado: boolean
  onLeds: (valor: number) => void
  onNumero: (valor: number | null) => void
}

export function Placa({ t, habilitado, onLeds, onNumero }: Props) {
  const [numeroManual, setNumeroManual] = useState('42')
  const [decenas, unidades] = segmentosDe(t?.numero ?? null)
  const leds = t?.leds ?? 0
  const pot = t?.pot ?? 0

  let estado = 'Sin datos'
  let claseEstado = 'chip'
  if (t) {
    if (t.error) {
      estado = 'Error: ' + (ERRORES[t.error] ?? `código ${t.error}`)
      claseEstado = 'chip chip-error'
    } else if (t.corriendo) {
      estado = 'Programa corriendo'
      claseEstado = 'chip chip-ok'
    } else {
      estado = 'Programa detenido'
    }
  }

  const mostrar = () => {
    const n = parseInt(numeroManual, 10)
    if (!Number.isNaN(n)) onNumero(n)
  }

  return (
    <section className="panel placa" aria-label="Entrenador">
      <header className="panel-titulo">
        <h2>Entrenador</h2>
        <span className={claseEstado}>{estado}</span>
      </header>

      <div className="placa-salidas">
        <div className="leds" role="group" aria-label="LEDs (clic para cambiar)">
          {[7, 6, 5, 4, 3, 2, 1, 0].map((i) => {
            const on = (leds >> i) & 1
            return (
              <button
                key={i}
                type="button"
                className={on ? 'led on' : 'led'}
                disabled={!habilitado}
                onClick={() => onLeds(leds ^ (1 << i))}
                title={`LED${i}: ${on ? 'encendido' : 'apagado'}`}
              >
                <span className="led-luz" />
                <span className="led-nombre">{i}</span>
              </button>
            )
          })}
        </div>
        <div className="displays">
          <Display7 segmentos={decenas} titulo="Decenas" />
          <Display7 segmentos={unidades} titulo="Unidades" />
        </div>
      </div>

      <div className="medidor">
        <div className="medidor-cabecera">
          <span>Potenciómetro (A0)</span>
          <span className="mono">
            {pot} · {Math.floor((pot * 25) / 256)}
          </span>
        </div>
        <div className="barra" aria-hidden>
          <div className="barra-relleno" style={{ width: `${(pot / 1023) * 100}%` }} />
        </div>
      </div>

      <div className="dip" aria-label="DIP switch">
        {[0, 1, 2, 3].map((i) => {
          const cerrado = t ? (t.dip >> i) & 1 : 0
          return (
            <div key={i} className={cerrado ? 'interruptor on' : 'interruptor'}>
              <span className="interruptor-palanca" />
              <span>SW{i + 1}</span>
            </div>
          )
        })}
        <span className="mono dip-valor">= {t?.dip ?? 0}</span>
      </div>

      <div className="manual">
        <label htmlFor="numero-manual">Displays</label>
        <input
          id="numero-manual"
          type="number"
          min={0}
          max={99}
          value={numeroManual}
          onChange={(e) => setNumeroManual(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && mostrar()}
          disabled={!habilitado}
        />
        <button type="button" onClick={mostrar} disabled={!habilitado}>
          Mostrar
        </button>
        <button type="button" onClick={() => onNumero(null)} disabled={!habilitado}>
          Apagar
        </button>
        <button type="button" onClick={() => onLeds(leds ? 0 : 255)} disabled={!habilitado}>
          {leds ? 'Apagar LEDs' : 'Encender LEDs'}
        </button>
      </div>
      {t?.corriendo && <p className="nota">El programa en marcha puede sobrescribir lo que cambies a mano.</p>}
    </section>
  )
}
