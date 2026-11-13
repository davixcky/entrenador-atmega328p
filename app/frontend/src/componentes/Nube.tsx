// Tablero de la actividad 15.3 (en lugar de Arduino Cloud): el ADC que el entrenador
// manda por el ESP32 y VALOR1 (0..100) que vuelve al entrenador como brillo del LED.
// Ademas controla el entrenador desde la nube: LEDs (canal 2), displays (canal 3) y el
// texto del LCD (lcd1/lcd2), con el ejemplo "Control desde la nube".
// Lee y escribe en Supabase (backend/nube.ts); funciona aunque la placa no este conectada.
import { useEffect, useRef, useState } from 'react'
import type { EstadoConexion } from '../backend'
import {
  configGuardada,
  escucharNube,
  fijarEntrada,
  fijarLcd,
  leerLcd,
  type FilaLcd,
  textoLcd,
  MAX_TEXTO_LCD,
  guardarConfig,
  leerEntradas,
  ultimasLecturas,
  configPara,
  URL_ALOJADO,
  URL_LOCAL,
  type ConfigNube,
  type Lectura,
} from '../backend/nube'

interface Props {
  conexion: EstadoConexion
  onCerrar: () => void
}

const MAX_PUNTOS = 120

function Grafica({ lecturas }: { lecturas: Lectura[] }) {
  const ancho = 600
  const alto = 160
  if (lecturas.length < 2) return <div className="grafica-vacia">Esperando lecturas del ESP32...</div>
  const x = (i: number) => (i / (lecturas.length - 1)) * ancho
  const y = (v: number) => alto - (Math.max(0, Math.min(1023, v)) / 1023) * alto
  const adc = lecturas.map((l, i) => `${x(i).toFixed(1)},${y(l.salidas[0]).toFixed(1)}`).join(' ')
  // VALOR1 (0..100) en la misma escala que el ADC, para ver los dos juntos
  const valor1 = lecturas.map((l, i) => `${x(i).toFixed(1)},${y(l.entradas[0] * 10.23).toFixed(1)}`).join(' ')
  return (
    <svg className="grafica" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" role="img" aria-label="ADC y VALOR1 en el tiempo">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={ancho} y1={alto * f} y2={alto * f} className="grafica-rejilla" />
      ))}
      <polyline points={valor1} className="grafica-valor1" />
      <polyline points={adc} className="grafica-adc" />
    </svg>
  )
}

