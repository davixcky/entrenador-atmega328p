// Dialogo de firmware. Con el ESP32 (INTEGRADOR.md), que solo hace de puente serie:
// grabar el ESP32 (solo en el navegador) y configurar su Wi-Fi y la nube. El firmware
// "bloques" del entrenador se graba con el Uno como ISP (solo escritorio, avrdude).
import { useEffect, useState } from 'react'
import { backend, type EstadoConexion } from '../backend'
import { activarNube, configurarEsp32, estadoEsp32, grabarEsp32, urlImagenEsp32, type EstadoEsp32 } from '../backend/esp32'
import { configGuardada } from '../backend/nube'
import { guardarRed, redGuardada } from '../configuracion'

interface Props {
  puerto: string
  conexion: EstadoConexion
  onCerrar: () => void
  onGrabado: () => void
  onRegistro: (linea: string) => void
}

type Resultado = { ok: boolean; texto: string } | null

export function Firmware({ puerto, conexion, onCerrar, onGrabado, onRegistro }: Props) {
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<Resultado>(null)
  const [avance, setAvance] = useState<{ texto: string; fraccion: number } | null>(null)
  const [estado, setEstado] = useState<EstadoEsp32 | null>(null)
  const nube = configGuardada()
  const [conf, setConf] = useState({ ssid: redGuardada(), clave: '', url: nube.url, llave: nube.llave, dispositivo: nube.dispositivo })
  const comando = backend.comandoPuente.bind(backend)
  const conectado = conexion.conectado

  const tarea = async (f: () => Promise<string>) => {
    setOcupado(true)
    setResultado(null)
    try {
      setResultado({ ok: true, texto: await f() })
    } catch (e) {
      setResultado({ ok: false, texto: String(e instanceof Error ? e.message : e) })
    } finally {
      setOcupado(false)
      setAvance(null)
    }
  }

  const leerEstado = () =>
    tarea(async () => {
      const e = await estadoEsp32(comando)
      setEstado(e)
      return 'ESP32 respondió.'
    })

  useEffect(() => {
    if (conectado) estadoEsp32(comando).then(setEstado).catch(() => setEstado(null))
  }, [conectado]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardarConf = () =>
    tarea(async () => {
      await configurarEsp32(comando, conf)
      if (conf.ssid) guardarRed(conf.ssid)
      await activarNube(comando, true)
      setEstado(await estadoEsp32(comando))
      return 'Configuración guardada en el ESP32. El Wi-Fi tarda unos segundos en conectar: pulsa "Leer estado".'
    })

  const grabarPuente = () =>
    tarea(async () => {
      const serie = backend.puertoSerie?.(puerto)
      if (!serie) throw new Error('Elige el puerto del ESP32 en la barra superior.')
      await backend.desconectar()
      onGrabado()
      await grabarEsp32(serie, (f) => setAvance({ texto: 'Grabando el ESP32', fraccion: f }), onRegistro)
      return 'Firmware del ESP32 grabado. Conecta de nuevo desde la barra superior.'
    })

  const avrdude = backend.avrdude
  const [rutaAvrdude, setRutaAvrdude] = useState('')
  useEffect(() => {
    avrdude?.ruta().then(setRutaAvrdude, (e) => setRutaAvrdude(String(e)))
  }, [avrdude])

  const grabarConUno = (que: 'puente' | 'entrenador') =>
    tarea(async () => {
      const salida = que === 'puente' ? await avrdude!.grabarPuente(puerto) : await avrdude!.grabarEntrenador(puerto)
      onRegistro(salida.trim().split('\n').slice(-1)[0] ?? '')
      onGrabado()
      return que === 'puente' ? 'Puente instalado en el Uno.' : 'Firmware grabado en el entrenador.'
    })

  const campo = (clave: keyof typeof conf, etiqueta: string, tipo = 'text') => (
    <label className="campo">
      <span>{etiqueta}</span>
      <input type={tipo} value={conf[clave]} onChange={(e) => setConf({ ...conf, [clave]: e.target.value })} disabled={ocupado} />
    </label>
  )

  return (
    <div className="modal-fondo" role="presentation" onClick={() => !ocupado && onCerrar()}>
      <div className="modal modal-ancho" role="dialog" aria-modal="true" aria-labelledby="titulo-firmware" onClick={(e) => e.stopPropagation()}>
        <header className="panel-titulo">
          <h2 id="titulo-firmware">Firmware</h2>
          <button type="button" className="boton-icono" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar">
            ×
          </button>
        </header>

        <p>
          Puerto: <span className="mono">{puerto || 'ninguno seleccionado'}</span>
          {estado && (
            <>
              {' · '}ESP32: Wi-Fi <strong>{estado.wifi}</strong> ({estado.ip}), nube <strong>{estado.nube}</strong>, dispositivo{' '}
              <span className="mono">{estado.dispositivo}</span>
              {estado.detalle !== '-' && (
                <>
                  {' · '}falla: <span className="mono">{estado.detalle}</span>
                </>
              )}
            </>
          )}
        </p>

        <h3>Con el ESP32</h3>
        <ol className="pasos">
          {backend.puertoSerie && (
            <li>
              <strong>Grabar el ESP32</strong> con el firmware puente (una sola vez). Se graba por su USB; la app se desconecta.
              <button type="button" onClick={grabarPuente} disabled={ocupado || !puerto || !urlImagenEsp32}>
                Grabar ESP32
              </button>
              {!urlImagenEsp32 && <span className="nota"> Falta compilar firmware/esp32-puente.</span>}
            </li>
          )}
          <li>
            <strong>Wi-Fi y nube del ESP32</strong> (red de 2.4 GHz). Con Supabase local, la URL lleva la IP del PC, no
            127.0.0.1. La clave queda guardada en el ESP32. URL, clave anon y dispositivo vienen de Nube → Conexión. Un campo
            vacío no cambia lo que ya tiene el ESP32 (por ejemplo, para pasar a la nube alojada sin volver a escribir la
            clave del Wi-Fi).
            <div className="formulario">
              {campo('ssid', 'Red Wi-Fi')}
              {campo('clave', 'Clave Wi-Fi', 'password')}
              {campo('url', 'URL de Supabase')}
              {campo('llave', 'Clave anon / publishable')}
              {campo('dispositivo', 'Dispositivo')}
            </div>
            <button type="button" onClick={guardarConf} disabled={ocupado || !conectado}>
              Guardar en el ESP32
            </button>
            <button type="button" onClick={leerEstado} disabled={ocupado || !conectado}>
              Leer estado
            </button>
          </li>
          <li>
            <strong>Firmware “bloques” del entrenador</strong>: el ESP32 no lo graba. Se graba una vez con el Arduino
            Uno como ISP (J3) desde la app de escritorio, en <em>Con el Arduino Uno</em>.
          </li>
          <li>
            <strong>Cables</strong> (ver INTEGRADOR.md): solo serie y tierra; el ESP32 no tolera 5 V en sus entradas.
            <table className="tabla">
              <tbody>
                <tr><td>ESP32 GPIO17 (TX2)</td><td>→</td><td>ATmega pin 2 (RX)</td></tr>
                <tr><td>ESP32 GPIO16 (RX2)</td><td>←</td><td>ATmega pin 3 (TX), con divisor 1k/2k</td></tr>
                <tr><td>ESP32 GND</td><td>—</td><td>GND del entrenador</td></tr>
              </tbody>
            </table>
          </li>
        </ol>

        {avrdude && (
          <details>
            <summary>Con el Arduino Uno (grabar el entrenador)</summary>
            <p>
              avrdude: <span className="mono">{rutaAvrdude || 'buscando...'}</span>
            </p>
            <ol className="pasos">
              <li>
                <strong>Instalar el puente en el Uno</strong> (una sola vez).
                <button type="button" onClick={() => grabarConUno('puente')} disabled={ocupado || !puerto}>
                  Grabar puente en el Uno
                </button>
              </li>
              <li>
                <strong>Grabar el firmware “bloques”</strong> por ISP (D10–D13 del Uno).
                <button type="button" onClick={() => grabarConUno('entrenador')} disabled={ocupado || !puerto}>
                  Grabar firmware en el entrenador
                </button>
              </li>
              <li>
                Serie: Uno D2 ← ATmega pin 3 (TX), Uno D3 → ATmega pin 2 (RX), GND común.
              </li>
            </ol>
          </details>
        )}

        {avance && (
          <p>
            {avance.texto}: <progress value={avance.fraccion} max={1} /> {Math.round(avance.fraccion * 100)} %
          </p>
        )}
        {ocupado && !avance && <p className="chip">Trabajando... no desconectes la placa.</p>}
        {resultado && <p className={resultado.ok ? 'chip chip-ok' : 'chip chip-error'}>{resultado.texto}</p>}
      </div>
    </div>
  )
}
