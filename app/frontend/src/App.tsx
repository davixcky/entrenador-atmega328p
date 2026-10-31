import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApagarDisplays,
  BorrarGuardado,
  CargarPrograma,
  Conectar,
  Desconectar,
  DetenerPrograma,
  ListarPuertos,
  PonerLeds,
  PonerNumero,
} from '../wailsjs/go/main/App'
import { main } from '../wailsjs/go/models'
import { EventsOn } from '../wailsjs/runtime/runtime'
import { ejemplos, lineaColumna, PROG_MAX } from '@entrenador/lenguaje'
import { useProyecto } from './proyecto'
import { Diagrama } from './componentes/Diagrama'
import { EditorCodigo } from './componentes/EditorCodigo'
import { Firmware } from './componentes/Firmware'
import { Generado } from './componentes/Generado'
import { Placa, Telemetria } from './componentes/Placa'

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
  const [puertos, setPuertos] = useState<main.Puerto[]>([])
  const [puerto, setPuerto] = useState('')
  const [conexion, setConexion] = useState<main.EstadoConexion>(new main.EstadoConexion({ conectado: false }))
  const [conectando, setConectando] = useState(false)
  const [telemetria, setTelemetria] = useState<Telemetria | null>(null)
  const [registro, setRegistro] = useState<string[]>([])
  const [aviso, setAviso] = useState<Aviso>(null)
  const [vista, setVista] = useState<Vista>(vistaGuardada)
  const [verFirmware, setVerFirmware] = useState(false)
  const [verGenerado, setVerGenerado] = useState(generadoGuardado)
  const proyecto = useProyecto()
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
      const lista = await ListarPuertos()
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
    const quitar = [
      EventsOn('telemetria', (t: Telemetria) => setTelemetria(t)),
      EventsOn('registro', (linea: string) => anotar(linea)),
      EventsOn('conexion', (e: main.EstadoConexion) => {
        setConexion(new main.EstadoConexion(e))
        if (!e.conectado) setTelemetria(null)
      }),
    ]
    return () => quitar.forEach((q) => q())
  }, [refrescarPuertos, anotar])

  useEffect(() => {
    finRegistro.current?.scrollIntoView({ block: 'end' })
  }, [registro])

  const conectar = async () => {
    if (!puerto) return
    setConectando(true)
    setAviso(null)
    try {
      const estado = await Conectar(puerto)
      setConexion(estado)
      if (estado.mensaje) setAviso({ tipo: 'error', texto: estado.mensaje })
    } catch (e) {
      fallo(e)
    } finally {
      setConectando(false)
    }
  }

  const desconectar = async () => {
    await Desconectar()
    setConexion(new main.EstadoConexion({ conectado: false }))
    setTelemetria(null)
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
    if (!bytes) return
    try {
      await CargarPrograma(bytes, guardar)
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

  const cargarEjemplo = (indice: string) => {
    const ejemplo = ejemplos[Number(indice)]
    if (!ejemplo) return
    if (!window.confirm(`¿Reemplazar el programa actual por "${ejemplo.nombre}"?`)) return
    proyecto.cargarCodigo(ejemplo.codigo)
  }

  const listo = conexion.conectado && conexion.entrenador

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
          <button type="button" className="boton-icono" onClick={refrescarPuertos} disabled={conexion.conectado} title="Buscar puertos" aria-label="Buscar puertos">
            ⟳
          </button>
          {conexion.conectado ? (
            <button type="button" onClick={desconectar}>
              Desconectar
            </button>
          ) : (
            <button type="button" className="primario" onClick={conectar} disabled={!puerto || conectando}>
              {conectando ? 'Conectando...' : 'Conectar'}
            </button>
          )}
          <span className={conexion.conectado ? 'chip chip-ok' : 'chip'}>Puente</span>
          <span className={listo ? 'chip chip-ok' : conexion.conectado ? 'chip chip-error' : 'chip'}>Entrenador</span>
          <button type="button" onClick={() => setVerFirmware(true)}>
            Firmware
          </button>
        </div>
      </header>

      <main className="cuerpo">
        <section className="area-programa">
          <div className="barra-programa">
            <button type="button" className="primario" onClick={() => ejecutar(false)} disabled={!listo || !resultado.bytes}>
              ▶ Ejecutar
            </button>
            <button type="button" onClick={accion(DetenerPrograma)} disabled={!listo}>
              ■ Detener
            </button>
            <button type="button" onClick={() => ejecutar(true)} disabled={!listo || !resultado.bytes} title="Guarda el programa en la EEPROM: corre al encender">
              Guardar en la placa
            </button>
            <button type="button" onClick={accion(BorrarGuardado, 'Programa guardado borrado.')} disabled={!listo}>
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
            t={telemetria}
            habilitado={listo}
            onLeds={(v) => PonerLeds(v).catch(fallo)}
            onNumero={(n) => (n === null ? ApagarDisplays() : PonerNumero(n)).catch(fallo)}
          />
          <section className="panel registro" aria-label="Registro">
            <header className="panel-titulo">
              <h2>Registro</h2>
              <button type="button" className="boton-texto" onClick={() => setRegistro([])}>
                Limpiar
              </button>
            </header>
            <div className="registro-lineas mono">
              {registro.length === 0 && <p className="nota">Conecta el Uno para empezar.</p>}
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
          onCerrar={() => setVerFirmware(false)}
          onGrabado={() => {
            setConexion(new main.EstadoConexion({ conectado: false }))
            setTelemetria(null)
          }}
        />
      )}
    </div>
  )
}
