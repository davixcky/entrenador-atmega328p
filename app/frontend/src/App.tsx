import { useCallback, useEffect, useRef, useState } from 'react'
import { backend, type EstadoConexion, type Puerto } from './backend'
import { configGuardada, ejecutarPorWifi } from './backend/nube'
import { ejemplos, lineaColumna, PROG_MAX } from '@entrenador/lenguaje'
import { useProyecto } from './proyecto'
import { useAjustes, usaLcd } from './ajustes'
import { Ajustes } from './componentes/Ajustes'
import { Diagrama } from './componentes/Diagrama'
import { EditorCodigo } from './componentes/EditorCodigo'
import { Firmware } from './componentes/Firmware'
import { Generado } from './componentes/Generado'
import { Nube } from './componentes/Nube'
import { Placa, Telemetria } from './componentes/Placa'
import { useTelemetriaWifi } from './useTelemetriaWifi'

const MAX_REGISTRO = 200

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null
type Vista = 'diagrama' | 'codigo' | 'ambos'

const VISTAS: { valor: Vista; nombre: string }[] = [
  { valor: 'diagrama', nombre: 'Diagrama' },
  { valor: 'codigo', nombre: 'Código' },
  { valor: 'ambos', nombre: 'Ambos' },
]

function vistaGuardada(): Vista {
  try {
    const v = localStorage.getItem('entrenador.vista')
    if (v === 'diagrama' || v === 'codigo' || v === 'ambos') return v
  } catch {
    // sin almacenamiento
  }
  return 'diagrama'
}

function generadoGuardado() {
  try {
    return localStorage.getItem('entrenador.verGenerado') === '1'
  } catch {
    return false
  }
}

