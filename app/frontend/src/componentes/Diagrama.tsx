// Diagrama de nodos (React Flow) sobre el modelo Grafo de la libreria del lenguaje.
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ANCHO_NODO,
  NODOS,
  SANGRIA_X,
  altoNodo,
  idArista,
  nuevoNodo,
  ordenar,
  type ErrorLenguaje,
  type Grafo,
  type Salida,
  type TipoNodo,
} from '@entrenador/lenguaje'

type DatosNodo = {
  tipo: TipoNodo
  campos: Record<string, string>
  error?: string
  campoError?: string
  suelto?: boolean
}
type NodoRF = Node<DatosNodo, 'instruccion'>

const COLORES: Record<string, string> = {
  inicio: '#3ecf8e',
  control: '#e0a33a',
  salidas: '#ef5b4c',
  datos: '#a371f7',
  notas: '#768390',
}

const color = (tipo: TipoNodo) => (tipo === 'inicio' ? COLORES.inicio : COLORES[NODOS[tipo].categoria])

const ETIQUETAS_RAMA: Record<Salida, string> = { sig: '', cuerpo: 'cuerpo', entonces: 'entonces', sino: 'sino' }

const CambiarCampo = createContext<(id: string, campo: string, valor: string) => void>(() => {})

// ---- Conversion Grafo <-> React Flow ----

function arista(origen: string, salida: Salida, destino: string): Edge {
  return {
    id: `${idArista(origen, salida)}:${destino}`,
    source: origen,
    sourceHandle: salida,
    target: destino,
    targetHandle: 'entrada',
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  }
}

function aRF(g: Grafo): { nodos: NodoRF[]; aristas: Edge[] } {
  return {
    nodos: g.nodos.map((n) => ({
      id: n.id,
      type: 'instruccion',
      position: { x: n.x, y: n.y },
      data: { tipo: n.tipo, campos: { ...n.campos } },
      deletable: n.tipo !== 'inicio',
    })),
    aristas: g.aristas.map((a) => arista(a.origen, a.salida, a.destino)),
  }
}

function deRF(nodos: NodoRF[], aristas: Edge[]): Grafo {
  return {
    nodos: nodos.map((n) => ({ id: n.id, tipo: n.data.tipo, campos: n.data.campos, x: Math.round(n.position.x), y: Math.round(n.position.y) })),
    aristas: aristas.map((a) => ({ id: a.id, origen: a.source, salida: a.sourceHandle as Salida, destino: a.target })),
  }
}

// ---- Nodo ----