export function Nube({ conexion, onCerrar }: Props) {
  const [config, setConfig] = useState<ConfigNube>(configGuardada)
  const [borrador, setBorrador] = useState<ConfigNube>(config)
  const [lecturas, setLecturas] = useState<Lectura[]>([])
  const [valor1, setValor1] = useState<number | null>(null)
  const [entradas, setEntradas] = useState<number[] | null>(null)
  const [filas, setFilas] = useState<[FilaLcd, FilaLcd]>([
    { texto: '', desplazar: true, pasoMs: 400 },
    { texto: '', desplazar: true, pasoMs: 400 },
  ])
  const [enviado, setEnviado] = useState<string | null>(null)
  const [enVivo, setEnVivo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ahora, setAhora] = useState(Date.now())
  const envio = useRef<ReturnType<typeof setTimeout> | null>(null)
  const arrastrando = useRef(false)

  useEffect(() => {
    if (!config.llave) {
      setError('Falta la clave de Supabase: escríbela en "Conexión" (o en nube/.env.local).')
      return
    }
    setError(null)
    let vivo = true
    ultimasLecturas(config, MAX_PUNTOS).then((l) => vivo && setLecturas(l), (e) => vivo && setError(String(e.message ?? e)))
    leerEntradas(config).then(
      (e) => {
        if (!vivo) return
        setValor1(e[0])
        setEntradas(e)
      },
      (e) => vivo && setError(String(e.message ?? e)),
    )
    leerLcd(config).then((t) => vivo && setFilas(t), (e) => vivo && setError(String(e.message ?? e)))
    const dejar = escucharNube(
      config,
      (l) => setLecturas((ls) => [...ls.slice(-(MAX_PUNTOS - 1)), l]),
      (entradas) => {
        if (!arrastrando.current) setValor1(entradas[0])
        setEntradas(entradas)
      },
      setEnVivo,
    )
    const reloj = setInterval(() => setAhora(Date.now()), 1000)
    return () => {
      vivo = false
      dejar()
      clearInterval(reloj)
    }
  }, [config])

  // Envia VALOR1 un momento despues de soltar o mover el control, sin saturar la nube
  const cambiarValor1 = (v: number) => {
    setValor1(v)
    if (envio.current) clearTimeout(envio.current)
    envio.current = setTimeout(() => {
      fijarEntrada(config, 1, v).catch((e) => setError(String(e.message ?? e)))
    }, 250)
  }

  // LEDs (canal 2, un bit por LED) y displays (canal 3)
  const fijarCanal = (n: number, v: number) => {
    setEntradas((e) => (e ? e.map((x, i) => (i === n - 1 ? v : x)) : e))
    fijarEntrada(config, n, v).catch((e) => setError(String(e.message ?? e)))
  }
  const leds = entradas?.[1] ?? 0
  const enviarTextos = () =>
    Promise.all([fijarLcd(config, 0, filas[0]), fijarLcd(config, 1, filas[1])]).then(
      () => setEnviado('Texto y desplazamiento guardados en la nube: el ESP32 lo lleva al entrenador en el próximo ciclo.'),
      (e) => setError(String(e.message ?? e)),
    )

  const cambiarFila = (fila: number, cambio: Partial<FilaLcd>) => {
    setFilas((fs) => fila === 0 ? [{ ...fs[0], ...cambio }, fs[1]] : [fs[0], { ...fs[1], ...cambio }])
    setEnviado(null)
  }

  const ultima = lecturas.at(-1)
  const edad = ultima ? Math.round((ahora - new Date(ultima.creado_en).getTime()) / 1000) : null

  return (
    <div className="modal-fondo" role="presentation" onClick={onCerrar}>
      <div className="modal modal-ancho" role="dialog" aria-modal="true" aria-labelledby="titulo-nube" onClick={(e) => e.stopPropagation()}>
        <header className="panel-titulo">
          <h2 id="titulo-nube">Nube</h2>
          <span className={enVivo ? 'chip chip-ok' : 'chip'}>{enVivo ? 'En vivo' : 'Sin conexión en vivo'}</span>
          <button type="button" className="boton-icono" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        {error && (
          <div className="aviso aviso-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        <div className="tablero">
          <div className="tablero-dato">
            <span>ADC (pot del entrenador)</span>
            <strong className="mono">{ultima ? ultima.salidas[0] : '—'}</strong>
            <small>{edad === null ? 'sin lecturas' : edad <= 1 ? 'ahora' : `hace ${edad} s`}</small>
          </div>
          <div className="tablero-dato">
            <span>VALOR1 · brillo de los 8 LEDs</span>
            <strong className="mono">{valor1 ?? '—'}</strong>
            <input
              type="range"
              min={0}
              max={100}
              value={valor1 ?? 0}
              disabled={valor1 === null}
              onPointerDown={() => (arrastrando.current = true)}
              onPointerUp={() => (arrastrando.current = false)}
              onChange={(e) => cambiarValor1(Number(e.target.value))}
              aria-label="VALOR1"
            />
            <small>0–100 %. El programa debe llamar brillo(nube(1)).</small>
          </div>
        </div>

        <Grafica lecturas={lecturas} />
        <p className="nota">
          <span className="leyenda-adc">ADC (0–1023)</span> · <span className="leyenda-valor1">VALOR1 (0–100, misma escala)</span>.{' '}
          {conexion.conectado
            ? 'La placa está conectada a la app; el ESP32 sigue subiendo lecturas por Wi-Fi.'
            : 'No hace falta conectar la placa: el ESP32 habla con la nube por Wi-Fi.'}
        </p>

        <h3>Controlar el entrenador</h3>
        <p className="nota">
          Corre en la placa el ejemplo <strong>Control desde la nube</strong> (o usa <span className="mono">nube(2)</span>,{' '}
          <span className="mono">nube(3)</span> y <span className="mono">lcd_nube(fila)</span> en tu programa).
        </p>
        <div className="tablero">
          <div className="tablero-dato">
            <span>LEDs (canal 2)</span>
            <div className="nube-leds" role="group" aria-label="LEDs desde la nube">
              {[7, 6, 5, 4, 3, 2, 1, 0].map((b) => (
                <button
                  key={b}
                  type="button"
                  className={leds & (1 << b) ? 'nube-led nube-led-on' : 'nube-led'}
                  disabled={!entradas}
                  onClick={() => fijarCanal(2, leds ^ (1 << b))}
                  aria-pressed={!!(leds & (1 << b))}
                  title={`LED ${b}`}
                >
                  {b}
                </button>
              ))}
            </div>
            <small className="mono">{leds}</small>
          </div>
          <div className="tablero-dato">
            <span>Displays (canal 3)</span>
            <input
              type="number"
              min={0}
              max={99}
              value={entradas?.[2] ?? 0}
              disabled={!entradas}
              onChange={(e) => fijarCanal(3, Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
              aria-label="Número de los displays"
            />
          </div>
        </div>
        <div className="formulario">
          {[0, 1].map((f) => (
            <div key={f} className="campo">
              <label htmlFor={`lcd-texto-${f}`}>LCD fila {f} · {filas[f].texto.length}/{MAX_TEXTO_LCD}</label>
              <textarea
                id={`lcd-texto-${f}`}
                className="mono"
                rows={3}
                maxLength={MAX_TEXTO_LCD}
                value={filas[f].texto}
                onChange={(e) => cambiarFila(f, { texto: textoLcd(e.target.value) })}
              />
              <label className="lcd-desplazar">
                <input type="checkbox" checked={filas[f].desplazar} onChange={(e) => cambiarFila(f, { desplazar: e.target.checked })} />
                Desplazamiento automático · fila {f}
              </label>
              <label htmlFor={`lcd-velocidad-${f}`}>Velocidad · fila {f}</label>
              <select id={`lcd-velocidad-${f}`} value={filas[f].pasoMs} disabled={!filas[f].desplazar} onChange={(e) => cambiarFila(f, { pasoMs: Number(e.target.value) })}>
                <option value={800}>Lenta</option>
                <option value={400}>Normal</option>
                <option value={200}>Rápida</option>
              </select>
            </div>
          ))}
        </div>
        <p className="nota">El desplazamiento mueve los mensajes de más de 16 caracteres. Desactivado, muestra los primeros 16. Las tildes se convierten a letras simples.</p>
        <button type="button" className="primario" onClick={enviarTextos}>
          Aplicar al LCD
        </button>
        {enviado && <p className="chip chip-ok">{enviado}</p>}

        <details>
          <summary>Conexión</summary>
          <p className="nota">
            Supabase local (Docker en esta PC) o el proyecto alojado. La clave anon de cada URL se recuerda: se pega una sola
            vez. Para el ESP32 se usa la misma (Firmware → Wi-Fi y nube).
          </p>
          <div className="selector-nube">
            <button type="button" onClick={() => setBorrador(configPara(borrador, URL_LOCAL))} aria-pressed={borrador.url === URL_LOCAL}>
              Local (Docker)
            </button>
            <button
              type="button"
              onClick={() => setBorrador(configPara(borrador, URL_ALOJADO))}
              disabled={!URL_ALOJADO}
              aria-pressed={!!URL_ALOJADO && borrador.url === URL_ALOJADO}
              title={URL_ALOJADO || 'Falta VITE_SUPABASE_URL_ALOJADO en nube/.env.local'}
            >
              Alojado
            </button>
          </div>
          {!borrador.llave && <p className="chip chip-error">Pega la clave anon / publishable de este proyecto.</p>}
          <div className="formulario">
            <label className="campo">
              <span>URL de Supabase</span>
              <input value={borrador.url} onChange={(e) => setBorrador({ ...borrador, url: e.target.value })} />
            </label>
            <label className="campo">
              <span>Clave anon / publishable</span>
              <input value={borrador.llave} onChange={(e) => setBorrador({ ...borrador, llave: e.target.value })} />
            </label>
            <label className="campo">
              <span>Dispositivo</span>
              <input value={borrador.dispositivo} onChange={(e) => setBorrador({ ...borrador, dispositivo: e.target.value })} />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              guardarConfig(borrador)
              setConfig(borrador)
              setLecturas([])
            }}
          >
            Guardar y reconectar
          </button>
        </details>
      </div>
    </div>
  )
}