export default function App() {
  const [puertos, setPuertos] = useState<Puerto[]>([])
  const [puerto, setPuerto] = useState('')
  const [conexion, setConexion] = useState<EstadoConexion>({ conectado: false })
  const [conectando, setConectando] = useState(false)
  const [envioWifi, setEnvioWifi] = useState<string | null>(null)
  const [telemetria, setTelemetria] = useState<Telemetria | null>(null)
  const wifi = useTelemetriaWifi()
  const [registro, setRegistro] = useState<string[]>([])
  const [aviso, setAviso] = useState<Aviso>(null)
  const [vista, setVista] = useState<Vista>(vistaGuardada)
  const [verFirmware, setVerFirmware] = useState(false)
  // .../app/#nube abre directo el tablero (para mostrarlo en el celular)
  const [verNube, setVerNube] = useState(() => window.location.hash === '#nube')
  const [verGenerado, setVerGenerado] = useState(generadoGuardado)
  const { ajustes, cambiar: cambiarAjustes } = useAjustes()
  const [verAjustes, setVerAjustes] = useState(false)
  const proyecto = useProyecto(ajustes)
  const { resultado } = proyecto
  const finRegistro = useRef<HTMLDivElement>(null)

  const anotar = useCallback((linea: string) => {
    const hora = new Date().toLocaleTimeString()
    setRegistro((r) => [...r.slice(-(MAX_REGISTRO - 1)), `${hora}  ${linea}`])
  }, [])

  const fallo = useCallback(
    (e: unknown) => {
      const texto = String(e)
      setAviso({ tipo: 'error', texto })
      anotar('Error: ' + texto)
    },
    [anotar],
  )

  const refrescarPuertos = useCallback(async () => {
    try {
      const lista = await backend.listarPuertos()
      setPuertos(lista)
      setPuerto((actual) => {
        if (lista.some((p) => p.nombre === actual)) return actual
        return (lista.find((p) => p.esArduino) ?? lista[0])?.nombre ?? ''
      })
    } catch (e) {
      fallo(e)
    }
  }, [fallo])

  useEffect(() => {
    refrescarPuertos()
    return backend.escuchar({
      telemetria: (t: Telemetria) => setTelemetria(t),
      registro: (linea: string) => anotar(linea),
      conexion: (e: EstadoConexion) => {
        setConexion(e)
        if (!e.conectado) setTelemetria(null)
      },
    })
  }, [refrescarPuertos, anotar])

  useEffect(() => {
    finRegistro.current?.scrollIntoView({ block: 'end' })
  }, [registro])

  const conectar = async () => {
    if (!puerto) return
    setConectando(true)
    setAviso(null)
    try {
      const estado = await backend.conectar(puerto)
      setConexion(estado)
      if (estado.mensaje) setAviso({ tipo: 'error', texto: estado.mensaje })
    } catch (e) {
      fallo(e)
    } finally {
      setConectando(false)
    }
  }

  const desconectar = async () => {
    await backend.desconectar()
    setConexion({ conectado: false })
    setTelemetria(null)
  }

  // En el navegador hay que dar permiso a cada puerto la primera vez
  const pedirPuerto = async () => {
    const p = await backend.pedirPuerto?.()
    if (!p) return
    await refrescarPuertos()
    setPuerto(p.nombre)
  }

  const elegirVista = (v: Vista) => {
    setVista(v)
    try {
      localStorage.setItem('entrenador.vista', v)
    } catch {
      // sin almacenamiento
    }
  }

  const alternarGenerado = () => {
    setVerGenerado((v) => {
      try {
        localStorage.setItem('entrenador.verGenerado', v ? '0' : '1')
      } catch {
        // sin almacenamiento
      }
      return !v
    })
  }

  const formatear = () => {
    if (!proyecto.formatearCodigo()) setAviso({ tipo: 'error', texto: 'Corrige los errores antes de formatear.' })
  }

  // Texto del error del programa, con linea y columna si viene del codigo
  const textoError = (() => {
    const e = resultado.error
    if (!e) return null
    if (e.origen) return `Diagrama: ${e.message}`
    if (e.rango && proyecto.editado === 'codigo') {
      const { linea, columna } = lineaColumna(proyecto.codigo, e.rango.desde)
      return `Línea ${linea}, columna ${columna}: ${e.message}`
    }
    return e.message
  })()

  const ejecutar = async (guardar: boolean) => {
    const bytes = resultado.bytes
    if (!bytes || envioWifi) return
    try {
      await backend.cargarPrograma(bytes, guardar)
      setAviso({
        tipo: 'ok',
        texto: guardar ? `Programa guardado en la placa (${bytes.length} bytes): corre al encender.` : `Programa en marcha (${bytes.length} bytes).`,
      })
    } catch (e) {
      fallo(e)
    }
  }

  const accion = (f: () => Promise<void>, ok?: string) => async () => {
    try {
      await f()
      if (ok) setAviso({ tipo: 'ok', texto: ok })
    } catch (e) {
      fallo(e)
    }
  }

  const ejecutarWifi = async () => {
    if (!resultado.bytes || envioWifi) return
    const bytes = [...resultado.bytes]
    setEnvioWifi('Enviando por Wi-Fi…')
    setAviso(null)
    try {
      await ejecutarPorWifi(configGuardada(), bytes, (estado) => { setEnvioWifi(estado); anotar(estado) })
      const texto = `Programa en marcha por Wi-Fi (${bytes.length} bytes).`
      setAviso({ tipo: 'ok', texto })
      anotar(texto)
    } catch (e) {
      fallo(e)
    } finally {
      setEnvioWifi(null)
    }
  }

  const cargarEjemplo = (indice: string) => {
    const ejemplo = ejemplos[Number(indice)]
    if (!ejemplo) return
    if (!window.confirm(`¿Reemplazar el programa actual por "${ejemplo.nombre}"?`)) return
    proyecto.cargarCodigo(ejemplo.codigo)
  }

  const listo = conexion.conectado && !!conexion.entrenador
  const porUsb = listo && !!telemetria
  const monitor = porUsb ? telemetria : wifi.t
  const fuente = porUsb ? 'USB · en vivo' : wifi.vigente ? 'Wi-Fi · en vivo'
    : wifi.configurada ? (wifi.fecha ? 'Wi-Fi · sin datos recientes' : 'Wi-Fi · esperando datos')
    : 'Configura Nube o conecta el USB para ver la placa.'

  return (
    <div className="app">
      <header className="barra-superior">
        <h1>
          Entrenador <span>ATmega328P</span>
        </h1>
        <div className="conexion">
          <select
            value={puerto}
            onChange={(e) => setPuerto(e.target.value)}
            disabled={conexion.conectado || conectando}
            aria-label="Puerto serie"
          >
            {puertos.length === 0 && <option value="">Sin puertos</option>}
            {puertos.map((p) => (
              <option key={p.nombre} value={p.nombre}>
                {p.nombre}
                {p.descripcion ? ` — ${p.descripcion}` : ''}
              </option>
            ))}
          </select>
          {backend.pedirPuerto ? (
            <button type="button" onClick={pedirPuerto} disabled={conexion.conectado} title="Dar permiso al navegador para un puerto USB">
              Elegir puerto...
            </button>
          ) : (
            <button type="button" className="boton-icono" onClick={refrescarPuertos} disabled={conexion.conectado} title="Buscar puertos" aria-label="Buscar puertos">
              ⟳
            </button>
          )}
          {conexion.conectado ? (
            <button type="button" onClick={desconectar}>
              Desconectar
            </button>
          ) : (
            <button type="button" className="primario" onClick={conectar} disabled={!puerto || conectando}>
              {conectando ? 'Conectando...' : 'Conectar'}
            </button>
          )}
          <span className={conexion.conectado ? 'chip chip-ok' : 'chip'}>Puente USB</span>
          <span className={listo ? 'chip chip-ok' : conexion.conectado ? 'chip chip-error' : 'chip'}>Entrenador USB</span>
          {wifi.configurada && <span className={wifi.vigente ? 'chip chip-ok' : 'chip'} title={fuente}>Wi-Fi</span>}
          <button type="button" onClick={() => setVerAjustes(true)} title="Luz y cursor del LCD, brillo de los LEDs: se agregan solos al programa">
            Ajustes
          </button>
          <button type="button" onClick={() => setVerFirmware(true)}>
            Firmware
          </button>
          <button type="button" onClick={() => setVerNube(true)} title="Tablero de la nube (Supabase): ADC y VALOR1">
            Nube
          </button>
        </div>
      </header>

      <main className="cuerpo">
        <section className="area-programa">
          <div className="barra-programa">
            <button type="button" className="primario" onClick={() => ejecutar(false)} disabled={!listo || !resultado.bytes || !!envioWifi}>
              ▶ Ejecutar
            </button>
            <button type="button" onClick={ejecutarWifi} disabled={!resultado.bytes || !!envioWifi} title="Envía y ejecuta el programa usando la conexión de Nube, sin USB">
              {envioWifi ? 'Enviando por Wi-Fi…' : '▶ Ejecutar por Wi-Fi'}
            </button>
            <button type="button" onClick={accion(() => backend.detenerPrograma())} disabled={!listo || !!envioWifi}>
              ■ Detener
            </button>
            <button type="button" onClick={() => ejecutar(true)} disabled={!listo || !resultado.bytes || !!envioWifi} title="Guarda el programa en la EEPROM: corre al encender">
              Guardar en la placa
            </button>
            <button type="button" onClick={accion(() => backend.borrarGuardado(), 'Programa guardado borrado.')} disabled={!listo || !!envioWifi}>
              Borrar de la placa
            </button>
            <span className="separador" />
            <div className="selector-vista" role="tablist" aria-label="Vista del programa">
              {VISTAS.map((v) => (
                <button key={v.valor} type="button" role="tab" aria-selected={vista === v.valor} onClick={() => elegirVista(v.valor)}>
                  {v.nombre}
                </button>
              ))}
            </div>
            {vista !== 'diagrama' && (
              <button type="button" onClick={formatear} title="Ordena la sangría y los espacios del código (Shift+Alt+F)">
                Formatear
              </button>
            )}
            <button
              type="button"
              aria-pressed={verGenerado}
              className={verGenerado ? 'activo' : undefined}
              onClick={alternarGenerado}
              title="Muestra el programa como sketch de Arduino y como bytecode"
            >
              {'</>'} Generado
            </button>
            <select value="" onChange={(e) => cargarEjemplo(e.target.value)} aria-label="Ejemplos">
              <option value="">Ejemplos...</option>
              {ejemplos.map((e, i) => (
                <option key={e.nombre} value={i}>
                  {e.nombre}
                </option>
              ))}
            </select>
            {resultado.bytes ? (
              <span className="chip chip-ok mono" title="Tamaño del programa compilado">
                {resultado.bytes.length}/{PROG_MAX} bytes
              </span>
            ) : (
              <span className="chip chip-error">Con errores</span>
            )}
          </div>
          {textoError && (
            <div className="aviso aviso-error" role="alert">
              <span>{textoError}</span>
            </div>
          )}
          {envioWifi && <p className="aviso" role="status">{envioWifi}</p>}
          {aviso && (
            <div className={aviso.tipo === 'ok' ? 'aviso aviso-ok' : 'aviso aviso-error'} role="status">
              <span>{aviso.texto}</span>
              <button type="button" className="boton-icono" onClick={() => setAviso(null)} aria-label="Cerrar aviso">
                ×
              </button>
            </div>
          )}
          <div className={`editor editor-${vista}${verGenerado ? ' con-generado' : ''}`}>
            {vista !== 'codigo' && (
              <Diagrama
                grafo={proyecto.grafo}
                version={proyecto.versionGrafo}
                onCambio={proyecto.cambiarGrafo}
                error={proyecto.editado === 'diagrama' ? resultado.error : null}
                sueltos={resultado.sueltos}
              />
            )}
            {vista !== 'diagrama' && (
              <EditorCodigo
                valor={proyecto.codigo}
                onCambio={proyecto.cambiarCodigo}
                error={proyecto.editado === 'codigo' ? resultado.error : null}
                onEjecutar={() => listo && ejecutar(false)}
                onFormatear={formatear}
              />
            )}
            {verGenerado && (
              <Generado
                programa={resultado.programa}
                bytes={resultado.bytes}
                variables={resultado.variables}
                onAviso={(tipo, texto) => {
                  setAviso({ tipo, texto })
                  if (tipo === 'error') anotar('Error: ' + texto)
                }}
              />
            )}
          </div>
        </section>

        <aside className="lateral">
          <Placa
            t={monitor}
            fuente={fuente}
            detalleFuente={!porUsb && wifi.error ? wifi.error : undefined}
            habilitado={listo}
            onLeds={(v) => backend.ponerLeds(v).catch(fallo)}
            onNumero={(n) => (n === null ? backend.apagarDisplays() : backend.ponerNumero(n)).catch(fallo)}
          />
          <section className="panel registro" aria-label="Registro">
            <header className="panel-titulo">
              <h2>Registro</h2>
              <button type="button" className="boton-texto" onClick={() => setRegistro([])}>
                Limpiar
              </button>
            </header>
            <div className="registro-lineas mono">
              {registro.length === 0 && <p className="nota">Aquí aparecen las conexiones y las cargas de programas.</p>}
              {registro.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
              <div ref={finRegistro} />
            </div>
          </section>
        </aside>
      </main>

      {verFirmware && (
        <Firmware
          puerto={puerto}
          conexion={conexion}
          onCerrar={() => setVerFirmware(false)}
          onGrabado={() => {
            setConexion({ conectado: false })
            setTelemetria(null)
          }}
          onRegistro={anotar}
        />
      )}
      {verAjustes && (
        <Ajustes
          ajustes={ajustes}
          usaLcd={!!resultado.programa && usaLcd(resultado.programa)}
          puedeAplicar={listo && !!resultado.bytes}
          onCambiar={cambiarAjustes}
          onAplicar={() => ejecutar(false)}
          onCerrar={() => setVerAjustes(false)}
        />
      )}
      {verNube && <Nube conexion={conexion} onCerrar={() => setVerNube(false)} />}
    </div>
  )
}