const NodoInstruccion = memo(function NodoInstruccion({ id, data, selected }: NodeProps<NodoRF>) {
  const def = NODOS[data.tipo]
  const cambiar = useContext(CambiarCampo)
  const [primera, segunda] = def.ramas
  const clases = ['nodo', selected && 'nodo-sel', data.error && 'nodo-con-error', data.suelto && 'nodo-suelto'].filter(Boolean).join(' ')

  return (
    <div className={clases} style={{ width: ANCHO_NODO, minHeight: altoNodo(data.tipo), ['--color' as string]: color(data.tipo) }} title={def.ayuda}>
      {def.entrada && <Handle type="target" position={Position.Top} id="entrada" style={{ left: 16 }} />}
      <div className="nodo-titulo">{def.titulo}</div>
      {def.campos.length > 0 && (
        <div className="nodo-campos">
          {def.campos.map((c) => (
            <label key={c.nombre} className={data.campoError === c.nombre ? 'nodo-campo campo-error' : 'nodo-campo'}>
              <span>{c.etiqueta}</span>
              {c.tipo === 'opcion' ? (
                <select className="nodrag" value={data.campos[c.nombre] ?? c.inicial} onChange={(e) => cambiar(id, c.nombre, e.target.value)}>
                  {c.opciones!.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={c.tipo === 'texto' ? 'nodrag' : 'nodrag mono'}
                  value={data.campos[c.nombre] ?? ''}
                  spellCheck={false}
                  placeholder={c.tipo === 'texto' ? '' : c.inicial}
                  onChange={(e) => cambiar(id, c.nombre, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
      )}
      {primera && (
        <div className="nodo-ramas">
          <span style={{ marginLeft: SANGRIA_X - 4 }}>{ETIQUETAS_RAMA[primera]} ↓</span>
          {segunda && <span>{ETIQUETAS_RAMA[segunda]} →</span>}
        </div>
      )}
      {data.error && <div className="nodo-error">{data.error}</div>}
      {def.siguiente && <Handle type="source" position={Position.Bottom} id="sig" style={{ left: 16 }} />}
      {primera && <Handle type="source" position={Position.Bottom} id={primera} className="handle-rama" style={{ left: SANGRIA_X + 16 }} />}
      {segunda && <Handle type="source" position={Position.Right} id={segunda} className="handle-rama" style={{ top: 'auto', bottom: 14 }} />}
    </div>
  )
})

const tiposNodo = { instruccion: NodoInstruccion }

// ---- Paleta ----

const CATEGORIAS: { nombre: string; categoria: string; tipos: TipoNodo[] }[] = [
  { nombre: 'Salidas', categoria: 'salidas', tipos: ['mostrar', 'leds', 'led', 'apagar_displays'] },
  { nombre: 'Control', categoria: 'control', tipos: ['esperar', 'si', 'repetir', 'mientras', 'siempre', 'romper', 'continuar', 'detener'] },
  { nombre: 'Datos', categoria: 'datos', tipos: ['asignar', 'llamada'] },
  { nombre: 'Notas', categoria: 'notas', tipos: ['comentario'] },
]

function Paleta({ onAgregar }: { onAgregar: (tipo: TipoNodo) => void }) {
  const arrastrar = (e: DragEvent, tipo: TipoNodo) => {
    e.dataTransfer.setData('application/x-nodo', tipo)
    e.dataTransfer.effectAllowed = 'copy'
  }
  return (
    <nav className="paleta" aria-label="Nodos">
      {CATEGORIAS.map((c) => (
        <section key={c.nombre}>
          <h3>{c.nombre}</h3>
          {c.tipos.map((t) => (
            <button
              key={t}
              type="button"
              draggable
              onDragStart={(e) => arrastrar(e, t)}
              onClick={() => onAgregar(t)}
              title={NODOS[t].ayuda + ' (clic: agregar después del nodo elegido; o arrastrar)'}
              style={{ ['--color' as string]: COLORES[c.categoria] }}
            >
              {NODOS[t].titulo}
            </button>
          ))}
        </section>
      ))}
    </nav>
  )
}

// ---- Diagrama ----

interface Props {
  grafo: Grafo
  // Cambia cuando el grafo se reemplaza desde fuera; entonces se recarga y se encuadra
  version: number
  onCambio: (g: Grafo, estructural: boolean) => void
  error: ErrorLenguaje | null
  sueltos: string[]
}

function DiagramaInterno({ grafo, version, onCambio, error, sueltos }: Props) {
  const flujo = useReactFlow()
  const [nodos, setNodos] = useState<NodoRF[]>(() => aRF(grafo).nodos)
  const [aristas, setAristas] = useState<Edge[]>(() => aRF(grafo).aristas)
  // Cambio local pendiente de avisar al proyecto
  const pendiente = useRef<{ estructural: boolean } | null>(null)
  const versionCargada = useRef(version)

  // Encuadra todo si se lee bien; si el programa es largo, muestra el comienzo a un zoom legible
  const encuadrar = useCallback(
    (duracion = 0) => {
      const caja = document.querySelector('.diagrama .react-flow')?.getBoundingClientRect()
      const ns = flujo.getNodes()
      if (!caja || ns.length === 0) return
      const limites = flujo.getNodesBounds(ns)
      const zoomTodo = Math.min(caja.width / (limites.width + 80), caja.height / (limites.height + 80), 1)
      if (zoomTodo >= 0.75) {
        flujo.fitView({ padding: 0.1, maxZoom: 1, duration: duracion })
        return
      }
      const zoom = 0.85
      const x = Math.max(24, (caja.width - limites.width * zoom) / 2) - limites.x * zoom
      flujo.setViewport({ x, y: 24 - limites.y * zoom, zoom }, { duration: duracion })
    },
    [flujo],
  )

  const marcar = (estructural: boolean) => {
    pendiente.current = { estructural: estructural || !!pendiente.current?.estructural }
  }

  useEffect(() => {
    if (version === versionCargada.current) return
    versionCargada.current = version
    const rf = aRF(grafo)
    setNodos(rf.nodos)
    setAristas(rf.aristas)
    requestAnimationFrame(() => encuadrar())
  }, [version, grafo, encuadrar])

  useEffect(() => {
    if (!pendiente.current) return
    const { estructural } = pendiente.current
    pendiente.current = null
    onCambio(deRF(nodos, aristas), estructural)
  }, [nodos, aristas, onCambio])

  const aristasActuales = useRef(aristas)
  aristasActuales.current = aristas

  const alCambiarNodos = useCallback((cambios: NodeChange<NodoRF>[]) => {
    // Al borrar un nodo de una cadena, el anterior pasa a apuntar al siguiente
    const borrados = new Set(cambios.flatMap((c) => (c.type === 'remove' ? [c.id] : [])))
    const puentes: Edge[] = []
    for (const id of borrados) {
      const es = aristasActuales.current
      let entrada = es.find((a) => a.target === id)
      while (entrada && borrados.has(entrada.source)) entrada = es.find((a) => a.target === entrada!.source)
      let salida = es.find((a) => a.source === id && a.sourceHandle === 'sig')
      while (salida && borrados.has(salida.target)) {
        const t = salida.target
        salida = es.find((a) => a.source === t && a.sourceHandle === 'sig')
      }
      if (entrada && salida && !borrados.has(entrada.source) && !puentes.some((p) => p.source === entrada!.source && p.sourceHandle === entrada!.sourceHandle)) {
        puentes.push(arista(entrada.source, entrada.sourceHandle as Salida, salida.target))
      }
    }
    for (const c of cambios) {
      if (c.type === 'remove' || c.type === 'add') marcar(true)
      else if (c.type === 'position' && c.dragging === false) marcar(false)
    }
    setNodos((ns) => applyNodeChanges(cambios, ns))
    if (puentes.length) setAristas((es) => [...es, ...puentes])
  }, [])

  const alCambiarAristas = useCallback((cambios: EdgeChange[]) => {
    if (cambios.some((c) => c.type === 'remove' || c.type === 'add')) marcar(true)
    setAristas((es) => applyEdgeChanges(cambios, es))
  }, [])

  // Una salida va a un solo nodo y a cada nodo llega una sola flecha: reemplazar
  const alConectar = useCallback((c: Connection) => {
    if (!c.sourceHandle || c.source === c.target) return
    marcar(true)
    setAristas((es) => [
      ...es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle) && e.target !== c.target),
      arista(c.source, c.sourceHandle as Salida, c.target),
    ])
  }, [])

  const cambiarCampo = useCallback((id: string, campo: string, valor: string) => {
    marcar(true)
    setNodos((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, campos: { ...n.data.campos, [campo]: valor } } } : n)))
  }, [])

  const crear = (tipo: TipoNodo, x: number, y: number): NodoRF => {
    const n = nuevoNodo(tipo, `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, x, y)
    return { ...aRF({ nodos: [n], aristas: [] }).nodos[0], selected: true }
  }

  // Clic en la paleta: despues del nodo elegido (insertandolo en la cadena) o en el centro
  const agregar = (tipo: TipoNodo) => {
    const elegido = nodos.find((n) => n.selected)
    marcar(true)
    if (elegido && NODOS[elegido.data.tipo].siguiente) {
      const nuevo = crear(tipo, elegido.position.x, elegido.position.y + altoNodo(elegido.data.tipo) + 28)
      const siguiente = aristas.find((a) => a.source === elegido.id && a.sourceHandle === 'sig')
      setNodos((ns) => [...ns.map((n) => ({ ...n, selected: false })), nuevo])
      setAristas((es) => {
        const resto = es.filter((a) => a !== siguiente)
        const nuevas = [arista(elegido.id, 'sig', nuevo.id)]
        if (siguiente && NODOS[tipo].siguiente) nuevas.push(arista(nuevo.id, 'sig', siguiente.target))
        return [...resto, ...nuevas]
      })
      return
    }
    const caja = document.querySelector('.diagrama .react-flow')!.getBoundingClientRect()
    const centro = flujo.screenToFlowPosition({ x: caja.left + caja.width / 2, y: caja.top + caja.height / 3 })
    setNodos((ns) => [...ns.map((n) => ({ ...n, selected: false })), crear(tipo, centro.x - ANCHO_NODO / 2, centro.y)])
  }

  const alSoltar = (e: DragEvent) => {
    const tipo = e.dataTransfer.getData('application/x-nodo') as TipoNodo
    if (!NODOS[tipo]) return
    e.preventDefault()
    const p = flujo.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    marcar(true)
    setNodos((ns) => [...ns.map((n) => ({ ...n, selected: false })), crear(tipo, p.x - 20, p.y - 16)])
  }

  const acomodar = () => {
    const ordenado = ordenar(deRF(nodos, aristas))
    const posiciones = new Map(ordenado.nodos.map((n) => [n.id, { x: n.x, y: n.y }]))
    marcar(false)
    setNodos((ns) => ns.map((n) => ({ ...n, position: posiciones.get(n.id) ?? n.position })))
    requestAnimationFrame(() => encuadrar(300))
  }

  // Errores y nodos sueltos solo se dibujan; no forman parte del estado
  const nodosVista = useMemo(() => {
    const sueltosSet = new Set(sueltos)
    return nodos.map((n) => {
      const conError = error?.origen === n.id
      const suelto = sueltosSet.has(n.id)
      if (!conError && !suelto) return n
      return { ...n, data: { ...n.data, error: conError ? error!.message : undefined, campoError: conError ? error!.campo : undefined, suelto } }
    })
  }, [nodos, error, sueltos])

  return (
    <div className="diagrama">
      <Paleta onAgregar={agregar} />
      <CambiarCampo.Provider value={cambiarCampo}>
        <ReactFlow
          nodes={nodosVista}
          edges={aristas}
          nodeTypes={tiposNodo}
          onNodesChange={alCambiarNodos}
          onEdgesChange={alCambiarAristas}
          onConnect={alConectar}
          isValidConnection={(c) => c.source !== c.target}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={alSoltar}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          snapToGrid
          snapGrid={[8, 8]}
          onInit={() => requestAnimationFrame(() => encuadrar())}
          minZoom={0.3}
          maxZoom={1.8}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#2f3442" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable style={{ width: 140, height: 100 }} nodeColor={(n) => color((n as NodoRF).data.tipo)} maskColor="rgb(24 26 33 / 70%)" />
          <Panel position="top-right">
            <button type="button" onClick={acomodar} title="Acomodar los nodos conectados como un esquema">
              Ordenar
            </button>
          </Panel>
        </ReactFlow>
      </CambiarCampo.Provider>
    </div>
  )
}

export function Diagrama(props: Props) {
  return (
    <ReactFlowProvider>
      <DiagramaInterno {...props} />
    </ReactFlowProvider>
  )
}
