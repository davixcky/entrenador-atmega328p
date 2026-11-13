// Vista en vivo del entrenador y control manual de LEDs y displays.
import { useState } from 'react'
import type React from 'react'
import { Display7, segmentosDe } from './Display7'

export interface Pantalla {
  lcd: number // 0 = el programa no usa el LCD, 1 = conectado, 2 = sin respuesta por I2C
  brillo: number // 0..100, brillo de los LEDs
  lineas: [string, string]
  luz?: number // 1 luz de fondo encendida (falta en bloques 2.0)
  cursor?: number // 0 sin cursor, 1 raya, 2 parpadeo
}

export interface Telemetria {
  pot: number
  dip: number
  leds: number
  numero: number | null
  corriendo: boolean
  error: number
  // Firmware bloques 2 (comando P); falta con el firmware 1
  pantalla?: Pantalla | null
}

const ERRORES = ['', 'pila llena', 'pila vacía', 'instrucción inválida', 'salto fuera del programa', 'variable inválida']

interface Props {
  t: Telemetria | null
  habilitado: boolean
  onLeds: (valor: number) => void
  onNumero: (valor: number | null) => void
}

const LCD_VACIO: [string, string] = ['', '']

// LCD 16x2: lo que el programa escribio (el firmware guarda una copia aunque no haya LCD).
// Siempre se ve, como los displays; en blanco hasta que llegan datos.
function Lcd({ pantalla }: { pantalla: Pantalla | null }) {
  const estado = !pantalla
    ? { clase: 'chip', texto: 'Sin datos (firmware bloques 2)' }
    : pantalla.lcd === 0
      ? { clase: 'chip', texto: 'El programa no usa el LCD' }
      : pantalla.lcd === 1
        ? { clase: 'chip chip-ok', texto: 'LCD conectado' }
        : { clase: 'chip chip-error', texto: 'Sin respuesta: revisa SDA/SCL y deja DIP4 abierto' }
  const lineas = pantalla?.lineas ?? LCD_VACIO
  const sinLuz = pantalla?.luz === 0
  const cursor = ['', 'cursor: raya', 'cursor: parpadeo'][pantalla?.cursor ?? 0] ?? ''
  const clases = ['lcd', !pantalla || pantalla.lcd === 0 ? 'lcd-apagado' : '', sinLuz ? 'lcd-sin-luz' : ''].filter(Boolean).join(' ')
  return (
    <div className="lcd-bloque">
      <div className="lcd-cabecera">
        <span>
          LCD 16x2 (I2C){sinLuz && ' · luz apagada'}
          {cursor && ` · ${cursor}`}
        </span>
        <span className={estado.clase}>{estado.texto}</span>
      </div>
      <div className={clases} role="img" aria-label={`LCD: ${lineas[0].trimEnd()} / ${lineas[1].trimEnd()}`}>
        {lineas.map((l, f) => (
          <div key={f} className="lcd-fila">
            {[...l.padEnd(16).slice(0, 16)].map((c, i) => (
              <span key={i} className="lcd-celda">
                {c === ' ' ? ' ' : c}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Placa({ t, habilitado, onLeds, onNumero }: Props) {
  const [numeroManual, setNumeroManual] = useState('42')
  const [decenas, unidades] = segmentosDe(t?.numero ?? null)
  const leds = t?.leds ?? 0
  const pot = t?.pot ?? 0
  const pantalla = t?.pantalla ?? null
  const brillo = pantalla?.brillo ?? 100

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
        <div
          className="leds"
          role="group"
          aria-label="LEDs (clic para cambiar)"
          style={{ '--brillo': brillo === 0 ? 0 : 0.2 + (0.8 * brillo) / 100 } as React.CSSProperties}
          title={brillo < 100 ? `Brillo ${brillo} %` : undefined}
        >
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

      <Lcd pantalla={pantalla} />
      {brillo < 100 && (
        <p className="nota">
          Brillo de los LEDs: <span className="mono">{brillo} %</span>
        </p>
      )}

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
